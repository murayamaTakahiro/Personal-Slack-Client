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

            // Handle user_not_found error for external users
            if error_msg.contains("user_not_found") {
                // Return a synthetic user info for external users
                debug!("User {} not found - likely an external workspace user", user_id);
                return Ok(SlackUserInfo {
                    id: user_id.to_string(),
                    name: format!("external-{}", user_id),
                    real_name: Some(format!("[External User]")),
                    is_bot: Some(false),
                    deleted: Some(false),
                    profile: Some(SlackUserProfile {
                        display_name: Some(format!("External User ({})", &user_id[..6.min(user_id.len())])),
                        real_name: Some("External User".to_string()),
                        image_48: None,
                        image_72: None,
                    }),
                });
            }

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
        // Acquire semaphore permit for rate limiting
        let _permit = self.rate_limiter.acquire().await
            .map_err(|e| anyhow!("Failed to acquire rate limit permit: {}", e))?;

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

        // Small delay to prevent hitting rate limits
        // The semaphore already limits concurrent requests, but a small delay helps with burst prevention
        sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS)).await;

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

        // Log the response size for debugging
        let response_text = response.text().await?;
        info!("Conversations.history response size: {} bytes", response_text.len());

        // Log first 500 chars of response for debugging (to check structure)
        if response_text.len() > 0 {
            let preview = if response_text.len() > 500 {
                &response_text[..500]
            } else {
                &response_text
            };
            debug!("Response preview: {}", preview);
        }

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
            error_detail: Option<String>,
            response_metadata: Option<serde_json::Value>,
        }

        // Try to parse the response
        let result: ConversationsHistoryResponse = match serde_json::from_str(&response_text) {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to parse conversations.history response: {}", e);
                error!("Raw response was: {}", response_text);
                return Err(anyhow!("Failed to parse DM channel response: {}", e));
            }
        };

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            let error_detail = result.error_detail.unwrap_or_else(|| String::new());

            error!("Slack API returned error for DM {}: {} (detail: {})", dm_id, error_msg, error_detail);

            // Log response metadata if available
            if let Some(metadata) = result.response_metadata {
                error!("Response metadata: {:?}", metadata);
            }

            // Check for specific error conditions
            if error_msg.contains("missing_scope") {
                return Err(anyhow!(
                    "Missing required scope. Your token needs 'im:history' permission to search DM messages."
                ));
            }

            if error_msg.contains("channel_not_found") {
                error!("Channel not found error for {}", dm_id);
                return Err(anyhow!("DM channel {} not found or not accessible", dm_id));
            }

            if error_msg.contains("not_in_channel") {
                error!("User not in channel {} - this might be a cross-workspace DM", dm_id);
                // For cross-workspace DMs, we might need different handling
                // Return empty messages for now instead of error
                info!("Returning empty results for inaccessible DM channel {}", dm_id);
                return Ok(vec![]);
            }

            return Err(anyhow!("Slack API error for DM {}: {} {}", dm_id, error_msg, error_detail));
        }

        let mut messages = result.messages.unwrap_or_default();

        // Add channel information to each message for DMs
        // This is important so the UI can identify the channel properly
        for message in &mut messages {
            if message.channel.is_none() {
                message.channel = Some(SlackChannelInfo {
                    id: dm_id.to_string(),
                    name: dm_id.to_string(), // Will be resolved by the UI/cache
                });
            }
        }

        info!(
            "Retrieved {} messages from DM channel {} before filtering",
            messages.len(),
            dm_id
        );

        // If a query is provided, filter messages locally (Phase 2 approach)
        if let Some(search_query) = query {
            let search_lower = search_query.to_lowercase();
            let before_filter = messages.len();
            messages.retain(|msg| {
                msg.text.to_lowercase().contains(&search_lower)
            });

            info!(
                "Filtered DM messages: {} -> {} results match query '{}'",
                before_filter,
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
                    is_member: None,
                    is_muted: None,
                    is_archived: None,
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
        // Always use 200 per request for best pagination results
        let per_request_limit = 200;
        params.insert("limit", per_request_limit.to_string()); // Slack recommends 200 per request for pagination
        params.insert("inclusive", "true".to_string());

        info!("[DEBUG] Using limit {} per API request (total limit requested: {})", per_request_limit, limit);

        if let Some(ref oldest_ts) = oldest {
            params.insert("oldest", oldest_ts.clone());
            info!("[DEBUG] Setting oldest timestamp: {}", oldest_ts);
            // Convert to human-readable for debugging
            if let Ok(ts_float) = oldest_ts.parse::<f64>() {
                if let Some(dt) = chrono::DateTime::from_timestamp(ts_float as i64, 0) {
                    info!("[DEBUG] Oldest date: {} (JST: {})",
                        dt.format("%Y-%m-%d %H:%M:%S UTC"),
                        dt.with_timezone(&chrono::FixedOffset::east_opt(9 * 3600).unwrap()).format("%Y-%m-%d %H:%M:%S"));
                }
            }
        } else {
            info!("[DEBUG] No oldest timestamp specified - fetching ALL messages");
        }

        if let Some(ref latest_ts) = latest {
            params.insert("latest", latest_ts.clone());
            info!("[DEBUG] Setting latest timestamp: {}", latest_ts);
            // Convert to human-readable for debugging
            if let Ok(ts_float) = latest_ts.parse::<f64>() {
                if let Some(dt) = chrono::DateTime::from_timestamp(ts_float as i64, 0) {
                    info!("[DEBUG] Latest date: {} (JST: {})",
                        dt.format("%Y-%m-%d %H:%M:%S UTC"),
                        dt.with_timezone(&chrono::FixedOffset::east_opt(9 * 3600).unwrap()).format("%Y-%m-%d %H:%M:%S"));
                }
            }
        } else {
            info!("[DEBUG] No latest timestamp specified - fetching up to now");
        }

        info!(
            "Getting channel messages for channel: {}, limit: {}, date range: {:?} to {:?}",
            channel_id, limit, oldest, latest
        );

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
            has_more: Option<bool>,
            response_metadata: Option<ResponseMetadata>,
        }

        #[derive(Deserialize)]
        struct ResponseMetadata {
            next_cursor: Option<String>,
        }

        // Initialize variables for pagination
        let mut all_messages = Vec::new();
        let mut cursor: Option<String> = None;
        let mut total_api_calls = 0;

        loop {
            let mut current_params = params.clone();

            // Add cursor if we have one from previous iteration
            if let Some(ref cursor_str) = cursor {
                current_params.insert("cursor", cursor_str.clone());
            }

            total_api_calls += 1;
            info!("API call {} for conversations.history (cursor: {:?})", total_api_calls, cursor);

            let response = self.client.get(&url).query(&current_params).send().await?;

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

            let response_text = response.text().await?;
            debug!("API Response size: {} bytes", response_text.len());

            // Debug: Check if raw response contains reactions
            if response_text.contains("\"reactions\"") {
                info!("[REACTIONS DEBUG] Raw API response DOES contain reactions!");
            } else {
                info!("[REACTIONS DEBUG] Raw API response does NOT contain reactions");
            }

            let result: ConversationsHistoryResponse = serde_json::from_str(&response_text)?;

            if !result.ok {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
                error!("Slack API error: {}", error_msg);
                return Err(anyhow!("Slack API error: {}", error_msg));
            }

            let messages = result.messages.unwrap_or_default();
            info!("Retrieved {} messages in this batch (API call #{})", messages.len(), total_api_calls);

            // Debug: Log timestamps of first and last messages in batch
            if !messages.is_empty() {
                let first_ts = &messages.first().unwrap().ts;
                let last_ts = &messages.last().unwrap().ts;
                info!("[DEBUG] Batch timestamp range: {} to {}", first_ts, last_ts);

                // Convert timestamps to human-readable dates for debugging
                if let Ok(first_float) = first_ts.parse::<f64>() {
                    if let Some(dt) = chrono::DateTime::from_timestamp(first_float as i64, 0) {
                        info!("[DEBUG] First message date: {} (JST: {})",
                            dt.format("%Y-%m-%d %H:%M:%S UTC"),
                            dt.with_timezone(&chrono::FixedOffset::east_opt(9 * 3600).unwrap()).format("%Y-%m-%d %H:%M:%S"));
                    }
                }
                if let Ok(last_float) = last_ts.parse::<f64>() {
                    if let Some(dt) = chrono::DateTime::from_timestamp(last_float as i64, 0) {
                        info!("[DEBUG] Last message date: {} (JST: {})",
                            dt.format("%Y-%m-%d %H:%M:%S UTC"),
                            dt.with_timezone(&chrono::FixedOffset::east_opt(9 * 3600).unwrap()).format("%Y-%m-%d %H:%M:%S"));
                    }
                }
            }

            // Add messages to our collection
            all_messages.extend(messages);

            // Check if there are more messages to fetch
            let has_more = result.has_more.unwrap_or(false);
            cursor = result.response_metadata.and_then(|m| m.next_cursor).filter(|c| !c.is_empty());

            info!("Total messages so far: {}, has_more: {}, next_cursor: {:?}",
                all_messages.len(), has_more, cursor);

            // Break if no more messages or no cursor
            if !has_more || cursor.is_none() {
                break;
            }

            // Break if we've reached the requested limit
            if all_messages.len() >= limit {
                info!("Reached requested limit of {} messages (actual: {})", limit, all_messages.len());
                break;
            }

            // Safety limit to prevent infinite loops
            if total_api_calls > 10 {
                warn!("Reached maximum API call limit (10) for conversations.history");
                break;
            }
        }

        // Truncate to the requested limit if we got more
        if all_messages.len() > limit {
            info!("Truncating from {} to {} messages (requested limit)", all_messages.len(), limit);
            all_messages.truncate(limit);
        }

        info!("Retrieved total of {} messages from conversations.history in {} API calls",
            all_messages.len(), total_api_calls);

        // Debug: Log final message count and user breakdown
        if !all_messages.is_empty() {
            let mut user_counts: HashMap<String, usize> = HashMap::new();
            for msg in &all_messages {
                if let Some(ref user) = msg.user {
                    *user_counts.entry(user.clone()).or_insert(0) += 1;
                }
            }
            info!("[DEBUG] Message count by user:");
            for (user, count) in user_counts.iter().take(10) {
                info!("[DEBUG]   User {}: {} messages", user, count);
            }
            if user_counts.len() > 10 {
                info!("[DEBUG]   ... and {} more users", user_counts.len() - 10);
            }
        }

        // Debug: Log sample of messages to understand their structure
        for (i, msg) in all_messages.iter().take(3).enumerate() {
            debug!(
                "Sample message {}: user={:?}, subtype={:?}, username={:?}, text_preview={:?}, reply_count={:?}",
                i,
                msg.user,
                msg.subtype,
                msg.username,
                msg.text.chars().take(50).collect::<String>(),
                msg.reply_count
            );
        }

        // Fetch thread replies for each message that has them
        let mut messages_with_replies = Vec::new();
        for msg in &all_messages {
            messages_with_replies.push(msg.clone());

            // Check if message has thread replies
            if let Some(reply_count) = msg.reply_count {
                if reply_count > 0 {
                    info!("[DEBUG] Message {} has {} thread replies, fetching them...",
                        msg.ts, reply_count);

                    // Fetch thread replies
                    match self.get_thread_replies(channel_id, &msg.ts).await {
                        Ok(replies) => {
                            // Skip the first message as it's the parent message we already have
                            let thread_replies: Vec<SlackMessage> = replies.into_iter()
                                .skip(1)
                                .collect();

                            info!("[DEBUG] Retrieved {} thread replies", thread_replies.len());
                            messages_with_replies.extend(thread_replies);
                        }
                        Err(e) => {
                            warn!("[DEBUG] Failed to fetch thread replies: {}", e);
                        }
                    }
                }
            }
        }

        info!("[DEBUG] Total messages including thread replies: {} (was {} without replies)",
            messages_with_replies.len(), all_messages.len());

        // Sort messages by timestamp (newest first)
        messages_with_replies.sort_by(|a, b| {
            // Parse timestamps as floats for accurate comparison
            let ts_a = a.ts.parse::<f64>().unwrap_or(0.0);
            let ts_b = b.ts.parse::<f64>().unwrap_or(0.0);
            // Reverse order for newest first
            ts_b.partial_cmp(&ts_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        info!("[DEBUG] Messages sorted by timestamp (newest first)");

        Ok(messages_with_replies)
    }

    async fn get_thread_replies(&self, channel_id: &str, thread_ts: &str) -> Result<Vec<SlackMessage>> {
        let url = format!("{}/conversations.replies", SLACK_API_BASE);

        let mut params = HashMap::new();
        params.insert("channel", channel_id.to_string());
        params.insert("ts", thread_ts.to_string());
        params.insert("limit", "1000".to_string());

        info!("[DEBUG] Fetching thread replies for ts={}", thread_ts);

        let response = self.client.get(&url)
            .query(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            return Err(anyhow!("Failed to get thread replies: {} - {}", status, text));
        }

        let response_text = response.text().await?;

        #[derive(Deserialize)]
        struct ConversationsRepliesResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
        }

        let result: ConversationsRepliesResponse = serde_json::from_str(&response_text)?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        Ok(result.messages.unwrap_or_default())
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
        // Always use 200 per request for best pagination results
        let per_request_limit = 200;
        params.insert("limit", per_request_limit.to_string()); // Slack recommends 200 per request for pagination
        params.insert("inclusive", "true".to_string());

        info!("[DEBUG] Using limit {} per API request for reactions (total limit requested: {})", per_request_limit, limit);
        // NOTE: conversations.history DOES return reactions by default
        // There is no include_all_metadata parameter - removing it

        if let Some(oldest_ts) = oldest {
            params.insert("oldest", oldest_ts);
        }

        if let Some(latest_ts) = latest {
            params.insert("latest", latest_ts);
        }

        info!(
            "[REACTIONS DEBUG] Getting channel messages with reactions for channel: {}, limit: {}, include_all_metadata: true",
            channel_id, limit
        );

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
            has_more: Option<bool>,
            response_metadata: Option<ResponseMetadata>,
        }

        #[derive(Deserialize)]
        struct ResponseMetadata {
            next_cursor: Option<String>,
        }

        // Initialize variables for pagination
        let mut all_messages = Vec::new();
        let mut cursor: Option<String> = None;
        let mut total_api_calls = 0;

        loop {
            let mut current_params = params.clone();

            // Add cursor if we have one from previous iteration
            if let Some(ref cursor_str) = cursor {
                current_params.insert("cursor", cursor_str.clone());
            }

            total_api_calls += 1;
            info!("API call {} for conversations.history with reactions (cursor: {:?})",
                total_api_calls, cursor);

            let response = self
                .client
                .get(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .query(&current_params)
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

            let response_text = response.text().await?;
            debug!("API Response size: {} bytes", response_text.len());

            // Debug: Check if raw response contains reactions
            if response_text.contains("\"reactions\"") {
                info!("[REACTIONS DEBUG] Raw API response DOES contain reactions!");
            } else {
                info!("[REACTIONS DEBUG] Raw API response does NOT contain reactions");
            }

            let result: ConversationsHistoryResponse = serde_json::from_str(&response_text)?;

            if !result.ok {
                let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
                error!("Slack API error: {}", error_msg);
                return Err(anyhow!("Slack API error: {}", error_msg));
            }

            let messages = result.messages.unwrap_or_default();
            info!("Retrieved {} messages in this batch", messages.len());

            // Debug logging to verify reactions are included
            let messages_with_reactions = messages.iter().filter(|m| m.reactions.is_some()).count();
            info!("[REACTIONS DEBUG] Messages with reactions: {}/{}", messages_with_reactions, messages.len());

            for msg in &messages {
                if let Some(reactions) = &msg.reactions {
                    info!(
                        "[REACTIONS DEBUG] Message {} has {} reactions",
                        msg.ts,
                        reactions.len()
                    );
                    for reaction in reactions {
                        info!("  Reaction: {} (count: {})", reaction.name, reaction.count);
                    }
                }
            }

            // Add messages to our collection
            all_messages.extend(messages);

            // Check if there are more messages to fetch
            let has_more = result.has_more.unwrap_or(false);
            cursor = result.response_metadata.and_then(|m| m.next_cursor).filter(|c| !c.is_empty());

            info!("Total messages so far: {}, has_more: {}, next_cursor: {:?}",
                all_messages.len(), has_more, cursor);

            // Break if no more messages or no cursor
            if !has_more || cursor.is_none() {
                break;
            }

            // Break if we've reached the requested limit
            if all_messages.len() >= limit {
                info!("Reached requested limit of {} messages (actual: {})", limit, all_messages.len());
                break;
            }

            // Safety limit to prevent infinite loops
            if total_api_calls > 10 {
                warn!("Reached maximum API call limit (10) for conversations.history");
                break;
            }
        }

        // Truncate to the requested limit if we got more
        if all_messages.len() > limit {
            info!("Truncating from {} to {} messages (requested limit)", all_messages.len(), limit);
            all_messages.truncate(limit);
        }

        info!("Retrieved total of {} messages from conversations.history in {} API calls",
            all_messages.len(), total_api_calls);

        // PERFORMANCE FIX: conversations.history DOES return reactions!
        // We already have them, so we only need to fetch for messages that don't have them
        // (which should be none if the API is working correctly)
        let messages_without_reactions = all_messages.iter().filter(|m| m.reactions.is_none()).count();
        info!("[REACTIONS OPTIMIZATION] {} of {} messages need reaction fetch (should be 0!)",
              messages_without_reactions, all_messages.len());

        // Only fetch reactions if some are missing (shouldn't happen with modern API)
        if messages_without_reactions > 0 {
            info!("[REACTIONS FALLBACK] Some messages missing reactions, fetching separately...");

            use futures::future::join_all;
            use std::sync::Arc;

            // Process in batches to avoid overwhelming the API
            const REACTION_BATCH_SIZE: usize = 20; // Increased batch size
            let channel_id_arc = Arc::new(channel_id.to_string());

            for chunk_start in (0..all_messages.len()).step_by(REACTION_BATCH_SIZE) {
                let chunk_end = std::cmp::min(chunk_start + REACTION_BATCH_SIZE, all_messages.len());
                let chunk = &mut all_messages[chunk_start..chunk_end];

                // Prepare futures for parallel fetching
                let mut futures = Vec::new();
                let mut indices = Vec::new();

                for (i, msg) in chunk.iter().enumerate() {
                    // Only fetch if not already present
                    if msg.reactions.is_none() {
                        let client = self.clone();
                        let channel = channel_id_arc.clone();
                        let ts = msg.ts.clone();

                        futures.push(async move {
                            client.get_reactions(&channel, &ts).await
                        });
                        indices.push(i);
                    }
                }

                // Execute all futures in parallel
                if !futures.is_empty() {
                    let results = join_all(futures).await;

                    // Apply results
                    for (idx, result) in indices.iter().zip(results.iter()) {
                        match result {
                            Ok(reactions) if !reactions.is_empty() => {
                                debug!("[REACTIONS FALLBACK] Found {} reactions for message {}",
                                      reactions.len(), chunk[*idx].ts);
                                chunk[*idx].reactions = Some(reactions.clone());
                            }
                            Ok(_) => {
                                // No reactions
                            }
                            Err(e) => {
                                debug!("Failed to get reactions: {}", e);
                            }
                        }
                    }
                }

                // Reduced delay between batches
                if chunk_end < all_messages.len() {
                    sleep(Duration::from_millis(50)).await; // Reduced from 100ms
                }
            }
        } else {
            info!("[REACTIONS OPTIMIZATION] All reactions already included in API response!");
        }

        // Fetch thread replies for each message that has them
        let mut messages_with_replies = Vec::new();
        for msg in &all_messages {
            messages_with_replies.push(msg.clone());

            // Check if message has thread replies
            if let Some(reply_count) = msg.reply_count {
                if reply_count > 0 {
                    info!("[DEBUG] Message {} has {} thread replies, fetching them...",
                        msg.ts, reply_count);

                    // Fetch thread replies
                    match self.get_thread_replies(channel_id, &msg.ts).await {
                        Ok(replies) => {
                            // Skip the first message as it's the parent message we already have
                            let thread_replies: Vec<SlackMessage> = replies.into_iter()
                                .skip(1)
                                .collect();

                            info!("[DEBUG] Retrieved {} thread replies", thread_replies.len());
                            messages_with_replies.extend(thread_replies);
                        }
                        Err(e) => {
                            warn!("[DEBUG] Failed to fetch thread replies: {}", e);
                        }
                    }
                }
            }
        }

        info!("[DEBUG] Total messages including thread replies: {} (was {} without replies)",
            messages_with_replies.len(), all_messages.len());

        // Sort messages by timestamp (newest first)
        messages_with_replies.sort_by(|a, b| {
            // Parse timestamps as floats for accurate comparison
            let ts_a = a.ts.parse::<f64>().unwrap_or(0.0);
            let ts_b = b.ts.parse::<f64>().unwrap_or(0.0);
            // Reverse order for newest first
            ts_b.partial_cmp(&ts_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        info!("[DEBUG] Messages sorted by timestamp (newest first)");

        Ok(messages_with_replies)
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
        // DEBUG: Log every reaction fetch attempt
        debug!("get_reactions called for channel: {} timestamp: {}", channel, timestamp);

        // NOTE: Removed the DM channel skip logic as Slack API supports reactions in DMs
        // Previously this code was skipping all DM channels, but reactions work in DMs too
        info!("DEBUG: Proceeding with reaction fetch for channel: {} (type: {})",
              channel,
              if channel.starts_with('D') { "DM" }
              else if channel.starts_with('G') { "Group_DM" }
              else if channel.starts_with('C') { "Channel" }
              else { "Unknown" });

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

                info!("DEBUG: get_reactions API error for channel {}: {}", channel, error_msg);

                // Handle "no_reaction" as normal case - message has no reactions
                if error_msg.contains("no_reaction") {
                    debug!("Message has no reactions: {}", channel);
                    return Ok(vec![]);
                }
                // Handle "channel_not_found" - this might indicate permission issues
                if error_msg == "channel_not_found" {
                    info!("Channel not found for reactions (permission issue?): {}", channel);
                    return Ok(vec![]);
                }
                // Handle other known errors gracefully
                if error_msg == "message_not_found" {
                    debug!("Message not found for reactions: {}", channel);
                    return Ok(vec![]);
                }

                // Log unexpected errors but don't fail completely
                error!("Unexpected reaction API error for channel {}: {}", channel, error_msg);
                return Ok(vec![]);
            }
        }

        let reactions = result
            .get("message")
            .and_then(|msg| msg.get("reactions"))
            .and_then(|r| serde_json::from_value::<Vec<SlackReaction>>(r.clone()).ok())
            .unwrap_or_default();

        info!("DEBUG: get_reactions for {} found {} reactions", channel, reactions.len());

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

    /// Mark a conversation as read up to a specific timestamp
    ///
    /// Sets the read cursor in a channel, marking all messages up to and including
    /// the specified timestamp as read. This updates the user's read state on Slack.
    ///
    /// # Arguments
    /// * `channel` - Channel ID (e.g., "C1234567890", "D1234567890", "G1234567890")
    /// * `ts` - Timestamp of the message to mark as read (e.g., "1234567890.123456")
    ///
    /// # Returns
    /// * `Result<()>` - Ok if successful, Err with error message if failed
    ///
    /// # Errors
    /// * Rate limit errors
    /// * Invalid channel or timestamp
    /// * Permission errors
    /// * Network errors
    ///
    /// # Example
    /// ```ignore
    /// client.mark_conversation_as_read("C1234567890", "1234567890.123456").await?;
    /// ```
    pub async fn mark_conversation_as_read(
        &self,
        channel: &str,
        ts: &str,
    ) -> Result<()> {
        // Rate limiting - reuse existing semaphore
        let _permit = self.rate_limiter.acquire().await
            .map_err(|e| anyhow!("Failed to acquire rate limit permit: {}", e))?;

        let url = format!("{}/conversations.mark", SLACK_API_BASE);
        let params = serde_json::json!({
            "channel": channel,
            "ts": ts
        });

        info!("Marking conversation as read: channel={}, ts={}", channel, ts);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            error!("Failed to mark as read: {} - {}", status, error_text);

            // Provide specific error messages
            if status == 401 {
                return Err(anyhow!(
                    "Authentication failed. Your Slack token may be invalid or expired."
                ));
            } else if status == 403 {
                return Err(anyhow!(
                    "Access denied. You may not have permission to mark this channel as read."
                ));
            } else if status == 429 {
                return Err(anyhow!(
                    "Rate limit exceeded. Please wait a moment and try again."
                ));
            }

            return Err(anyhow!("Failed to mark as read: {}", error_text));
        }

        let result: serde_json::Value = response.json().await?;
        if let Some(ok) = result.get("ok").and_then(|v| v.as_bool()) {
            if !ok {
                let error_msg = result
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                error!("Slack API error when marking as read: {}", error_msg);

                // Provide specific error messages based on Slack error codes
                if error_msg.contains("invalid_auth") {
                    return Err(anyhow!(
                        "Invalid authentication token. Please check your Slack token in Settings."
                    ));
                } else if error_msg.contains("channel_not_found") {
                    return Err(anyhow!(
                        "Channel not found. The channel may have been deleted or you may not have access."
                    ));
                } else if error_msg.contains("invalid_timestamp") {
                    return Err(anyhow!(
                        "Invalid timestamp. The message may not exist."
                    ));
                }

                return Err(anyhow!("Slack API error: {}", error_msg));
            }
        }

        info!("Successfully marked conversation as read: channel={}, ts={}", channel, ts);
        Ok(())
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
