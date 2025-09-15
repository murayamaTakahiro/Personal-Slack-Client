use crate::error::{AppError, AppResult};
use crate::slack::{
    build_search_query, fetch_all_results, Message, SearchRequest, SearchResult, SlackClient,
    SlackMessage, SlackReaction, SlackUser, SlackChannelInfo,
};
use anyhow::anyhow;
use crate::state::{AppState, CachedUser};
use futures::future::join_all;
use std::sync::Arc;
use std::time::Instant;
use tauri::State;
use tracing::{debug, error, info, warn};

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

fn replace_user_mentions(text: &str, user_cache: &HashMap<String, CachedUser>) -> String {
    crate::slack::parser::replace_user_mentions(text, user_cache)
}

#[tauri::command]
pub async fn search_messages(
    query: String,
    channel: Option<String>,
    user: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    limit: Option<usize>,
    force_refresh: Option<bool>, // Add this parameter
    state: State<'_, AppState>,
) -> AppResult<SearchResult> {
    let start_time = Instant::now();

    // Check cache first (skip if force_refresh is true)
    if !force_refresh.unwrap_or(false) {
        if let Some(cached_result) = state
            .get_cached_search(&query, &channel, &user, &from_date, &to_date, &limit)
            .await
        {
            info!(
                "Returning cached search result in {}ms",
                start_time.elapsed().as_millis()
            );
            return Ok(cached_result);
        }
    } else {
        info!("Force refresh enabled, skipping cache");
    }

    // Get the Slack client from app state
    let client = state.get_client().await?;
    let client = Arc::new(client);

    // Set default limit if not provided
    let max_results = limit.unwrap_or(100);

    // Handle multi-channel or multi-user search
    let mut all_slack_messages = Vec::new();

    // Check if we have multi-user search (no longer needed for special handling)
    // Multi-user is now handled directly in build_search_query with OR logic
    let _is_multi_channel = channel.as_ref().map_or(false, |c| c.contains(','));

    if let Some(ref channel_param) = channel {
        if channel_param.contains(',') {
            // Multi-channel search: search each channel separately IN PARALLEL
            // Note: Multi-user is now handled with OR logic in a single query
            let channels: Vec<String> = if channel_param.contains(',') {
                channel_param
                    .split(',')
                    .map(|ch| ch.trim().to_string())
                    .filter(|ch| !ch.is_empty())
                    .collect()
            } else {
                vec![channel_param.clone()]
            };

            info!(
                "Performing parallel search for {} channels",
                channels.len()
            );

            // Create futures for parallel execution
            use std::pin::Pin;
            use futures::future::Future;

            let mut search_futures: Vec<Pin<Box<dyn Future<Output = Result<Vec<SlackMessage>, anyhow::Error>> + Send>>> = Vec::new();

            // Multi-channel search
            for single_channel in &channels {
                let client = Arc::clone(&client);
                let query = query.clone();
                let channel = single_channel.clone();
                let user = user.clone();  // This might be multiple users with commas
                let from_date = from_date.clone();
                let to_date = to_date.clone();

                search_futures.push(Box::pin(async move {
                    let search_request = SearchRequest {
                        query: query.clone(),
                        channel: Some(channel.clone()),
                        user: user.clone(),  // Pass the full user string
                        from_date,
                        to_date,
                        limit: Some(max_results),
                        is_realtime: force_refresh,
                    };

                    let search_query = build_search_query(&search_request);
                    info!(
                        "Searching channel '{}' with query: {}",
                        channel, search_query
                    );

                    let mut messages = fetch_all_results(&client, search_query, max_results).await?;

                    // Filter by user IDs if multi-user search
                    if let Some(ref users) = user {
                        if users.contains(',') {
                            // Parse user IDs from comma-separated string
                            let user_ids: Vec<String> = users
                                .split(',')
                                .map(|u| {
                                    let trimmed = u.trim();
                                    if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                                        trimmed[2..trimmed.len()-1].to_string()
                                    } else {
                                        trimmed.trim_start_matches('@').to_string()
                                    }
                                })
                                .filter(|u| !u.is_empty())
                                .collect();

                            info!("Filtering {} messages for users: {:?}", messages.len(), user_ids);

                            // Debug: Log first few messages to see user field
                            for (i, msg) in messages.iter().take(3).enumerate() {
                                info!("Message {}: user={:?}, text={:?}", i, msg.user, &msg.text[..msg.text.len().min(50)]);
                            }

                            let message_count = messages.len();
                            messages = messages.into_iter()
                                .filter(|msg| {
                                    let matches = msg.user.as_ref()
                                        .map(|u| {
                                            let user_match = user_ids.contains(u);
                                            if !user_match && message_count < 10 {
                                                info!("User '{}' not in filter list {:?}", u, user_ids);
                                            }
                                            user_match
                                        })
                                        .unwrap_or(false);
                                    matches
                                })
                                .collect();
                            info!("After filtering: {} messages", messages.len());
                        }
                    }

                    Ok::<Vec<SlackMessage>, anyhow::Error>(messages)
                }));
            }

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
            let is_multi_user = user.as_ref().map_or(false, |u| u.contains(','));
            if query.trim().is_empty() && !is_multi_user {
                // No text query and no user filter - use conversations.history for better results
                info!(
                    "Using conversations.history API for channel '{}' without text query",
                    channel_param
                );

                // Convert date filters to timestamps if needed
                let oldest = from_date.as_ref().and_then(|d| {
                    // Parse ISO date and convert to Unix timestamp
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(d) {
                        Some(dt.timestamp().to_string())
                    } else if let Some(date_part) = d.split('T').next() {
                        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                            let datetime = date.and_hms_opt(0, 0, 0)?;
                            let dt = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                                datetime,
                                chrono::Utc,
                            );
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
                            let dt = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                                datetime,
                                chrono::Utc,
                            );
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

                // Use the appropriate method based on whether it's a realtime update
                let messages_result = if force_refresh.unwrap_or(false) {
                    // For Live mode, use the method that includes reactions
                    (*client)
                        .clone()
                        .get_channel_messages_with_reactions(clean_channel, oldest, latest, max_results)
                        .await
                } else {
                    (*client)
                        .clone()
                        .get_channel_messages(clean_channel, oldest, latest, max_results)
                        .await
                };

                match messages_result
                {
                    Ok(messages) => {
                        info!("Got {} messages from conversations.history", messages.len());
                        all_slack_messages = messages;
                    }
                    Err(e) => {
                        warn!(
                            "conversations.history failed, falling back to search: {}",
                            e
                        );
                        // Fallback to search API
                        let search_request = SearchRequest {
                            query: query.clone(),
                            channel: channel.clone(),
                            user: user.clone(),
                            from_date: from_date.clone(),
                            to_date: to_date.clone(),
                            limit,
                            is_realtime: force_refresh,
                        };

                        let search_query = build_search_query(&search_request);
                        info!(
                            "Fallback: Executing single channel search with query: {}",
                            search_query
                        );

                        all_slack_messages =
                            fetch_all_results(&client, search_query.clone(), max_results).await?;
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
                    is_realtime: force_refresh,
                };

                let search_query = build_search_query(&search_request);
                info!(
                    "Executing single channel search with query: {}",
                    search_query
                );

                all_slack_messages =
                    fetch_all_results(&client, search_query.clone(), max_results).await?;

                // Filter by user IDs if multi-user search
                if let Some(ref users) = user {
                    if users.contains(',') {
                        // Parse user IDs from comma-separated string
                        let user_ids: Vec<String> = users
                            .split(',')
                            .map(|u| {
                                let trimmed = u.trim();
                                if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                                    trimmed[2..trimmed.len()-1].to_string()
                                } else {
                                    trimmed.trim_start_matches('@').to_string()
                                }
                            })
                            .filter(|u| !u.is_empty())
                            .collect();

                        info!("Filtering {} messages for users: {:?}", all_slack_messages.len(), user_ids);

                        // Debug: Log first few messages to see user field
                        for (i, msg) in all_slack_messages.iter().take(3).enumerate() {
                            info!("Message {}: user={:?}, text={:?}", i, msg.user, &msg.text[..msg.text.len().min(50)]);
                        }

                        let message_count = all_slack_messages.len();
                        all_slack_messages = all_slack_messages.into_iter()
                            .filter(|msg| {
                                let matches = msg.user.as_ref()
                                    .map(|u| {
                                        let user_match = user_ids.contains(u);
                                        if !user_match && message_count < 10 {
                                            info!("User '{}' not in filter list {:?}", u, user_ids);
                                        }
                                        user_match
                                    })
                                    .unwrap_or(false);
                                matches
                            })
                            .collect();
                        info!("After filtering: {} messages", all_slack_messages.len());
                    }
                }
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
            is_realtime: force_refresh,
        };

        let search_query = build_search_query(&search_request);
        info!("Executing search with query: {}", search_query);

        all_slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;

        // Filter by user IDs if multi-user search
        if let Some(ref users) = user {
            if users.contains(',') {
                // Parse user IDs from comma-separated string
                let user_ids: Vec<String> = users
                    .split(',')
                    .map(|u| {
                        let trimmed = u.trim();
                        if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                            trimmed[2..trimmed.len()-1].to_string()
                        } else {
                            trimmed.trim_start_matches('@').to_string()
                        }
                    })
                    .filter(|u| !u.is_empty())
                    .collect();

                info!("Filtering {} messages for users: {:?}", all_slack_messages.len(), user_ids);
                all_slack_messages = all_slack_messages.into_iter()
                    .filter(|msg| {
                        msg.user.as_ref()
                            .map(|u| user_ids.contains(u))
                            .unwrap_or(false)
                    })
                    .collect();
                info!("After filtering: {} messages", all_slack_messages.len());
            }
        }
    }

    // Sort by timestamp (newest first) and limit to max_results
    all_slack_messages.sort_by(|a, b| b.ts.cmp(&a.ts));
    let mut slack_messages: Vec<_> = all_slack_messages.into_iter().take(max_results).collect();

    // For Live mode (force_refresh), fetch reactions for each message if they don't have them
    if force_refresh.unwrap_or(false) {
        info!("Live mode: Fetching reactions for {} messages", slack_messages.len());
        
        // Collect indices of messages that need reactions
        let messages_needing_reactions: Vec<(usize, String, String)> = slack_messages
            .iter()
            .enumerate()
            .filter_map(|(idx, msg)| {
                if msg.reactions.is_none() {
                    if let Some(channel_info) = &msg.channel {
                        Some((idx, channel_info.id.clone(), msg.ts.clone()))
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .collect();
        
        if !messages_needing_reactions.is_empty() {
            info!("Fetching reactions for {} messages in parallel", messages_needing_reactions.len());
            
            // Create futures for all reaction fetches
            // client is already Arc from line 50
            let reaction_futures = messages_needing_reactions.iter().map(|(_, channel_id, ts)| {
                let client = Arc::clone(&client);
                let channel_id = channel_id.clone();
                let ts = ts.clone();
                async move {
                    match client.get_reactions(&channel_id, &ts).await {
                        Ok(reactions) if !reactions.is_empty() => {
                            info!("Fetched {} reactions for message {}", reactions.len(), ts);
                            Some(reactions)
                        }
                        Ok(_) => None,
                        Err(e) => {
                            debug!("Failed to get reactions for message {}: {}", ts, e);
                            None
                        }
                    }
                }
            });
            
            // Execute all reaction fetches in parallel
            let reaction_results = join_all(reaction_futures).await;
            
            // Apply the fetched reactions to the messages
            for ((idx, _, _), reactions) in messages_needing_reactions.iter().zip(reaction_results) {
                if let Some(reactions) = reactions {
                    slack_messages[*idx].reactions = Some(reactions);
                }
            }
        }
    }

    // Get user cache from state
    let user_cache_simple = state.get_user_cache().await;
    let channel_cache = state.get_channel_cache().await;

    // Clone client for use in the loop
    // Pre-fetch all unique users in parallel for better performance
    let unique_user_ids: Vec<String> = slack_messages
        .iter()
        .filter_map(|msg| msg.user.as_ref())
        .filter(|user_id| !user_cache_simple.contains_key(*user_id))
        .map(|s| s.to_string())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    if !unique_user_ids.is_empty() {
        info!(
            "Pre-fetching {} unique users in parallel",
            unique_user_ids.len()
        );
        let user_fetch_futures = unique_user_ids.iter().map(|user_id| {
            let client = Arc::clone(&client);
            let user_id = user_id.clone();
            async move {
                match client.get_user_info(&user_id).await {
                    Ok(user_info) => {
                        let name = user_info
                            .profile
                            .as_ref()
                            .and_then(|p| p.display_name.clone())
                            .or_else(|| user_info.real_name.clone())
                            .unwrap_or_else(|| user_info.name.clone());
                        Some((user_id, name))
                    }
                    Err(e) => {
                        error!("Failed to get user info for {}: {}", user_id, e);
                        None
                    }
                }
            }
        });

        let user_results = join_all(user_fetch_futures).await;
        for result in user_results {
            if let Some((user_id, name)) = result {
                state.cache_user(user_id, name, None).await;
            }
        }
    }

    // Reload cache after batch update
    let mut user_cache_simple = state.get_user_cache().await;
    let client_for_loop = client.clone();

    // Convert Slack messages to our Message format
    let mut messages = Vec::new();
    for slack_msg in slack_messages {
        // Check if this message has thread information
        // The search.messages API doesn't return reply_count, so we need to infer from other fields
        let is_thread_parent = false; // We can't reliably determine this from search results alone
        let reply_count = None; // Not available in search.messages response
        
        // Log what we're getting
        info!(
            "Processing search result: ts={}, thread_ts={:?}, text_preview={}",
            slack_msg.ts, 
            slack_msg.thread_ts,
            &slack_msg.text.chars().take(50).collect::<String>()
        );
        
        let user_name = if let Some(user_id) = &slack_msg.user {
            // Try to get from cache first
            if let Some(cached_name) = user_cache_simple.get(user_id) {
                cached_name.clone()
            } else {
                // Fetch from API and cache
                match client_for_loop.get_user_info(user_id).await {
                    Ok(user_info) => {
                        let name = user_info
                            .profile
                            .as_ref()
                            .and_then(|p| p.display_name.clone())
                            .or_else(|| user_info.real_name.clone())
                            .unwrap_or_else(|| user_info.name.clone());

                        // Update cache
                        state.cache_user(user_id.clone(), name.clone(), None).await;
                        // Also update local cache
                        user_cache_simple.insert(user_id.clone(), name.clone());
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
        let (channel_id, channel_name) = if let Some(channel_info) = &slack_msg.channel {
            let channel_name = if let Some(cached_name) = channel_cache.get(&channel_info.id) {
                cached_name.clone()
            } else {
                let name = channel_info.name.clone();
                state
                    .cache_channel(channel_info.id.clone(), name.clone())
                    .await;
                name
            };
            (channel_info.id.clone(), channel_name)
        } else {
            // If channel info is missing, use empty values
            ("unknown".to_string(), "Unknown Channel".to_string())
        };

        // Get fresh user cache for mention replacement
        let user_cache_full = state.get_user_cache_full().await;

        // Replace user mentions in the text
        let processed_text = replace_user_mentions(&slack_msg.text, &user_cache_full);

        messages.push(Message {
            ts: slack_msg.ts.clone(),
            thread_ts: slack_msg.thread_ts.clone(),
            user: slack_msg.user.unwrap_or_else(|| "Unknown".to_string()),
            user_name,
            text: processed_text,
            channel: channel_id,
            channel_name,
            permalink: slack_msg.permalink.unwrap_or_else(|| String::new()),
            is_thread_parent,
            reply_count,
            reactions: slack_msg.reactions.clone(),
            files: slack_msg.files.clone(),
        });
    }

    // NEW OPTIMIZATION: Don't fetch reactions here at all for non-realtime mode
    // Let the frontend handle progressive loading of reactions
    if !force_refresh.unwrap_or(false) && !messages.is_empty() {
        info!("Skipping backend reaction fetching - will use progressive loading in frontend");
        
        // Only check cache for already-fetched reactions (instant)
        for message in messages.iter_mut() {
            if let Some(cached_reactions) = state.get_cached_reactions(&message.channel, &message.ts).await {
                message.reactions = Some(cached_reactions);
            }
            // Don't fetch missing reactions - let frontend handle it progressively
        }
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
                is_realtime: force_refresh,
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
                is_realtime: force_refresh,
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
            is_realtime: force_refresh,
        };
        build_search_query(&search_request)
    };

    let result = SearchResult {
        messages,
        total,
        query: display_query,
        execution_time_ms,
    };

    // Cache the result for future use (skip if force_refresh was used)
    if !force_refresh.unwrap_or(false) {
        state
            .cache_search_result(
                &query,
                &channel,
                &user,
                &from_date,
                &to_date,
                &limit,
                result.clone(),
            )
            .await;
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_user_channels(state: State<'_, AppState>) -> AppResult<Vec<(String, String)>> {
    let client = state.get_client().await?;


    let channels = client.get_channels().await?;

    let mut channel_list = Vec::new();
    for channel in channels {
        if let Some(name) = channel.name {
            channel_list.push((channel.id.clone(), name.clone()));
            // Cache the channel
            state.cache_channel(channel.id, name).await;
        }
    }


    Ok(channel_list)
}

#[tauri::command]
pub async fn get_users(
    state: State<'_, AppState>,
) -> AppResult<Vec<(String, String, Option<String>)>> {
    let client = state.get_client().await?;


    let users = client.get_users().await?;

    let mut user_list = Vec::new();
    for user in users {
        // Use the same logic as search_messages to determine the display name
        // Priority: display_name > real_name > name (username)
        let display_name = user
            .profile
            .as_ref()
            .and_then(|p| p.display_name.clone().filter(|s| !s.is_empty()))
            .or_else(|| user.real_name.clone().filter(|s| !s.is_empty()))
            .unwrap_or_else(|| user.name.clone());

        // Return user ID, display name, and real name
        user_list.push((
            user.id.clone(),
            display_name.clone(),
            user.real_name.clone(),
        ));
        // Cache the user with the display name
        state
            .cache_user(user.id, display_name, user.real_name)
            .await;
    }


    Ok(user_list)
}

#[tauri::command]
pub async fn test_connection(token: String, state: State<'_, AppState>) -> AppResult<bool> {
    debug!("Testing Slack connection");

    // Create a temporary client to test the token
    let client = SlackClient::new(token.clone())?;

    match client.test_auth().await {
        Ok((true, user_id)) => {
            info!("Slack authentication successful, user_id: {:?}", user_id);
            // Save the token and user_id for future use
            state.set_token(token).await?;
            if let Some(uid) = user_id {
                state.set_user_id(uid).await;
            }
            Ok(true)
        }
        Ok((false, _)) => {
            error!("Slack authentication failed");
            Ok(false)
        }
        Err(e) => {
            error!("Failed to test Slack connection: {}", e);
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn get_all_users(state: State<'_, AppState>) -> AppResult<Vec<SlackUser>> {
    let client = state.get_client().await?;


    let users_info = client.get_all_users().await?;

    // Convert SlackUserInfo to SlackUser for frontend
    let users: Vec<SlackUser> = users_info
        .into_iter()
        .map(|user_info| {
            // Prioritize display_name for the "name" field that frontend expects
            let preferred_name = user_info
                .profile
                .as_ref()
                .and_then(|p| p.display_name.clone().filter(|s| !s.is_empty()))
                .or_else(|| user_info.real_name.clone().filter(|s| !s.is_empty()))
                .unwrap_or_else(|| user_info.name.clone());

            SlackUser {
                id: user_info.id,
                name: preferred_name, // Use display name as the primary name
                real_name: user_info
                    .real_name
                    .clone()
                    .or_else(|| user_info.profile.as_ref().and_then(|p| p.real_name.clone())),
                display_name: user_info
                    .profile
                    .as_ref()
                    .and_then(|p| p.display_name.clone()),
                avatar: user_info.profile.as_ref().and_then(|p| p.image_48.clone()),
            }
        })
        .collect();


    Ok(users)
}

#[tauri::command]
pub async fn get_user_info(user_id: String, state: State<'_, AppState>) -> AppResult<SlackUser> {
    let client = state.get_client().await?;


    let user_info = client.get_user_info(&user_id).await?;

    // Convert SlackUserInfo to SlackUser for frontend
    let user = SlackUser {
        id: user_info.id,
        name: user_info.name,
        real_name: user_info
            .real_name
            .clone()
            .or_else(|| user_info.profile.as_ref().and_then(|p| p.real_name.clone())),
        display_name: user_info
            .profile
            .as_ref()
            .and_then(|p| p.display_name.clone()),
        avatar: user_info.profile.as_ref().and_then(|p| p.image_48.clone()),
    };


    Ok(user)
}

// Batch reaction fetching structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionRequest {
    pub channel_id: String,
    pub timestamp: String,
    pub message_index: usize, // To track which message this is for
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchReactionsRequest {
    pub requests: Vec<ReactionRequest>,
    pub batch_size: Option<usize>, // How many to fetch in parallel (default: 3)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionResponse {
    pub message_index: usize,
    pub reactions: Option<Vec<SlackReaction>>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchReactionsResponse {
    pub reactions: Vec<ReactionResponse>,
    pub fetched_count: usize,
    pub error_count: usize,
}

#[tauri::command]
pub async fn batch_fetch_reactions(
    request: BatchReactionsRequest,
    state: State<'_, AppState>,
) -> AppResult<BatchReactionsResponse> {
    let start_time = Instant::now();
    let client = state.get_client().await?;
    let client = Arc::new(client);
    
    // Use provided batch size or default to MUCH larger batch for aggressive performance
    let batch_size = request.batch_size.unwrap_or(30); // Massively increased for 400+ messages
    
    info!(
        "Batch fetching reactions for {} messages in batches of {}",
        request.requests.len(),
        batch_size
    );
    
    let mut all_responses = Vec::new();
    let mut fetched_count = 0;
    let mut error_count = 0;
    let mut cache_hits = 0;
    
    // First, check cache for all requests
    let mut requests_needing_fetch = Vec::new();
    for req in &request.requests {
        if let Some(cached_reactions) = state.get_cached_reactions(&req.channel_id, &req.timestamp).await {
            // Use cached reactions
            all_responses.push(ReactionResponse {
                message_index: req.message_index,
                reactions: Some(cached_reactions),
                error: None,
            });
            cache_hits += 1;
            fetched_count += 1;
        } else {
            requests_needing_fetch.push(req.clone());
        }
    }
    
    if cache_hits > 0 {
        info!("Loaded {} reactions from cache", cache_hits);
    }
    
    // Process remaining requests in parallel batches
    for chunk in requests_needing_fetch.chunks(batch_size) {
        let batch_futures = chunk.iter().map(|req| {
            let client = Arc::clone(&client);
            let state = state.clone();
            let channel_id = req.channel_id.clone();
            let timestamp = req.timestamp.clone();
            let message_index = req.message_index;
            
            async move {
                match client.get_reactions(&channel_id, &timestamp).await {
                    Ok(reactions) => {
                        // Cache the reactions
                        state.cache_reactions(&channel_id, &timestamp, reactions.clone()).await;
                        
                        if !reactions.is_empty() {
                            debug!(
                                "Fetched {} reactions for message at index {}",
                                reactions.len(),
                                message_index
                            );
                        }
                        ReactionResponse {
                            message_index,
                            reactions: Some(reactions),
                            error: None,
                        }
                    }
                    Err(e) => {
                        debug!(
                            "Failed to fetch reactions for message at index {}: {}",
                            message_index, e
                        );
                        ReactionResponse {
                            message_index,
                            reactions: None,
                            error: Some(e.to_string()),
                        }
                    }
                }
            }
        });
        
        // Execute batch in parallel
        let batch_results = join_all(batch_futures).await;
        
        // Count successes and failures
        for result in &batch_results {
            if result.error.is_none() {
                fetched_count += 1;
            } else {
                error_count += 1;
            }
        }
        
        all_responses.extend(batch_results);
        
        // NO DELAY for aggressive performance - remove artificial delays completely
        // Rate limiting is handled by the rate_limiter in get_reactions
    }
    
    info!(
        "Batch reaction fetch completed in {}ms: {} fetched ({} from cache), {} errors",
        start_time.elapsed().as_millis(),
        fetched_count,
        cache_hits,
        error_count
    );
    
    Ok(BatchReactionsResponse {
        reactions: all_responses,
        fetched_count,
        error_count,
    })
}

#[tauri::command]
pub async fn clear_reaction_cache(state: State<'_, AppState>) -> AppResult<()> {
    state.clear_reaction_cache().await;
    Ok(())
}

#[tauri::command]
pub async fn search_messages_fast(
    query: String,
    channel: Option<String>,
    user: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    limit: Option<usize>,
    force_refresh: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<SearchResult> {
    // This is an optimized version that returns messages immediately without reactions
    // Reactions will be loaded progressively by the frontend
    
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
            
            info!(
                "Fast search: Performing parallel multi-channel search for {} channels",
                channels.len()
            );
            
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
                        is_realtime: force_refresh,
                    };
                    
                    let search_query = build_search_query(&search_request);
                    info!(
                        "Fast search: Searching channel '{}' with query: {}",
                        channel, search_query
                    );
                    
                    match fetch_all_results(&client, search_query, max_results).await {
                        Ok(messages) => {
                            info!("Fast search: Found {} messages in channel '{}'", messages.len(), channel);
                            Ok::<Vec<SlackMessage>, anyhow::Error>(messages)
                        }
                        Err(e) => {
                            error!("Fast search: Failed to search channel '{}': {}", channel, e);
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
            
            // Sort by timestamp (newest first) and limit to max_results
            all_slack_messages.sort_by(|a, b| b.ts.cmp(&a.ts));
            all_slack_messages = all_slack_messages.into_iter().take(max_results).collect();

            // Filter by user IDs if multi-user search (AFTER combining all channel results)
            if let Some(ref users) = user {
                if users.contains(',') {
                    // Parse user IDs from comma-separated string
                    let user_ids: Vec<String> = users
                        .split(',')
                        .map(|u| {
                            let trimmed = u.trim();
                            if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                                trimmed[2..trimmed.len()-1].to_string()
                            } else {
                                trimmed.trim_start_matches('@').to_string()
                            }
                        })
                        .filter(|u| !u.is_empty())
                        .collect();

                    info!("Fast search (multi-channel): Filtering {} messages for users: {:?}", all_slack_messages.len(), user_ids);

                    // Debug: Log first few messages to see user field
                    for (i, msg) in all_slack_messages.iter().take(3).enumerate() {
                        info!("Fast search (multi-channel): Message {}: user={:?}, text={:?}", i, msg.user, &msg.text[..msg.text.len().min(50)]);
                    }

                    let message_count = all_slack_messages.len();
                    all_slack_messages = all_slack_messages.into_iter()
                        .filter(|msg| {
                            let matches = msg.user.as_ref()
                                .map(|u| {
                                    let user_match = user_ids.contains(u);
                                    if !user_match && message_count < 10 {
                                        info!("Fast search (multi-channel): User '{}' not in filter list {:?}", u, user_ids);
                                    }
                                    user_match
                                })
                                .unwrap_or(false);
                            matches
                        })
                        .collect();
                    info!("Fast search (multi-channel): After filtering: {} messages", all_slack_messages.len());
                }
            }
        } else {
            // Single channel search
            let search_request = SearchRequest {
                query: query.clone(),
                channel: channel.clone(),
                user: user.clone(),
                from_date: from_date.clone(),
                to_date: to_date.clone(),
                limit,
                is_realtime: force_refresh,
            };
            
            let search_query = build_search_query(&search_request);
            info!("Fast search with query: {}", search_query);

            // Check if we should use conversations.history instead
            if search_query == "USE_CONVERSATIONS_HISTORY" {
                // Use conversations.history for better private channel support
                info!("Using conversations.history for channel + user search");

                // Extract channel name and resolve to ID
                let channel_name = match channel.as_ref() {
                    Some(ch) => ch.trim_start_matches('#'),
                    None => {
                        error!("Channel is required for conversations.history");
                        return Err(AppError::ApiError("Channel is required".to_string()));
                    }
                };

                // Resolve channel name to ID
                let channel_id = match client.resolve_channel_id(channel_name).await {
                    Ok(id) => {
                        info!("Resolved channel '{}' to ID: {}", channel_name, id);
                        id
                    }
                    Err(e) => {
                        error!("Failed to resolve channel '{}': {}", channel_name, e);
                        return Err(AppError::from(anyhow!("Channel '{}' not found", channel_name)));
                    }
                };

                // Convert date formats
                let oldest = from_date.as_ref().map(|d| {
                    // Convert ISO date to Unix timestamp
                    if let Some(date_part) = d.split('T').next() {
                        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                            // Use a safe default if time construction fails
                            if let Some(datetime) = date.and_hms_opt(0, 0, 0) {
                                let timestamp = datetime.and_utc().timestamp();
                                timestamp.to_string()
                            } else {
                                // Fall back to original string
                                d.clone()
                            }
                        } else {
                            d.clone()
                        }
                    } else {
                        d.clone()
                    }
                });

                let latest = to_date.as_ref().map(|d| {
                    // Convert ISO date to Unix timestamp
                    if let Some(date_part) = d.split('T').next() {
                        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                            // Use a safe default if time construction fails
                            if let Some(datetime) = date.and_hms_opt(23, 59, 59) {
                                let timestamp = datetime.and_utc().timestamp();
                                timestamp.to_string()
                            } else {
                                // Fall back to original string
                                d.clone()
                            }
                        } else {
                            d.clone()
                        }
                    } else {
                        d.clone()
                    }
                });

                // Get all messages from the channel
                match client.get_channel_messages(&channel_id, oldest, latest, max_results).await {
                    Ok(mut messages) => {
                        info!("Retrieved {} messages from channel {}", messages.len(), channel_id);

                        // Add channel info to messages from conversations.history
                        // (conversations.history doesn't include channel info in each message)
                        for msg in &mut messages {
                            if msg.channel.is_none() {
                                msg.channel = Some(SlackChannelInfo {
                                    id: channel_id.clone(),
                                    name: channel_name.to_string(),
                                });
                            }
                            // Also generate permalink if missing
                            if msg.permalink.is_none() {
                                // Format: https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP
                                msg.permalink = Some(format!("https://workspace.slack.com/archives/{}/p{}",
                                    channel_id,
                                    msg.ts.replace(".", "")
                                ));
                            }
                        }

                        all_slack_messages = messages;
                    }
                    Err(e) => {
                        error!("Failed to get channel messages: {}", e);
                        return Err(AppError::from(e));
                    }
                }

                // Filter by user if specified
                if let Some(ref user_filter) = user {
                    let user_id = if user_filter.starts_with("<@") && user_filter.ends_with(">") {
                        &user_filter[2..user_filter.len()-1]
                    } else {
                        user_filter.trim_start_matches('@')
                    };

                    info!("Filtering {} messages for user: {}", all_slack_messages.len(), user_id);

                    // Debug: Log first few messages to check user field
                    for (i, msg) in all_slack_messages.iter().take(5).enumerate() {
                        debug!("Message {}: user={:?}, text preview={:?}",
                            i,
                            msg.user,
                            &msg.text.chars().take(50).collect::<String>()
                        );
                    }

                    all_slack_messages = all_slack_messages.into_iter()
                        .filter(|msg| {
                            let matches = msg.user.as_ref() == Some(&user_id.to_string());
                            if matches {
                                debug!("Found matching message from user {}: {:?}", user_id, &msg.text.chars().take(50).collect::<String>());
                            }
                            matches
                        })
                        .collect();

                    info!("After user filter: {} messages", all_slack_messages.len());
                }
            } else {
                // Use normal search.messages API
                all_slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;
            }

            // Filter by user IDs if multi-user search
            if let Some(ref users) = user {
                if users.contains(',') {
                    // Parse user IDs from comma-separated string
                    let user_ids: Vec<String> = users
                        .split(',')
                        .map(|u| {
                            let trimmed = u.trim();
                            if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                                trimmed[2..trimmed.len()-1].to_string()
                            } else {
                                trimmed.trim_start_matches('@').to_string()
                            }
                        })
                        .filter(|u| !u.is_empty())
                        .collect();

                    info!("Fast search (single channel): Filtering {} messages for users: {:?}", all_slack_messages.len(), user_ids);

                    // Debug: Log first few messages to see user field
                    for (i, msg) in all_slack_messages.iter().take(3).enumerate() {
                        info!("Fast search (single channel): Message {}: user={:?}, text={:?}", i, msg.user, &msg.text[..msg.text.len().min(50)]);
                    }

                    let message_count = all_slack_messages.len();
                    all_slack_messages = all_slack_messages.into_iter()
                        .filter(|msg| {
                            let matches = msg.user.as_ref()
                                .map(|u| {
                                    let user_match = user_ids.contains(u);
                                    if !user_match && message_count < 10 {
                                        info!("Fast search (single channel): User '{}' not in filter list {:?}", u, user_ids);
                                    }
                                    user_match
                                })
                                .unwrap_or(false);
                            matches
                        })
                        .collect();
                    info!("Fast search (single channel): After filtering: {} messages", all_slack_messages.len());
                }
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
            is_realtime: force_refresh,
        };
        
        let search_query = build_search_query(&search_request);
        info!("Fast search with query: {}", search_query);
        
        all_slack_messages = fetch_all_results(&client, search_query.clone(), max_results).await?;

        // Filter by user IDs if multi-user search
        if let Some(ref users) = user {
            if users.contains(',') {
                // Parse user IDs from comma-separated string
                let user_ids: Vec<String> = users
                    .split(',')
                    .map(|u| {
                        let trimmed = u.trim();
                        if trimmed.starts_with("<@") && trimmed.ends_with(">") {
                            trimmed[2..trimmed.len()-1].to_string()
                        } else {
                            trimmed.trim_start_matches('@').to_string()
                        }
                    })
                    .filter(|u| !u.is_empty())
                    .collect();

                info!("Fast search: Filtering {} messages for users: {:?}", all_slack_messages.len(), user_ids);

                // Debug: Log first few messages to see user field
                for (i, msg) in all_slack_messages.iter().take(3).enumerate() {
                    info!("Fast search: Message {}: user={:?}, text={:?}", i, msg.user, &msg.text[..msg.text.len().min(50)]);
                }

                let message_count = all_slack_messages.len();
                all_slack_messages = all_slack_messages.into_iter()
                    .filter(|msg| {
                        let matches = msg.user.as_ref()
                            .map(|u| {
                                let user_match = user_ids.contains(u);
                                if !user_match && message_count < 10 {
                                    info!("Fast search: User '{}' not in filter list {:?}", u, user_ids);
                                }
                                user_match
                            })
                            .unwrap_or(false);
                        matches
                    })
                    .collect();
                info!("Fast search: After filtering: {} messages", all_slack_messages.len());
            }
        }
    }

    // Get user cache from state
    let mut user_cache_simple = state.get_user_cache().await;
    let channel_cache = state.get_channel_cache().await;
    
    // Collect unique user IDs that need fetching
    let mut users_to_fetch = Vec::new();
    for slack_msg in &all_slack_messages {
        if let Some(user_id) = &slack_msg.user {
            if !user_cache_simple.contains_key(user_id) && !users_to_fetch.contains(user_id) {
                users_to_fetch.push(user_id.clone());
            }
        }
    }
    
    // Batch fetch user information in parallel
    use futures::future::join_all;
    if !users_to_fetch.is_empty() {
        info!("Fetching {} unique users in parallel", users_to_fetch.len());
        let user_futures: Vec<_> = users_to_fetch
            .into_iter()
            .map(|user_id| {
                let client = client.clone();
                let uid = user_id.clone();
                async move {
                    match client.get_user_info(&uid).await {
                        Ok(user_info) => {
                            let name = user_info
                                .profile
                                .as_ref()
                                .and_then(|p| p.display_name.clone().filter(|s| !s.is_empty()))
                                .or_else(|| {
                                    user_info
                                        .profile
                                        .as_ref()
                                        .and_then(|p| p.real_name.clone().filter(|s| !s.is_empty()))
                                })
                                .or_else(|| user_info.real_name.clone().filter(|s| !s.is_empty()))
                                .unwrap_or_else(|| user_info.name.clone());
                            Some((uid, name))
                        }
                        Err(e) => {
                            error!("Failed to get user info for {}: {}", uid, e);
                            None
                        }
                    }
                }
            })
            .collect();
        
        let user_results = join_all(user_futures).await;
        
        // Update cache with all fetched users
        for result in user_results {
            if let Some((user_id, name)) = result {
                state.cache_user(user_id, name, None).await;
            }
        }
        
        // Refresh cache after batch fetching
        user_cache_simple = state.get_user_cache().await;
    }
    
    // Convert to our Message format quickly
    let mut messages = Vec::new();
    for slack_msg in all_slack_messages {
        let user_name = if let Some(user_id) = &slack_msg.user {
            user_cache_simple.get(user_id).cloned().unwrap_or_else(|| user_id.clone())
        } else {
            slack_msg.username.unwrap_or_else(|| "Unknown".to_string())
        };
        
        let (channel_id, channel_name) = if let Some(channel_info) = &slack_msg.channel {
            let name = channel_cache.get(&channel_info.id)
                .cloned()
                .unwrap_or_else(|| channel_info.name.clone());
            (channel_info.id.clone(), name)
        } else {
            ("unknown".to_string(), "Unknown Channel".to_string())
        };
        
        // Get fresh user cache for mention replacement
        let user_cache_full = state.get_user_cache_full().await;
        let processed_text = replace_user_mentions(&slack_msg.text, &user_cache_full);
        
        messages.push(Message {
            ts: slack_msg.ts.clone(),
            thread_ts: slack_msg.thread_ts.clone(),
            user: slack_msg.user.unwrap_or_else(|| "Unknown".to_string()),
            user_name,
            text: processed_text,
            channel: channel_id,
            channel_name,
            permalink: slack_msg.permalink.unwrap_or_else(|| String::new()),
            is_thread_parent: false,
            reply_count: None,
            reactions: None, // No reactions - frontend will load them
            files: slack_msg.files.clone(),
        });
    }
    
    // Check cache for any already-fetched reactions (instant)
    for message in messages.iter_mut() {
        if let Some(cached_reactions) = state.get_cached_reactions(&message.channel, &message.ts).await {
            message.reactions = Some(cached_reactions);
        }
    }
    
    let execution_time_ms = start_time.elapsed().as_millis() as u64;
    
    info!(
        "Fast search completed: {} results in {}ms (no reaction fetching)",
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
                is_realtime: force_refresh,
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
                is_realtime: force_refresh,
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
            is_realtime: force_refresh,
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
pub async fn fetch_reactions_progressive(
    channel_id: String,
    timestamps: Vec<String>,
    initial_batch_size: Option<usize>,
    state: State<'_, AppState>,
) -> AppResult<Vec<Option<Vec<SlackReaction>>>> {
    let client = state.get_client().await?;
    let client = Arc::new(client);
    
    let initial_batch = initial_batch_size.unwrap_or(30); // Increased default
    let mut results = vec![None; timestamps.len()];
    
    info!(
        "Progressive reaction fetch: {} messages, initial batch: {}",
        timestamps.len(),
        initial_batch
    );
    
    // Fetch initial batch immediately (for visible messages)
    let initial_count = initial_batch.min(timestamps.len());
    if initial_count > 0 {
        let initial_futures = timestamps[..initial_count].iter().enumerate().map(|(idx, ts)| {
            let client = Arc::clone(&client);
            let channel_id = channel_id.clone();
            let ts = ts.clone();
            
            async move {
                match client.get_reactions(&channel_id, &ts).await {
                    Ok(reactions) => (idx, Some(reactions)),
                    Err(_) => (idx, None),
                }
            }
        });
        
        let initial_results = join_all(initial_futures).await;
        for (idx, reactions) in initial_results {
            results[idx] = reactions;
        }
    }
    
    // Return early results for UI update
    // The frontend can call again for remaining messages
    Ok(results)
}
