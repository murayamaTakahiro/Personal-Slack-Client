use anyhow::{anyhow, Result};
use reqwest::{Client, header};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{debug, error, info};
use std::sync::Arc;

use super::models::*;

const SLACK_API_BASE: &str = "https://slack.com/api";
const RATE_LIMIT_DELAY_MS: u64 = 100;
const MAX_CONCURRENT_REQUESTS: usize = 3;  // Slack rate limit safety

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

        info!("Searching messages with query: '{}', page: {}, count: {}", query, page, count);

        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Slack API HTTP error: {} - {}", status, text);
            
            // Provide more specific error messages
            if status == 401 {
                return Err(anyhow!("Authentication failed. Your Slack token may be invalid or expired."));
            } else if status == 403 {
                return Err(anyhow!("Access denied. Your token may not have the required permissions for search."));
            } else if status == 429 {
                return Err(anyhow!("Rate limit exceeded. Please wait a moment and try again."));
            }
            
            return Err(anyhow!("Slack API error: {} - {}", status, text));
        }

        let result: SlackSearchResponse = response.json().await?;
        
        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API returned error: {}", error_msg);
            
            // Provide more specific error messages based on Slack error codes
            if error_msg.contains("invalid_auth") {
                return Err(anyhow!("Invalid authentication token. Please check your Slack token in Settings."));
            } else if error_msg.contains("token_revoked") {
                return Err(anyhow!("Your Slack token has been revoked. Please generate a new token."));
            } else if error_msg.contains("not_in_channel") {
                return Err(anyhow!("You don't have access to search in the specified channel."));
            } else if error_msg.contains("missing_scope") {
                return Err(anyhow!("Your token doesn't have the required permissions. Please ensure it has 'search:read' scope."));
            }
            
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        debug!("Search successful, found {} results", result.messages.as_ref().map(|m| m.total).unwrap_or(0));
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

        debug!("Getting thread for channel: {}, ts: {}", channel_id, thread_ts);

        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Slack API error: {} - {}", status, text);
            return Err(anyhow!("Slack API error: {} - {}", status, text));
        }

        let result: SlackConversationsRepliesResponse = response.json().await?;
        
        if !result.ok {
            let error_msg = result.error.unwrap_or_else(|| "Unknown error".to_string());
            error!("Slack API returned error: {}", error_msg);
            return Err(anyhow!("Slack API error: {}", error_msg));
        }

        Ok(result)
    }

    pub async fn get_user_info(&self, user_id: &str) -> Result<SlackUserInfo> {
        let url = format!("{}/users.info", SLACK_API_BASE);
        
        let mut params = HashMap::new();
        params.insert("user", user_id.to_string());

        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?;

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

            let response = self.client
                .get(&url)
                .query(&params)
                .send()
                .await?;

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

    pub async fn get_channel_info(&self, channel_id: &str) -> Result<SlackConversation> {
        let url = format!("{}/conversations.info", SLACK_API_BASE);
        
        let mut params = HashMap::new();
        params.insert("channel", channel_id.to_string());

        debug!("Getting channel info for: {}", channel_id);

        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?;

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

    pub async fn test_auth(&self) -> Result<bool> {
        let url = format!("{}/auth.test", SLACK_API_BASE);
        
        info!("Testing Slack authentication");
        
        let response = self.client
            .get(&url)
            .send()
            .await?;

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
}

// Helper functions for building search queries
pub fn build_search_query(params: &SearchRequest) -> String {
    let mut query_parts = Vec::new();
    
    // Only add the query if it's not empty
    if !params.query.trim().is_empty() {
        query_parts.push(params.query.clone());
    }
    
    // Add channel filter - remove # if present
    if let Some(channel) = &params.channel {
        let clean_channel = channel.trim_start_matches('#');
        if !clean_channel.is_empty() {
            query_parts.push(format!("in:{}", clean_channel));
        }
    }
    
    // Add user filter - remove @ if present
    if let Some(user) = &params.user {
        let clean_user = user.trim_start_matches('@');
        if !clean_user.is_empty() {
            query_parts.push(format!("from:{}", clean_user));
        }
    }
    
    // Add date filters - Slack expects dates in YYYY-MM-DD format
    if let Some(from) = &params.from_date {
        // Parse ISO string and format as YYYY-MM-DD for Slack
        if let Some(date_part) = from.split('T').next() {
            query_parts.push(format!("after:{}", date_part));
        } else {
            query_parts.push(format!("after:{}", from));
        }
    }
    
    if let Some(to) = &params.to_date {
        // Parse ISO string and format as YYYY-MM-DD for Slack
        if let Some(date_part) = to.split('T').next() {
            query_parts.push(format!("before:{}", date_part));
        } else {
            query_parts.push(format!("before:{}", to));
        }
    }
    
    // If no query parts at all, use a wildcard to get all messages
    let final_query = if query_parts.is_empty() {
        "*".to_string()  // Slack wildcard for all messages
    } else {
        query_parts.join(" ")
    };
    
    info!("Built search query: {}", final_query);
    final_query
}

// Pagination helper
pub async fn fetch_all_results(
    client: &SlackClient,
    query: String,
    max_results: usize,
) -> Result<Vec<SlackMessage>> {
    let start_time = Instant::now();
    let mut all_messages = Vec::new();
    let mut page = 1;
    let per_page = 100;
    
    info!("Starting search for query: {}", query);
    
    loop {
        let response = client.search_messages(&query, per_page, page).await?;
        
        if let Some(messages) = response.messages {
            let match_count = messages.matches.len();
            info!("Page {} returned {} results", page, match_count);
            
            all_messages.extend(messages.matches);
            
            // Check if we've reached the maximum or all results
            if all_messages.len() >= max_results || 
               all_messages.len() >= messages.total ||
               match_count < per_page {
                break;
            }
            
            page += 1;
            
            // Rate limit protection
            sleep(Duration::from_millis(RATE_LIMIT_DELAY_MS)).await;
        } else {
            break;
        }
    }
    
    // Truncate to max_results if necessary
    if all_messages.len() > max_results {
        all_messages.truncate(max_results);
    }
    
    let elapsed = start_time.elapsed();
    info!(
        "Search completed: {} results in {:.2}s",
        all_messages.len(),
        elapsed.as_secs_f64()
    );
    
    Ok(all_messages)
}