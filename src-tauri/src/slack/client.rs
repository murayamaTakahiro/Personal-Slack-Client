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
const RATE_LIMIT_DELAY_MS: u64 = 50; // Reduced from 100ms for better performance
const MAX_CONCURRENT_REQUESTS: usize = 5; // Increased from 3 for better parallelism while staying safe

#[derive(Clone)]
pub struct SlackClient {
    client: Client,
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

        let result: SlackSearchResponse = response.json().await?;

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

        debug!(
            "Getting thread for channel: {}, ts: {}",
            channel_id, thread_ts
        );

        let response = self.client.get(&url).query(&params).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Slack API error: {} - {}", status, text);
            return Err(anyhow!("Slack API error: {} - {}", status, text));
        }

        let mut result: SlackConversationsRepliesResponse = response.json().await?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API returned error: {}", error_msg);
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        // Check if we got a single message that's a thread reply
        // If so, we need to fetch the complete thread using the parent timestamp
        if let Some(ref messages) = result.messages {
            if messages.len() == 1 {
                if let Some(ref first_msg) = messages.first() {
                    if let Some(ref parent_ts) = first_msg.thread_ts {
                        // This is a reply message and we only got one message
                        // We need to fetch the complete thread using the parent timestamp
                        if parent_ts != thread_ts {
                            info!("Single reply message returned, fetching complete thread with parent ts: {}", parent_ts);

                            let mut parent_params = HashMap::new();
                            parent_params.insert("channel", channel_id.to_string());
                            parent_params.insert("ts", parent_ts.to_string());
                            parent_params.insert("limit", "1000".to_string());

                            let parent_response =
                                self.client.get(&url).query(&parent_params).send().await?;

                            if parent_response.status().is_success() {
                                let parent_result: SlackConversationsRepliesResponse =
                                    parent_response.json().await?;

                                if parent_result.ok {
                                    result = parent_result;
                                } else {
                                    let error_msg = parent_result
                                        .error
                                        .unwrap_or_else(|| "Unknown error".to_string());
                                    error!(
                                        "Slack API returned error for parent thread: {}",
                                        error_msg
                                    );
                                    // Continue with the original result
                                }
                            }
                        }
                    }
                }
            }
        }

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
                    is_channel: None,
                    is_group: None,
                    is_im: None,
                    is_mpim: None,
                    is_private: None,
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

        #[derive(Deserialize)]
        struct ConversationsHistoryResponse {
            ok: bool,
            messages: Option<Vec<SlackMessage>>,
            error: Option<String>,
        }

        let result: ConversationsHistoryResponse = response.json().await?;

        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API error: {}", error_msg);
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        Ok(result.messages.unwrap_or_default())
    }

    pub async fn test_auth(&self) -> Result<bool> {
        let url = format!("{}/auth.test", SLACK_API_BASE);

        info!("Testing Slack authentication");

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            error!("Auth test failed with status: {}", response.status());
            return Ok(false);
        }

        #[derive(Deserialize)]
        struct AuthTestResponse {
            ok: bool,
            #[serde(default)]
            error: Option<String>,
        }

        let result: AuthTestResponse = response.json().await?;

        if result.ok {
            info!("Slack authentication successful");
        } else {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack auth test failed: {}", error_msg);
        }

        Ok(result.ok)
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
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Failed to get reactions: {}", error_text));
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
}

// Helper functions for building search queries
pub fn build_search_query(params: &SearchRequest) -> String {
    let mut query_parts = Vec::new();
    let has_text_query = !params.query.trim().is_empty();

    // Only add the query if it's not empty
    if has_text_query {
        query_parts.push(params.query.clone());
    }

    // Add channel filter - remove # if present
    // Note: Slack doesn't support OR for channels in a single query
    // For multi-channel search, we'll need to handle this differently
    if let Some(channel) = &params.channel {
        if !channel.contains(',') {
            // Single channel search
            let clean_channel = channel.trim_start_matches('#').trim();
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
    if let Some(user) = &params.user {
        let clean_user = user.trim_start_matches('@');
        if !clean_user.is_empty() {
            // Check if it's a user ID (starts with U and followed by alphanumeric)
            if clean_user.starts_with('U')
                && clean_user.len() > 8
                && clean_user.chars().skip(1).all(|c| c.is_alphanumeric())
            {
                // For user IDs, use the <@USERID> format
                info!("Using user ID format for search: <@{}>", clean_user);
                query_parts.push(format!("from:<@{}>", clean_user));
            } else {
                // For usernames, use the plain format
                info!("Using username format for search: {}", clean_user);
                query_parts.push(format!("from:{}", clean_user));
            }
        }
    }

    // Add date filters - Slack expects dates in YYYY-MM-DD format
    // Note: Slack's "after:" is exclusive, so we need to subtract 1 day for inclusive "from"
    // EXCEPT for realtime/live mode where we want exactly today's messages
    if let Some(from) = &params.from_date {
        // Parse ISO string and format as YYYY-MM-DD for Slack
        if let Some(date_part) = from.split('T').next() {
            // Parse the date
            if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                // For realtime mode, don't adjust the date - we want exactly today's messages
                // For normal searches, subtract one day for inclusive search
                if params.is_realtime.unwrap_or(false) {
                    // For realtime/live mode: use yesterday as the "after" date to get today's messages
                    // This ensures we only get messages from today (midnight onwards)
                    let yesterday = date - chrono::Duration::days(1);
                    let formatted_date = yesterday.format("%Y-%m-%d");
                    info!(
                        "Realtime mode: using after:{} to get messages from {} onwards",
                        formatted_date, date_part
                    );
                    query_parts.push(format!("after:{}", formatted_date));

                    // Also add a before filter for tomorrow to ensure we only get today's messages
                    let tomorrow = date + chrono::Duration::days(1);
                    let tomorrow_formatted = tomorrow.format("%Y-%m-%d");
                    query_parts.push(format!("before:{}", tomorrow_formatted));
                } else {
                    // For normal searches, subtract one day for inclusive search
                    let adjusted_date = date - chrono::Duration::days(1);
                    let formatted_date = adjusted_date.format("%Y-%m-%d");
                    info!(
                        "Normal search: adjusted from_date '{}' -> '{}'",
                        date_part, formatted_date
                    );
                    query_parts.push(format!("after:{}", formatted_date));
                };
            } else {
                // Fallback if parsing fails
                warn!("Failed to parse from_date '{}', using as-is", date_part);
                query_parts.push(format!("after:{}", date_part));
            }
        } else {
            warn!("from_date '{}' doesn't contain 'T', using as-is", from);
            query_parts.push(format!("after:{}", from));
        }
    }

    // Don't add to_date filter if already added by realtime mode
    if let Some(to) = &params.to_date {
        // Skip if realtime mode already added a before filter
        if !params.is_realtime.unwrap_or(false) {
            // Parse ISO string and format as YYYY-MM-DD for Slack
            // "before:" is exclusive which is what we want for "to" dates
            if let Some(date_part) = to.split('T').next() {
                query_parts.push(format!("before:{}", date_part));
            } else {
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
