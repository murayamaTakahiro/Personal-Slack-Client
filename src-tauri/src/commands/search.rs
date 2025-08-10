use crate::error::AppResult;
use crate::slack::{
    SlackClient, SearchRequest, SearchResult, Message, 
    build_search_query, fetch_all_results
};
use crate::state::AppState;
use std::time::Instant;
use tauri::State;
use tracing::{debug, info, error};

#[tauri::command]
pub async fn search_messages(
    query: String,
    channel: Option<String>,
    user: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> AppResult<SearchResult> {
    let start_time = Instant::now();
    
    // Get the Slack client from app state
    let client = state.get_client().await?;
    
    // Build the search request
    let search_request = SearchRequest {
        query: query.clone(),
        channel,
        user,
        from_date,
        to_date,
        limit,
    };
    
    // Build the Slack search query
    let search_query = build_search_query(&search_request);
    info!("Executing search with query: {}", search_query);
    
    // Set default limit if not provided
    let max_results = limit.unwrap_or(100);
    
    // Fetch all results with pagination
    let slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;
    
    // Get user cache from state
    let user_cache = state.get_user_cache().await;
    let channel_cache = state.get_channel_cache().await;
    
    // Convert Slack messages to our Message format
    let mut messages = Vec::new();
    for slack_msg in slack_messages {
        let user_name = if let Some(user_id) = &slack_msg.user {
            // Try to get from cache first
            if let Some(cached_name) = user_cache.get(user_id) {
                cached_name.clone()
            } else {
                // Fetch from API and cache
                match client.get_user_info(user_id).await {
                    Ok(user_info) => {
                        let name = user_info.profile
                            .as_ref()
                            .and_then(|p| p.display_name.clone())
                            .or_else(|| user_info.real_name.clone())
                            .unwrap_or_else(|| user_info.name.clone());
                        
                        // Update cache
                        state.cache_user(user_id.clone(), name.clone()).await;
                        name
                    }
                    Err(e) => {
                        error!("Failed to get user info for {}: {}", user_id, e);
                        slack_msg.username.unwrap_or_else(|| user_id.clone())
                    }
                }
            }
        } else {
            slack_msg.username.unwrap_or_else(|| "Unknown".to_string())
        };
        
        // Get channel name from cache or use the one from the message
        let channel_name = if let Some(cached_name) = channel_cache.get(&slack_msg.channel.id) {
            cached_name.clone()
        } else {
            let name = slack_msg.channel.name.clone();
            state.cache_channel(slack_msg.channel.id.clone(), name.clone()).await;
            name
        };
        
        messages.push(Message {
            ts: slack_msg.ts.clone(),
            thread_ts: slack_msg.thread_ts.clone(),
            user: slack_msg.user.unwrap_or_else(|| "Unknown".to_string()),
            user_name,
            text: slack_msg.text.clone(),
            channel: slack_msg.channel.id.clone(),
            channel_name,
            permalink: slack_msg.permalink.clone(),
            is_thread_parent: slack_msg.thread_ts.is_some() && slack_msg.reply_count.unwrap_or(0) > 0,
            reply_count: slack_msg.reply_count,
        });
    }
    
    let execution_time_ms = start_time.elapsed().as_millis() as u64;
    
    info!(
        "Search completed: {} results found in {}ms",
        messages.len(),
        execution_time_ms
    );
    
    let total = messages.len();
    Ok(SearchResult {
        messages,
        total,
        query: search_query,
        execution_time_ms,
    })
}

#[tauri::command]
pub async fn get_user_channels(
    state: State<'_, AppState>,
) -> AppResult<Vec<(String, String)>> {
    let client = state.get_client().await?;
    
    debug!("Fetching user channels");
    
    let channels = client.get_channels().await?;
    
    let mut channel_list = Vec::new();
    for channel in channels {
        if let Some(name) = channel.name {
            channel_list.push((channel.id.clone(), name.clone()));
            // Cache the channel
            state.cache_channel(channel.id, name).await;
        }
    }
    
    info!("Fetched {} channels", channel_list.len());
    
    Ok(channel_list)
}

#[tauri::command]
pub async fn test_connection(
    token: String,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    debug!("Testing Slack connection");
    
    // Create a temporary client to test the token
    let client = SlackClient::new(token.clone())?;
    
    match client.test_auth().await {
        Ok(true) => {
            info!("Slack authentication successful");
            // Save the token for future use
            state.set_token(token).await?;
            Ok(true)
        }
        Ok(false) => {
            error!("Slack authentication failed");
            Ok(false)
        }
        Err(e) => {
            error!("Failed to test Slack connection: {}", e);
            Ok(false)
        }
    }
}