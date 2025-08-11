use crate::error::AppResult;
use crate::slack::{
    SlackClient, SearchRequest, SearchResult, Message, SlackMessage,
    build_search_query, fetch_all_results
};
use crate::state::AppState;
use std::time::Instant;
use tauri::State;
use tracing::{debug, info, error, warn};
use futures::future::join_all;
use std::sync::Arc;

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
    let client = Arc::new(client);
    
    // Set default limit if not provided
    let max_results = limit.unwrap_or(100);
    
    // Handle multi-channel search
    let mut all_slack_messages = Vec::new();
    
    if let Some(ref channel_param) = channel {
        if channel_param.contains(',') {
            // Multi-channel search: search each channel separately IN PARALLEL
            let channels: Vec<String> = channel_param
                .split(',')
                .map(|ch| ch.trim().to_string())
                .filter(|ch| !ch.is_empty())
                .collect();
            
            info!("Performing parallel multi-channel search for {} channels", channels.len());
            
            // Create futures for parallel execution
            let search_futures = channels.iter().map(|single_channel| {
                let client = Arc::clone(&client);
                let query = query.clone();
                let channel = single_channel.clone();
                let user = user.clone();
                let from_date = from_date.clone();
                let to_date = to_date.clone();
                
                async move {
                    let search_request = SearchRequest {
                        query: query.clone(),
                        channel: Some(channel.clone()),
                        user,
                        from_date,
                        to_date,
                        limit: Some(max_results),
                    };
                    
                    let search_query = build_search_query(&search_request);
                    info!("Searching channel '{}' with query: {}", channel, search_query);
                    
                    match fetch_all_results(&client, search_query, max_results).await {
                        Ok(messages) => {
                            info!("Found {} messages in channel '{}'", messages.len(), channel);
                            Ok::<Vec<SlackMessage>, anyhow::Error>(messages)
                        }
                        Err(e) => {
                            error!("Failed to search channel '{}': {}", channel, e);
                            // Return empty vec on error to continue with other channels
                            Ok::<Vec<SlackMessage>, anyhow::Error>(vec![])
                        }
                    }
                }
            });
            
            // Execute all searches in parallel
            let results = join_all(search_futures).await;
            
            // Combine all results
            for result in results {
                if let Ok(messages) = result {
                    all_slack_messages.extend(messages);
                }
            }
        } else {
            // Single channel search
            // Check if we have a text query or just filters
            if query.trim().is_empty() && user.is_none() {
                // No text query and no user filter - use conversations.history for better results
                info!("Using conversations.history API for channel '{}' without text query", channel_param);
                
                // Convert date filters to timestamps if needed
                let oldest = from_date.as_ref().and_then(|d| {
                    // Parse ISO date and convert to Unix timestamp
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(d) {
                        Some(dt.timestamp().to_string())
                    } else if let Some(date_part) = d.split('T').next() {
                        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                            let datetime = date.and_hms_opt(0, 0, 0)?;
                            let dt = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(datetime, chrono::Utc);
                            Some(dt.timestamp().to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                });
                
                let latest = to_date.as_ref().and_then(|d| {
                    // Parse ISO date and convert to Unix timestamp
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(d) {
                        Some(dt.timestamp().to_string())
                    } else if let Some(date_part) = d.split('T').next() {
                        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                            let datetime = date.and_hms_opt(23, 59, 59)?;
                            let dt = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(datetime, chrono::Utc);
                            Some(dt.timestamp().to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                });
                
                // Clean channel name (remove # if present)
                let clean_channel = channel_param.trim_start_matches('#');
                
                match (*client).clone().get_channel_messages(clean_channel, oldest, latest, max_results).await {
                    Ok(messages) => {
                        info!("Got {} messages from conversations.history", messages.len());
                        all_slack_messages = messages;
                    }
                    Err(e) => {
                        warn!("conversations.history failed, falling back to search: {}", e);
                        // Fallback to search API
                        let search_request = SearchRequest {
                            query: query.clone(),
                            channel: channel.clone(),
                            user: user.clone(),
                            from_date: from_date.clone(),
                            to_date: to_date.clone(),
                            limit,
                        };
                        
                        let search_query = build_search_query(&search_request);
                        info!("Fallback: Executing single channel search with query: {}", search_query);
                        
                        all_slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;
                    }
                }
            } else {
                // Has text query or user filter - use search API
                let search_request = SearchRequest {
                    query: query.clone(),
                    channel: channel.clone(),
                    user: user.clone(),
                    from_date: from_date.clone(),
                    to_date: to_date.clone(),
                    limit,
                };
                
                let search_query = build_search_query(&search_request);
                info!("Executing single channel search with query: {}", search_query);
                
                all_slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;
            }
        }
    } else {
        // No channel specified
        let search_request = SearchRequest {
            query: query.clone(),
            channel: channel.clone(),
            user: user.clone(),
            from_date: from_date.clone(),
            to_date: to_date.clone(),
            limit,
        };
        
        let search_query = build_search_query(&search_request);
        info!("Executing search with query: {}", search_query);
        
        all_slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;
    }
    
    // Sort by timestamp (newest first) and limit to max_results
    all_slack_messages.sort_by(|a, b| b.ts.cmp(&a.ts));
    let slack_messages: Vec<_> = all_slack_messages.into_iter().take(max_results).collect();
    
    // Get user cache from state
    let user_cache = state.get_user_cache().await;
    let channel_cache = state.get_channel_cache().await;
    
    // Clone client for use in the loop
    let client_for_loop = client.clone();
    
    // Convert Slack messages to our Message format
    let mut messages = Vec::new();
    for slack_msg in slack_messages {
        let user_name = if let Some(user_id) = &slack_msg.user {
            // Try to get from cache first
            if let Some(cached_name) = user_cache.get(user_id) {
                cached_name.clone()
            } else {
                // Fetch from API and cache
                match client_for_loop.get_user_info(user_id).await {
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
    
    // Build display query for multi-channel search
    let display_query = if let Some(ref channel_param) = channel {
        if channel_param.contains(',') {
            let search_request = SearchRequest {
                query: query.clone(),
                channel: Some(format!("({})", channel_param.replace(",", " OR "))),
                user: user.clone(),
                from_date: from_date.clone(),
                to_date: to_date.clone(),
                limit,
            };
            build_search_query(&search_request)
        } else {
            // Use the original query building for single channel
            let search_request = SearchRequest {
                query: query.clone(),
                channel: channel.clone(),
                user: user.clone(),
                from_date: from_date.clone(),
                to_date: to_date.clone(),
                limit,
            };
            build_search_query(&search_request)
        }
    } else {
        let search_request = SearchRequest {
            query: query.clone(),
            channel: channel.clone(),
            user: user.clone(),
            from_date: from_date.clone(),
            to_date: to_date.clone(),
            limit,
        };
        build_search_query(&search_request)
    };
    
    Ok(SearchResult {
        messages,
        total,
        query: display_query,
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