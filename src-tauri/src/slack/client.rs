use anyhow::{anyhow, Result};
use chrono;
use futures;
use reqwest::{header, Client};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

use super::models::*;

const SLACK_API_BASE: &str = "https://slack.com/api";
const RATE_LIMIT_DELAY_MS: u64 = 20; // Further reduced for better performance
const MAX_CONCURRENT_REQUESTS: usize = 30; // Massively increased for 400+ message performance

#[derive(Clone)]
pub struct SlackClient {
    pub client: Client,
    token: String,
    rate_limiter: Arc<tokio::sync::Semaphore>,
}

impl SlackClient {
    pub fn new(token: String) -> Result<Self> {
        let mut headers = header::HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            header::HeaderValue::from_str(&format!("Bearer {}", token))?,
        );
        headers.insert(
            header::CONTENT_TYPE,
            header::HeaderValue::from_static("application/json"),
        );

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self {
            client,
            token,
            rate_limiter: Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_REQUESTS)),
        })
    }

    pub async fn search_messages(
        &self,
        query: &str,
        count: usize,
        page: usize,
    ) -> Result<SlackSearchResponse> {
        let url = format!("{}/search.messages", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("query", query.to_string());
        params.insert("count", count.to_string());
        params.insert("page", page.to_string());
        params.insert("sort", "timestamp".to_string());
        params.insert("sort_dir", "desc".to_string());

        info!(
            "Searching messages with query: '{}', page: {}, count: {}",
            query, page, count
        );

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Slack API HTTP error: {} - {}", status, text);

            // Provide more specific error messages
            if status == 401 {
                return Err(anyhow!(
                    "Authentication failed. Your Slack token may be invalid or expired."
                ));
            } else if status == 403 {
                return Err(anyhow!(
                    "Access denied. Your token may not have the required permissions for search."
                ));
            } else if status == 429 {
                return Err(anyhow!(
                    "Rate limit exceeded. Please wait a moment and try again."
                ));
            }

            return Err(anyhow!("Slack API error: {} - {}", status, text));
        }

        let response_text = response.text().await?;
        
        // Debug log the raw response to see what fields we're getting
        debug!("Raw Slack API response (first 1000 chars): {}", &response_text[..response_text.len().min(1000)]);
        
        let result: SlackSearchResponse = serde_json::from_str(&response_text)?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API returned error: {}", error_msg);

            // Provide more specific error messages based on Slack error codes
            if error_msg.contains("invalid_auth") {
                return Err(anyhow!(
                    "Invalid authentication token. Please check your Slack token in Settings."
                ));
            } else if error_msg.contains("token_revoked") {
                return Err(anyhow!(
                    "Your Slack token has been revoked. Please generate a new token."
                ));
            } else if error_msg.contains("not_in_channel") {
                return Err(anyhow!(
                    "You don't have access to search in the specified channel."
                ));
            } else if error_msg.contains("missing_scope") {
                return Err(anyhow!("Your token doesn't have the required permissions. Please ensure it has 'search:read' scope."));
            }

            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        debug!(
            "Search successful, found {} results",
            result.messages.as_ref().map(|m| m.total).unwrap_or(0)
        );
        Ok(result)
    }

    pub async fn get_thread(
        &self,
        channel_id: &str,
        thread_ts: &str,
    ) -> Result<SlackConversationsRepliesResponse> {
        let url = format!("{}/conversations.replies", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("channel", channel_id.to_string());
        params.insert("ts", thread_ts.to_string());
        params.insert("limit", "1000".to_string());

        info!(
            "[SlackClient] Getting thread for channel: {}, ts: {}, URL: {}, params: {:?}",
            channel_id, thread_ts, url, params
        );

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Slack API error: {} - {}", status, text);
            return Err(anyhow!("Slack API error: {} - {}", status, text));
        }

        let result: SlackConversationsRepliesResponse = response.json().await?;
        
        info!("[SlackClient] Thread API response: ok={}, messages_count={}", 
            result.ok, 
            result.messages.as_ref().map(|m| m.len()).unwrap_or(0)
        );

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API returned error: {}", error_msg);
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        // Log the response for debugging
        if let Some(ref messages) = result.messages {
            info!("[SlackClient] Thread API returned {} messages", messages.len());
            for (i, msg) in messages.iter().take(3).enumerate() {
                info!("  Message {}: ts={}, thread_ts={:?}", i, msg.ts, msg.thread_ts);
            }
        }
        
        info!("[SlackClient] Final thread response has {} messages",
            result.messages.as_ref().map(|m| m.len()).unwrap_or(0));

        Ok(result)
    }

    pub async fn get_user_info(&self, user_id: &str) -> Result<SlackUserInfo> {
        let url = format!("{}/users.info", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("user", user_id.to_string());

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to get user info: {}", response.status()));
        }

        let result: SlackUserInfoResponse = response.json().await?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        result.user.ok_or_else(|| anyhow!("User not found"))
    }

    pub async fn get_all_users(&self) -> Result<Vec<SlackUserInfo>> {
        let url = format!("{}/users.list", SLACK_API_BASE);

        let mut all_users = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut params = HashMap::new();
            params.insert("limit", "1000".to_string());

            if let Some(ref cursor_value) = cursor {
                params.insert("cursor", cursor_value.clone());
            }

            debug!("Fetching users page with cursor: {:?}", cursor);

            let response = self.client.get(&url).query(&params).send().await?;

            if !response.status().is_success() {
                return Err(anyhow!("Failed to get users: {}", response.status()));
            }

            let result: SlackUsersListResponse = response.json().await?;

            if !result.ok {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
                return Err(anyhow!("Slack API error: {}", error_msg));
            }

            if let Some(users) = result.members {
                all_users.extend(users);
            }

            // Check if there are more pages
            if let Some(metadata) = result.response_metadata {
                if let Some(next) = metadata.next_cursor {
                    if !next.is_empty() {
                        cursor = Some(next);
                        // Rate limiting
                        sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS)).await;
                        continue;
                    }
                }
            }

            break;
        }

        info!("Fetched {} users", all_users.len());
        Ok(all_users)
    }

    // Helper function to resolve channel name to ID
    pub async fn resolve_channel_id(&self, channel_name: &str) -> Result<String> {
        // If it already looks like a channel ID (starts with C, D, or G), return as-is
        if channel_name.starts_with('C') || channel_name.starts_with('D') || channel_name.starts_with('G') {
            return Ok(channel_name.to_string());
        }

        // Otherwise, fetch channel list and find the matching channel
        let channels = self.get_channels().await?;

        // Remove # prefix if present
        let clean_name = channel_name.trim_start_matches('#');

        for channel in channels {
            if channel.name.as_deref() == Some(clean_name) {
                return Ok(channel.id);
            }
        }

        Err(anyhow!("Channel '{}' not found", clean_name))
    }

    pub async fn get_channels(&self) -> Result<Vec<SlackConversation>> {
        let url = format!("{}/conversations.list", SLACK_API_BASE);

        let mut all_channels = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut params = HashMap::new();
            params.insert("types", "public_channel,private_channel".to_string());
            params.insert("limit", "1000".to_string());

            if let Some(ref cursor_value) = cursor {
                params.insert("cursor", cursor_value.clone());
            }

            let response = self.client.get(&url).query(&params).send().await?;

            if !response.status().is_success() {
                return Err(anyhow!("Failed to get channels: {}", response.status()));
            }

            let result: SlackConversationsListResponse = response.json().await?;

            if !result.ok {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
                return Err(anyhow!("Slack API error: {}", error_msg));
            }

            if let Some(channels) = result.channels {
                all_channels.extend(channels);
            }

            // Check if there are more pages
            if let Some(metadata) = result.response_metadata {
                if let Some(next) = metadata.next_cursor {
                    if !next.is_empty() {
                        cursor = Some(next);
                        // Rate limiting
                        sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS)).await;
                        continue;
                    }
                }
            }

            break;
        }

        Ok(all_channels)
    }

    /// Get DM channels (direct messages with individual users and groups)
    /// This is Phase 1-4: Read-only DM and MPIM channel discovery
    /// IMPORTANT: This requires im:read and mpim:read scopes in the Slack token
    /// Search for messages within a single DM or Group DM channel using conversations.history
    /// IMPORTANT: This uses conversations.history NOT search.messages for DMs/MPIMs
    /// Phase 2-4 implementation - conservative approach
    pub async fn search_dm_messages(
        &self,
        dm_id: &str,
        query: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SlackMessage>> {
        let url = format!("{}/conversations.history", SLACK_API_BASE);

        // Determine if it's a DM or Group DM
        let channel_type = if dm_id.starts_with("D") {
            "DM"
        } else if dm_id.starts_with("G") {
            "Group DM"
        } else {
            "Unknown"
        };

        info!(
            "Searching {} channel {} with query: {:?}, limit: {}",
            channel_type, dm_id, query, limit
        );

        let mut params = HashMap::new();
        params.insert("channel", dm_id.to_string());
        params.insert("limit", limit.min(100).to_string()); // Cap at 100 for safety

        // Conservative rate limiting for DM/MPIM search
        sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS * 2)).await;

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to search DM messages: {} - {}", status, text);

            if status == 403 {
                return Err(anyhow!(
                    "Permission denied. Your token needs 'im:history' and 'mpim:history' scopes to search DM/Group DM messages."
                ));
            }

            return Err(anyhow!("Failed to search DM/Group DM messages: {} - {}", status, text));
        }

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
        }

        let result: ConversationsHistoryResponse = response.json().await?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());

            if error_msg.contains("missing_scope") {
                return Err(anyhow!(
                    "Missing required scope. Your token needs 'im:history' permission to search DM messages."
                ));
            }

            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        let mut messages = result.messages.unwrap_or_default();

        // If a query is provided, filter messages locally (Phase 2 approach)
        if let Some(search_query) = query {
            let search_lower = search_query.to_lowercase();
            messages.retain(|msg| {
                msg.text.to_lowercase().contains(&search_lower)
            });

            info!(
                "Filtered DM messages: {} results match query '{}'",
                messages.len(),
                search_query
            );
        }

        info!(
            "Successfully retrieved {} messages from DM channel {}",
            messages.len(),
            dm_id
        );

        Ok(messages)
    }

    pub async fn get_dm_channels(&self) -> Result<Vec<SlackConversation>> {
        let url = format!("{}/conversations.list", SLACK_API_BASE);

        info!("Fetching DM and Group DM channels (Phase 1-4: Read-only)");

        let mut all_dms = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut params = HashMap::new();
            // Phase 4: Fetch both "im" (DM) and "mpim" (Group DM) channels
            params.insert("types", "im,mpim".to_string());
            params.insert("limit", "200".to_string()); // Smaller limit for DMs to be conservative

            if let Some(ref cursor_value) = cursor {
                params.insert("cursor", cursor_value.clone());
            }

            let response = self.client.get(&url).query(&params).send().await?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await?;
                error!("Failed to get DM channels: {} - {}", status, text);

                if status == 403 {
                    return Err(anyhow!(
                        "Permission denied. Your token needs 'im:read' scope to access DM channels."
                    ));
                }

                return Err(anyhow!("Failed to get DM channels: {} - {}", status, text));
            }

            let result: SlackConversationsListResponse = response.json().await?;

            if !result.ok {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());

                // Check for specific permission errors
                if error_msg.contains("missing_scope") {
                    return Err(anyhow!(
                        "Missing required scope. Your token needs 'im:read' permission to access DM channels."
                    ));
                }

                return Err(anyhow!("Slack API error: {}", error_msg));
            }

            if let Some(channels) = result.channels {
                // Filter to ensure we only get DM and Group DM channels (is_im = true or is_mpim = true)
                let dm_channels: Vec<SlackConversation> = channels
                    .into_iter()
                    .filter(|c| c.is_im.unwrap_or(false) || c.is_mpim.unwrap_or(false))
                    .collect();

                let im_count = dm_channels.iter().filter(|c| c.is_im.unwrap_or(false)).count();
                let mpim_count = dm_channels.iter().filter(|c| c.is_mpim.unwrap_or(false)).count();
                info!("Found {} DM and {} Group DM channels in this batch", im_count, mpim_count);
                all_dms.extend(dm_channels);
            }

            // Check if there are more pages
            if let Some(metadata) = result.response_metadata {
                if let Some(next) = metadata.next_cursor {
                    if !next.is_empty() {
                        cursor = Some(next);
                        // Rate limiting - be extra conservative with DM fetching
                        sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS * 2)).await;
                        continue;
                    }
                }
            }

            break;
        }

        let total_im = all_dms.iter().filter(|c| c.is_im.unwrap_or(false)).count();
        let total_mpim = all_dms.iter().filter(|c| c.is_mpim.unwrap_or(false)).count();
        info!("Successfully fetched {} DM and {} Group DM channels (total: {})",
              total_im, total_mpim, all_dms.len());
        Ok(all_dms)
    }

    pub async fn get_users(&self) -> Result<Vec<SlackUserInfo>> {
        let url = format!("{}/users.list", SLACK_API_BASE);

        let mut all_users = Vec::new();
        let mut cursor: Option<String> = None;

        loop {
            let mut params = HashMap::new();
            params.insert("limit", "1000".to_string());

            if let Some(ref cursor_value) = cursor {
                params.insert("cursor", cursor_value.clone());
            }

            let response = self.client.get(&url).query(&params).send().await?;

            if !response.status().is_success() {
                return Err(anyhow!("Failed to get users: {}", response.status()));
            }

            let result: SlackUsersListResponse = response.json().await?;

            if !result.ok {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
                return Err(anyhow!("Slack API error: {}", error_msg));
            }

            if let Some(users) = result.members {
                all_users.extend(users);
            }

            // Check if there are more pages
            if let Some(metadata) = result.response_metadata {
                if let Some(next) = metadata.next_cursor {
                    if !next.is_empty() {
                        cursor = Some(next);
                        // Rate limiting
                        sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS)).await;
                        continue;
                    }
                }
            }

            break;
        }

        Ok(all_users)
    }

    pub async fn get_channel_info(&self, channel_id: &str) -> Result<SlackConversation> {
        let url = format!("{}/conversations.info", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("channel", channel_id.to_string());

        debug!("Getting channel info for: {}", channel_id);

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            // Don't fail hard for channel info - it's not critical
            debug!("Failed to get channel info: {}", response.status());
            return Err(anyhow!("Failed to get channel info: {}", response.status()));
        }

        #[derive(Deserialize)]
        struct ChannelInfoResponse {
            ok: bool,
            channel: Option<SlackConversation>,
            error: Option<String>,
        }

        let result: ChannelInfoResponse = response.json().await?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            debug!("Slack API error for channel info: {}", error_msg);
            // Return a dummy channel with just the ID if we can't get the real info
            if error_msg.contains("channel_not_found") || error_msg.contains("missing_scope") {
                return Ok(SlackConversation {
                    id: channel_id.to_string(),
                    name: Some(channel_id.to_string()),
                    name_normalized: None,
                    is_channel: None,
                    is_group: None,
                    is_im: None,
                    is_mpim: None,
                    is_private: None,
                    user: None,
                });
            }
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        result.channel.ok_or_else(|| anyhow!("Channel not found"))
    }

    pub async fn get_channel_messages(
        &self,
        channel_id: &str,
        oldest: Option<String>,
        latest: Option<String>,
        limit: usize,
    ) -> Result<Vec<SlackMessage>> {
        let url = format!("{}/conversations.history", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("channel", channel_id.to_string());
        params.insert("limit", limit.to_string());
        params.insert("inclusive", "true".to_string());

        if let Some(oldest_ts) = oldest {
            params.insert("oldest", oldest_ts);
        }

        if let Some(latest_ts) = latest {
            params.insert("latest", latest_ts);
        }

        info!(
            "Getting channel messages for channel: {}, limit: {}",
            channel_id, limit
        );

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to get channel messages: {} - {}", status, text);
            return Err(anyhow!(
                "Failed to get channel messages: {} - {}",
                status,
                text
            ));
        }

        // Get response text
        let response_text = response.text().await?;

        // Debug: Log response size (but not the full content to avoid memory issues)
        debug!("API Response size: {} bytes", response_text.len());

        // Optional: Only enable this for debugging when needed
        // {
        //     use std::fs;
        //     let debug_file = "slack_response_debug.json";
        //     if let Err(e) = fs::write(debug_file, &response_text) {
        //         error!("Failed to write debug file: {}", e);
        //     } else {
        //         info!("API response saved to {} for debugging", debug_file);
        //     }
        // }

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
        }

        let result: ConversationsHistoryResponse = serde_json::from_str(&response_text)?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API error: {}", error_msg);
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        let messages = result.messages.unwrap_or_default();
        info!("Retrieved {} messages from conversations.history", messages.len());

        // Debug: Log sample of messages to understand their structure
        for (i, msg) in messages.iter().take(3).enumerate() {
            debug!(
                "Sample message {}: user={:?}, subtype={:?}, username={:?}, text_preview={:?}",
                i,
                msg.user,
                msg.subtype,
                msg.username,
                msg.text.chars().take(50).collect::<String>()
            );
        }

        Ok(messages)
    }

    pub async fn get_channel_messages_with_reactions(
        &self,
        channel_id: &str,
        oldest: Option<String>,
        latest: Option<String>,
        limit: usize,
    ) -> Result<Vec<SlackMessage>> {
        let url = format!("{}/conversations.history", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("channel", channel_id.to_string());
        params.insert("limit", limit.to_string());
        params.insert("inclusive", "true".to_string());
        // Include all metadata to get reactions
        params.insert("include_all_metadata", "true".to_string());

        if let Some(oldest_ts) = oldest {
            params.insert("oldest", oldest_ts);
        }

        if let Some(latest_ts) = latest {
            params.insert("latest", latest_ts);
        }

        info!(
            "Getting channel messages with reactions for channel: {}, limit: {}",
            channel_id, limit
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .query(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to get channel messages with reactions: {} - {}", status, text);
            return Err(anyhow!(
                "Failed to get channel messages with reactions: {} - {}",
                status,
                text
            ));
        }

        // Get response text
        let response_text = response.text().await?;

        // Debug: Log response size (but not the full content to avoid memory issues)
        debug!("API Response size: {} bytes", response_text.len());

        // Optional: Only enable this for debugging when needed
        // {
        //     use std::fs;
        //     let debug_file = "slack_response_debug.json";
        //     if let Err(e) = fs::write(debug_file, &response_text) {
        //         error!("Failed to write debug file: {}", e);
        //     } else {
        //         info!("API response saved to {} for debugging", debug_file);
        //     }
        // }

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
        }

        let result: ConversationsHistoryResponse = serde_json::from_str(&response_text)?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API error: {}", error_msg);
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        let messages = result.messages.unwrap_or_default();
        
        // Debug logging to verify reactions are included
        for msg in &messages {
            if let Some(reactions) = &msg.reactions {
                info!(
                    "Message {} has {} reactions",
                    msg.ts,
                    reactions.len()
                );
                for reaction in reactions {
                    debug!("  Reaction: {} (count: {})", reaction.name, reaction.count);
                }
            }
        }

        Ok(messages)
    }

    pub async fn test_auth(&self) -> Result<(bool, Option<String>)> {
        let url = format!("{}/auth.test", SLACK_API_BASE);

        info!("Testing Slack authentication");

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            error!("Auth test failed with status: {}", response.status());
            return Ok((false, None));
        }

        #[derive(Deserialize)]
        struct AuthTestResponse {
            ok: bool,
            #[serde(default)]
            error: Option<String>,
            #[serde(default)]
            user_id: Option<String>,
        }

        let result: AuthTestResponse = response.json().await?;

        if result.ok {
            info!("Slack authentication successful, user_id: {:?}", result.user_id);
        } else {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack auth test failed: {}", error_msg);
        }

        Ok((result.ok, result.user_id))
    }

    /// Check if the token has specific scopes/permissions
    /// Returns (is_authorized, scopes_list)
    pub async fn check_token_scopes(&self) -> Result<(bool, Vec<String>)> {
        let url = format!("{}/auth.test", SLACK_API_BASE);

        info!("Checking Slack token scopes/permissions");

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            error!("Failed to check token scopes with status: {}", response.status());
            return Ok((false, Vec::new()));
        }

        // Note: auth.test doesn't return scopes directly
        // We'll need to use conversations.list with im type to test im:read permission
        // For now, we'll return a basic check
        #[derive(Deserialize)]
        struct AuthTestResponse {
            ok: bool,
            #[serde(default)]
            error: Option<String>,
        }

        let result: AuthTestResponse = response.json().await?;

        if result.ok {
            info!("Token is valid, checking im:read scope by attempting to list DMs");
            // The actual scope check will happen when we try to list DMs
            // If it fails with missing_scope, we know we don't have im:read
            Ok((true, Vec::new()))
        } else {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Token validation failed: {}", error_msg);
            Ok((false, Vec::new()))
        }
    }

    pub async fn add_reaction(&self, channel: &str, timestamp: &str, emoji: &str) -> Result<()> {
        let _ = self.rate_limiter.acquire().await;

        let url = format!("{}/reactions.add", SLACK_API_BASE);
        let params = serde_json::json!({
            "channel": channel,
            "timestamp": timestamp,
            "name": emoji
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Failed to add reaction: {}", error_text));
        }

        let result: serde_json::Value = response.json().await?;
        if let Some(ok) = result.get("ok").and_then(|v| v.as_bool()) {
            if !ok {
                let error_msg = result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                return Err(anyhow::anyhow!("Slack API error: {}", error_msg));
            }
        }

        Ok(())
    }

    pub async fn remove_reaction(&self, channel: &str, timestamp: &str, emoji: &str) -> Result<()> {
        let _ = self.rate_limiter.acquire().await;

        let url = format!("{}/reactions.remove", SLACK_API_BASE);
        let params = serde_json::json!({
            "channel": channel,
            "timestamp": timestamp,
            "name": emoji
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Failed to remove reaction: {}", error_text));
        }

        let result: serde_json::Value = response.json().await?;
        if let Some(ok) = result.get("ok").and_then(|v| v.as_bool()) {
            if !ok {
                let error_msg = result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                return Err(anyhow::anyhow!("Slack API error: {}", error_msg));
            }
        }

        Ok(())
    }

    pub async fn get_reactions(
        &self,
        channel: &str,
        timestamp: &str,
    ) -> Result<Vec<SlackReaction>> {
        let _ = self.rate_limiter.acquire().await;

        let url = format!("{}/reactions.get", SLACK_API_BASE);
        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .query(&[
                ("channel", channel),
                ("timestamp", timestamp),
                ("full", "true"),
            ])
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            // Handle rate limiting specifically
            if status == 429 {
                // Wait a bit and return empty to avoid cascading failures
                sleep(Duration::from_millis(100)).await;
                return Ok(vec![]);
            }
            return Err(anyhow::anyhow!("Failed to get reactions: {}", error_text));
        }

        let result: serde_json::Value = response.json().await?;
        if let Some(ok) = result.get("ok").and_then(|v| v.as_bool()) {
            if !ok {
                let error_msg = result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                // Handle "no_reaction" as normal case - message has no reactions
                if error_msg.contains("no_reaction") {
                    return Ok(vec![]);
                }
                return Err(anyhow::anyhow!("Slack API error: {}", error_msg));
            }
        }

        let reactions = result
            .get("message")
            .and_then(|msg| msg.get("reactions"))
            .and_then(|r| serde_json::from_value::<Vec<SlackReaction>>(r.clone()).ok())
            .unwrap_or_default();

        Ok(reactions)
    }

    /// Post a message to a Slack channel
    pub async fn post_message(
        &self,
        channel: &str,
        text: &str,
        thread_ts: Option<&str>,
    ) -> Result<crate::slack::models::PostMessageResponse> {
        let _permit = self.rate_limiter.acquire().await?;
        let url = format!("{}/chat.postMessage", SLACK_API_BASE);

        info!("Posting message to channel: {}", channel);

        let mut body = serde_json::json!({
            "channel": channel,
            "text": text
        });

        if let Some(ts) = thread_ts {
            body["thread_ts"] = serde_json::json!(ts);
        }

        let response = self.client.post(&url).json(&body).send().await?;

        let status = response.status();
        let response_text = response.text().await?;

        if !status.is_success() {
            error!(
                "Failed to post message. Status: {}, Response: {}",
                status, response_text
            );
            return Err(anyhow::anyhow!("Failed to post message: {}", response_text));
        }

        let result: crate::slack::models::PostMessageResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                error!("Failed to parse post message response: {}", e);
                error!("Response text: {}", response_text);
                anyhow::anyhow!("Failed to parse response: {}", e)
            })?;

        if result.ok {
            info!("Successfully posted message to channel: {}", channel);
        } else {
            let error_msg = result
                .error
                .clone()
                .unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API error: {}", error_msg);
            return Err(anyhow::anyhow!("Slack API error: {}", error_msg));
        }

        Ok(result)
    }

    /// Post a message to a Slack channel with optional broadcast to channel for thread replies
    pub async fn post_message_with_broadcast(
        &self,
        channel: &str,
        text: &str,
        thread_ts: Option<&str>,
        reply_broadcast: bool,
    ) -> Result<crate::slack::models::PostMessageResponse> {
        let _permit = self.rate_limiter.acquire().await?;
        let url = format!("{}/chat.postMessage", SLACK_API_BASE);

        info!("Posting message to channel: {} (broadcast: {})", channel, reply_broadcast);

        let mut body = serde_json::json!({
            "channel": channel,
            "text": text
        });

        if let Some(ts) = thread_ts {
            body["thread_ts"] = serde_json::json!(ts);
            // Add reply_broadcast parameter when posting to a thread
            if reply_broadcast {
                body["reply_broadcast"] = serde_json::json!(true);
            }
        }

        let response = self.client.post(&url).json(&body).send().await?;

        let status = response.status();
        let response_text = response.text().await?;

        if !status.is_success() {
            error!(
                "Failed to post message. Status: {}, Response: {}",
                status, response_text
            );
            return Err(anyhow::anyhow!("Failed to post message: {}", response_text));
        }

        let result: crate::slack::models::PostMessageResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                error!("Failed to parse post message response: {}", e);
                error!("Response text: {}", response_text);
                anyhow::anyhow!("Failed to parse response: {}", e)
            })?;

        if result.ok {
            info!("Successfully posted message to channel: {}", channel);
        } else {
            let error_msg = result
                .error
                .clone()
                .unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API error: {}", error_msg);
            return Err(anyhow::anyhow!("Slack API error: {}", error_msg));
        }

        Ok(result)
    }

    pub async fn get_emoji_list(&self) -> Result<HashMap<String, String>> {
        let url = format!("{}/emoji.list", SLACK_API_BASE);
        
        debug!("Fetching emoji list from Slack");
        
        let response = self.client.get(&url).send().await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Slack API error when fetching emojis: {} - {}", status, text);
            
            if status == 401 {
                return Err(anyhow!(
                    "Authentication failed. Your Slack token may be invalid or expired."
                ));
            } else if status == 403 {
                return Err(anyhow!(
                    "Access denied. Your token may not have the required permissions for emoji.list."
                ));
            }
            
            return Err(anyhow!("Slack API error: {} - {}", status, text));
        }
        
        #[derive(Deserialize)]
        struct EmojiListResponse {
            ok: bool,
            emoji: Option<HashMap<String, String>>,
            error: Option<String>,
        }
        
        let result: EmojiListResponse = response.json().await?;
        
        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API returned error for emoji.list: {}", error_msg);
            
            if error_msg.contains("invalid_auth") {
                return Err(anyhow!(
                    "Invalid authentication token. Please check your Slack token in Settings."
                ));
            } else if error_msg.contains("missing_scope") {
                return Err(anyhow!(
                    "Your token doesn't have the required permissions. Please ensure it has 'emoji:read' scope."
                ));
            }
            
            return Err(anyhow!("Slack API error: {}", error_msg));
        }
        
        let emoji_map = result.emoji.unwrap_or_default();
        info!("Successfully fetched {} emojis", emoji_map.len());
        
        Ok(emoji_map)
    }
}

// Helper functions for building search queries
pub fn build_search_query(params: &SearchRequest) -> String {
    let mut query_parts = Vec::new();
    let has_text_query = !params.query.trim().is_empty();

    // Only add the query if it's not empty
    if has_text_query {
        query_parts.push(params.query.clone());
    }

    // Add channel filter - handle different channel types
    // Note: Slack doesn't support OR for channels in a single query
    // For multi-channel search, we'll need to handle this differently
    if let Some(channel) = &params.channel {
        if !channel.contains(',') {
            // Single channel search
            let clean_channel = if channel.starts_with("👥") {
                // This is a Group DM display name with emoji prefix - extract the channel ID
                // The frontend should pass the channel ID separately, but as a fallback,
                // we'll log an error since we can't extract the ID from the display name alone
                error!("Group DM channel passed with emoji prefix '{}' - cannot extract channel ID from display name", channel);
                return "INVALID_GROUP_DM_CHANNEL".to_string();
            } else if (channel.starts_with("D") || channel.starts_with("G")) && channel.len() > 8 {
                // This is a DM (D...) or Group DM (G...) channel ID - use it directly
                let channel_type = if channel.starts_with("D") { "DM" } else { "Group DM" };
                info!("Using {} channel ID directly: '{}'", channel_type, channel);
                channel.trim().to_string()
            } else if channel.starts_with('@') {
                // This is a DM display name (e.g., @murayama) - need to find the actual channel ID
                // For now, we'll log a warning and use it as-is
                // The frontend should be passing the channel ID, not the display name
                warn!("DM channel passed as display name '{}' - should be using channel ID", channel);
                channel.trim().to_string()
            } else {
                // Regular channel - remove # if present
                channel.trim_start_matches('#').trim().to_string()
            };

            if !clean_channel.is_empty() {
                info!("Adding channel filter for: '{}'", clean_channel);
                query_parts.push(format!("in:{}", clean_channel));
            }
        } else {
            warn!("Multi-channel parameter detected in build_search_query: '{}' - this should be handled at a higher level", channel);
        }
        // For multi-channel search, we'll handle it at a higher level
        // by making multiple searches and combining results
    }

    // Add user filter - handle both user IDs and usernames
    // IMPORTANT: When both channel and user are specified, we'll use conversations.history
    // instead of search.messages to avoid API limitations with private channels
    if let Some(user) = &params.user {
        // If we have both channel and user, return special flag for conversations.history
        if params.channel.is_some() && !params.channel.as_ref().unwrap().contains(',') {
            // Single channel + user case: use conversations.history
            info!("Channel and user both specified - will use conversations.history for better results");
            return "USE_CONVERSATIONS_HISTORY".to_string();
        }

        // Check if we have multiple users (comma-separated)
        if user.contains(',') {
            // Multiple users - DON'T add to query, will filter client-side
            info!("Multi-user search detected: '{}' - will filter client-side", user);
            // Don't add any user filter to the query
            // The search command will handle filtering by user IDs after fetching messages
        } else {
            // Single user - handle as before (this works with Slack API)
            let trimmed = user.trim();
            let clean_user = if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                // Remove <@...> brackets if present
                &trimmed[2..trimmed.len()-1]
            } else {
                // Just remove @ prefix
                trimmed.trim_start_matches('@')
            };
            if !clean_user.is_empty() {
                // Check if it's a user ID (starts with U and followed by alphanumeric)
                if clean_user.starts_with('U')
                    && clean_user.len() > 8
                    && clean_user.chars().skip(1).all(|c| c.is_alphanumeric())
                {
                    // For user IDs, use plain format (no brackets)
                    info!("Using user ID format for search: {}", clean_user);
                    query_parts.push(format!("from:{}", clean_user));
                } else {
                    // For usernames, use the plain format
                    info!("Using username format for search: {}", clean_user);
                    query_parts.push(format!("from:{}", clean_user));
                }
            }
        }
    }

    // Add date filters - Slack expects dates in YYYY-MM-DD format
    // IMPORTANT: Slack's "after:" is EXCLUSIVE (does not include the specified date)
    // So to include a date, we need to use the day before as the "after" value
    // Similarly, "before:" is EXCLUSIVE (does not include the specified date)
    // So to include a date, we need to use the day after as the "before" value
    if let Some(from) = &params.from_date {
        // Handle both ISO datetime (with T) and simple date (YYYY-MM-DD) formats
        let date_str = if from.contains('T') {
            // ISO datetime format - extract date part
            from.split('T').next().unwrap_or(from)
        } else {
            // Simple date format - use as is
            from.as_str()
        };

        // Parse the date
        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            if params.is_realtime.unwrap_or(false) {
                // For realtime/live mode: use yesterday as the "after" date to get today's messages
                // This ensures we only get messages from today (midnight onwards)
                let yesterday = date - chrono::Duration::days(1);
                let formatted_date = yesterday.format("%Y-%m-%d");
                info!(
                    "Realtime mode: using after:{} to get messages from {} onwards",
                    formatted_date, date_str
                );
                query_parts.push(format!("after:{}", formatted_date));

                // Also add a before filter for tomorrow to ensure we only get today's messages
                let tomorrow = date + chrono::Duration::days(1);
                let tomorrow_formatted = tomorrow.format("%Y-%m-%d");
                query_parts.push(format!("before:{}", tomorrow_formatted));
            } else {
                // For normal searches, subtract one day from the from_date
                // to make it inclusive (since "after:" is exclusive)
                let day_before = date - chrono::Duration::days(1);
                let formatted_date = day_before.format("%Y-%m-%d");
                info!(
                    "Normal search: using after:{} to include messages from {} onwards",
                    formatted_date, date_str
                );
                query_parts.push(format!("after:{}", formatted_date));
            };
        } else {
            // Fallback if parsing fails
            warn!("Failed to parse from_date '{}', using without adjustment", from);
            query_parts.push(format!("after:{}", from));
        }
    }

    // Don't add to_date filter if already added by realtime mode
    if let Some(to) = &params.to_date {
        // Skip if realtime mode already added a before filter
        if !params.is_realtime.unwrap_or(false) {
            // Handle both ISO datetime (with T) and simple date (YYYY-MM-DD) formats
            let date_str = if to.contains('T') {
                // ISO datetime format - extract date part
                to.split('T').next().unwrap_or(to)
            } else {
                // Simple date format - use as is
                to.as_str()
            };

            // Parse the date
            if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                // Add one day to make it inclusive (since "before:" is exclusive)
                let day_after = date + chrono::Duration::days(1);
                let formatted_date = day_after.format("%Y-%m-%d");
                info!(
                    "Using before:{} to include messages until {} (inclusive)",
                    formatted_date, date_str
                );
                query_parts.push(format!("before:{}", formatted_date));
            } else {
                // Fallback if parsing fails
                warn!("Failed to parse to_date '{}', using without adjustment", to);
                query_parts.push(format!("before:{}", to));
            }
        }
    }

    // Determine if we have filters
    let has_filters = params.channel.is_some()
        || params.user.is_some()
        || params.from_date.is_some()
        || params.to_date.is_some();

    // Build the final query
    // For filter-only searches, we need to be careful about how we construct the query
    let final_query = if !has_text_query && has_filters {
        // When we have filters but no text query, don't add wildcard
        // Instead, let the filters work on their own
        // The API should return all messages matching the filters
        query_parts.join(" ")
    } else if query_parts.is_empty() {
        // If absolutely no query parts at all, return empty to indicate
        // that we should use a different API method (conversations.history)
        "".to_string()
    } else {
        // Normal search with text query
        query_parts.join(" ")
    };

    info!("Built search query: {}", final_query);
    final_query
}

// Pagination helper with parallel fetching
pub async fn fetch_all_results(
    client: &SlackClient,
    query: String,
    max_results: usize,
) -> Result<Vec<SlackMessage>> {
    let start_time = Instant::now();
    let per_page = 100;

    info!("Starting parallel search for query: {}", query);

    // First, get the initial page to determine total results
    let initial_response = client.search_messages(&query, per_page, 1).await?;

    if initial_response.messages.is_none() {
        return Ok(vec![]);
    }

    let messages_data = initial_response.messages.unwrap();
    let total_available = messages_data.total.min(max_results);
    let mut all_messages = messages_data.matches;

    if all_messages.len() >= total_available {
        info!("All results fetched in first page: {}", all_messages.len());
        return Ok(all_messages);
    }

    // Calculate how many pages we need
    let pages_needed = ((total_available.min(max_results) - 1) / per_page) + 1;
    let remaining_pages = pages_needed.saturating_sub(1); // We already fetched page 1

    if remaining_pages > 0 {
        info!(
            "Fetching {} additional pages in parallel",
            remaining_pages.min(MAX_CONCURRENT_REQUESTS)
        );

        // Create client Arc for parallel requests
        let client_arc = Arc::new(client.clone());

        // Process pages in batches to respect rate limits
        let mut current_page = 2;
        while current_page <= pages_needed {
            let batch_end = (current_page + MAX_CONCURRENT_REQUESTS - 1).min(pages_needed);
            let batch_futures = (current_page..=batch_end).map(|page| {
                let client = Arc::clone(&client_arc);
                let query = query.clone();

                async move {
                    debug!("Fetching page {}", page);
                    match client.search_messages(&query, per_page, page).await {
                        Ok(response) => {
                            if let Some(messages) = response.messages {
                                info!("Page {} returned {} results", page, messages.matches.len());
                                Ok::<Vec<SlackMessage>, anyhow::Error>(messages.matches)
                            } else {
                                Ok::<Vec<SlackMessage>, anyhow::Error>(vec![])
                            }
                        }
                        Err(e) => {
                            error!("Failed to fetch page {}: {}", page, e);
                            Ok::<Vec<SlackMessage>, anyhow::Error>(vec![]) // Continue with other pages
                        }
                    }
                }
            });

            // Execute batch in parallel
            let batch_results = futures::future::join_all(batch_futures).await;

            // Collect results
            for result in batch_results {
                if let Ok(messages) = result {
                    all_messages.extend(messages);

                    // Check if we've reached the limit
                    if all_messages.len() >= max_results {
                        break;
                    }
                }
            }

            current_page = batch_end + 1;

            // Rate limit protection between batches
            if current_page <= pages_needed {
                sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS)).await;
            }
        }
    }

    // Truncate to max_results if necessary
    if all_messages.len() > max_results {
        all_messages.truncate(max_results);
    }

    let elapsed = start_time.elapsed();
    info!(
        "Parallel search completed: {} results in {:.2}s (speedup from parallel fetching)",
        all_messages.len(),
        elapsed.as_secs_f64()
    );

    Ok(all_messages)
}
