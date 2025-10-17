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
    last_timestamp: Option<String>, // For incremental updates
    has_files: Option<bool>, // Filter messages with attachments
    state: State<'_, AppState>,
) -> AppResult<SearchResult> {
    let start_time = Instant::now();

    info!("[SEARCH DEBUG] search_messages called with force_refresh: {:?}, query: '{}', channel: {:?}",
          force_refresh, query, channel);

    // Check cache first (skip if force_refresh is true)
    if !force_refresh.unwrap_or(false) {
        if let Some(cached_result) = state
            .get_cached_search(&query, &channel, &user, &from_date, &to_date, &limit, &has_files)
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

            // Determine if this includes DM channels
            let dm_channels: Vec<String> = channels.iter()
                .filter(|ch| ch.starts_with("D") || ch.starts_with("G"))
                .cloned()
                .collect();
            let _regular_channels: Vec<String> = channels.iter()
                .filter(|ch| !ch.starts_with("D") && !ch.starts_with("G"))
                .cloned()
                .collect();

            if !dm_channels.is_empty() {
                info!("Multi-channel search includes {} DM/Group DM channels", dm_channels.len());
            }

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
                    // Check if this is a DM/Group DM channel
                    let is_dm_channel = channel.starts_with("D") || channel.starts_with("G");

                    if is_dm_channel {
                        // Use DM-specific search for DM/Group DM channels
                        info!("Using DM search for channel: {}", channel);

                        // For DMs, use the search_dm_messages function
                        let query_str = if query.is_empty() {
                            None
                        } else {
                            Some(query.as_str())
                        };

                        let mut messages = client.search_dm_messages(
                            &channel,
                            query_str,
                            max_results,
                        ).await?;

                        // Apply date filters if specified
                        if let Some(ref from) = from_date {
                            messages.retain(|msg| {
                                let ts_float: f64 = msg.ts.parse().unwrap_or(0.0);
                                let msg_date = chrono::DateTime::from_timestamp(ts_float as i64, 0)
                                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                                    .unwrap_or_default();
                                msg_date >= *from
                            });
                        }

                        if let Some(ref to) = to_date {
                            messages.retain(|msg| {
                                let ts_float: f64 = msg.ts.parse().unwrap_or(0.0);
                                let msg_date = chrono::DateTime::from_timestamp(ts_float as i64, 0)
                                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                                    .unwrap_or_default();
                                msg_date <= *to
                            });
                        }

                        // Add channel info to DM messages
                        for msg in &mut messages {
                            if msg.channel.is_none() {
                                msg.channel = Some(SlackChannelInfo {
                                    id: channel.clone(),
                                    name: channel.clone(), // Will be resolved to proper name later
                                });
                            }
                        }

                        Ok::<Vec<SlackMessage>, anyhow::Error>(messages)
                    } else {
                        // Use regular search for normal channels
                        let search_request = SearchRequest {
                            query: query.clone(),
                            channel: Some(channel.clone()),
                            user: user.clone(),  // Pass the full user string
                            from_date,
                            to_date,
                            limit: Some(max_results),
                            is_realtime: force_refresh,
                            has_files,
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
                    }
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
            let _is_multi_user = user.as_ref().map_or(false, |u| u.contains(','));
            if query.trim().is_empty() {
                // No text query - use conversations.history for better results
                // This works for both with and without user filter
                info!(
                    "Using conversations.history API for channel '{}' without text query (user filter: {:?})",
                    channel_param, user
                );

                // Convert date filters to timestamps if needed
                // Use last_timestamp for incremental updates if provided (live mode optimization)
                let oldest = last_timestamp.as_ref().or(from_date.as_ref()).and_then(|d| {
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

                // If from_date is set but to_date is not, set to_date to the end of from_date
                let latest = if to_date.is_none() && from_date.is_some() {
                    from_date.as_ref().and_then(|d| {
                        // Parse ISO date and convert to Unix timestamp for end of day
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(d) {
                            // Already has time component, add 24 hours
                            Some((dt.timestamp() + 86400).to_string())
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
                    })
                } else {
                    to_date.as_ref().and_then(|d| {
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
                    })
                };

                // Debug logging for timestamps
                if let Some(ref oldest_ts) = oldest {
                    info!("[DEBUG] search.rs: oldest timestamp = {} (incremental: {})",
                          oldest_ts, last_timestamp.is_some());
                }
                if let Some(ref latest_ts) = latest {
                    info!("[DEBUG] search.rs: latest timestamp = {}", latest_ts);
                }

                // Clean channel name (remove # if present)
                let clean_channel = channel_param.trim_start_matches('#');

                // When filtering by user, we need to fetch more messages initially
                // since many will be filtered out
                let fetch_limit = if user.is_some() {
                    // Fetch up to 1000 messages when filtering by user
                    // This gives us better chances of finding all user's messages
                    max_results.max(1000)
                } else {
                    max_results
                };

                info!("Fetching up to {} messages from channel (will filter to {} max)",
                    fetch_limit, max_results);

                // Use the appropriate method based on whether it's a realtime update
                let messages_result = if force_refresh.unwrap_or(false) {
                    // For Live mode, use the method that includes reactions
                    info!("[REALTIME DEBUG] Using get_channel_messages_with_reactions for channel: {}, force_refresh: true", clean_channel);
                    (*client)
                        .clone()
                        .get_channel_messages_with_reactions(clean_channel, oldest, latest, fetch_limit)
                        .await
                } else {
                    info!("[REALTIME DEBUG] Using get_channel_messages for channel: {}, force_refresh: false", clean_channel);
                    (*client)
                        .clone()
                        .get_channel_messages(clean_channel, oldest, latest, fetch_limit)
                        .await
                };

                match messages_result
                {
                    Ok(mut messages) => {
                        info!("Got {} messages from conversations.history", messages.len());

                        // Filter by user if specified
                        if let Some(ref user_filter) = user {
                            info!("Filtering messages by user: {}", user_filter);

                            // Parse user IDs from comma-separated string or single user
                            let user_ids: Vec<String> = if user_filter.contains(',') {
                                user_filter
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
                                    .collect()
                            } else {
                                vec![
                                    if user_filter.starts_with("<@") && user_filter.ends_with(">") {
                                        user_filter[2..user_filter.len()-1].to_string()
                                    } else {
                                        user_filter.trim_start_matches('@').to_string()
                                    }
                                ]
                            };

                            info!("Filtering for user IDs: {:?}", user_ids);
                            let before_count = messages.len();

                            messages = messages.into_iter()
                                .filter(|msg| {
                                    msg.user.as_ref()
                                        .map(|u| user_ids.contains(u))
                                        .unwrap_or(false)
                                })
                                .collect();

                            info!("User filter: {} -> {} messages", before_count, messages.len());

                            // Limit to max_results after filtering
                            if messages.len() > max_results {
                                messages.truncate(max_results);
                                info!("Truncated to {} messages (max_results)", max_results);
                            }
                        }

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
                            has_files,
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
                    has_files,
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
            has_files,
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

    // Fetch reactions for each message if they don't have them
    // NOTE: search.messages API doesn't return reactions, so we need to fetch them separately
    // This was previously only done for Live mode, but reactions were missing in normal searches
    if !slack_messages.is_empty() {
        info!("Fetching reactions for {} messages", slack_messages.len());

        // Debug: Log channel types for all messages
        let mut channel_type_counts = std::collections::HashMap::new();
        for (idx, msg) in slack_messages.iter().enumerate() {
            if let Some(channel_info) = &msg.channel {
                let channel_type = if channel_info.id.starts_with('D') {
                    "DM"
                } else if channel_info.id.starts_with('G') {
                    "Group_DM"
                } else if channel_info.id.starts_with('C') {
                    "Channel"
                } else {
                    "Unknown"
                };
                *channel_type_counts.entry(channel_type).or_insert(0) += 1;

                if idx == 0 {
                    info!("DEBUG: First message channel: {} (type: {})", channel_info.id, channel_type);
                }
            }
        }
        info!("DEBUG: Channel type breakdown: {:?}", channel_type_counts);

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
                            .and_then(|p| p.display_name.clone().filter(|s| !s.is_empty()))
                            .or_else(|| user_info.real_name.clone().filter(|s| !s.is_empty()))
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
                            .and_then(|p| p.display_name.clone().filter(|s| !s.is_empty()))
                            .or_else(|| user_info.real_name.clone().filter(|s| !s.is_empty()))
                            .unwrap_or_else(|| user_info.name.clone());

                        // Update cache
                        state.cache_user(user_id.clone(), name.clone(), None).await;
                        // Also update local cache
                        user_cache_simple.insert(user_id.clone(), name.clone());
                        name
                    }
                    Err(e) => {
                        error!("Failed to get user info for {}: {}", user_id, e);
                        // Check bot profile first, then username
                        if let Some(bot_profile) = &slack_msg.bot_profile {
                            bot_profile.name.clone().unwrap_or_else(|| {
                                slack_msg.username.clone().unwrap_or_else(|| user_id.clone())
                            })
                        } else {
                            slack_msg.username.clone().unwrap_or_else(|| user_id.clone())
                        }
                    }
                }
            }
        } else if let Some(bot_profile) = &slack_msg.bot_profile {
            // For bot/app messages, use bot profile name
            bot_profile.name.clone().unwrap_or_else(|| {
                slack_msg.username.clone().unwrap_or_else(|| "Unknown".to_string())
            })
        } else {
            slack_msg.username.clone().unwrap_or_else(|| "Unknown".to_string())
        };

        // Get channel name from cache or use the one from the message
        let (channel_id, channel_name) = if let Some(channel_info) = &slack_msg.channel {
            let channel_name = if let Some(cached_name) = channel_cache.get(&channel_info.id) {
                cached_name.clone()
            } else {
                let name = channel_info.name.clone();
                // For now, assume regular channels (not DMs) when caching from search results
                state
                    .cache_channel(channel_info.id.clone(), name.clone(), false, false)
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
            user: slack_msg.user.clone().unwrap_or_else(|| {
                // For bot messages, use bot_id if available, otherwise use empty string
                slack_msg.bot_id.clone().unwrap_or_else(|| String::new())
            }),
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

    // REVERTED: The optimization was causing reactions to not display
    // The search.messages API doesn't return reactions by default, so we need to fetch them
    // Commenting out the optimization to restore reaction display functionality
    //
    // // NEW OPTIMIZATION: Don't fetch reactions here at all for non-realtime mode
    // // Let the frontend handle progressive loading of reactions
    // if !force_refresh.unwrap_or(false) && !messages.is_empty() {
    //     info!("Skipping backend reaction fetching - will use progressive loading in frontend");
    //
    //     // Only check cache for already-fetched reactions (instant)
    //     for message in messages.iter_mut() {
    //         if let Some(cached_reactions) = state.get_cached_reactions(&message.channel, &message.ts).await {
    //             message.reactions = Some(cached_reactions);
    //         }
    //         // Don't fetch missing reactions - let frontend handle it progressively
    //     }
    // }

    // Apply file filter if requested
    if let Some(true) = has_files {
        messages.retain(|msg| {
            msg.files.is_some() && !msg.files.as_ref().unwrap().is_empty()
        });
        info!("Applied file filter: {} messages with attachments", messages.len());
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
                has_files,
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
                has_files,
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
            has_files,
        };
        build_search_query(&search_request)
    };

    let result = SearchResult {
        messages,
        total,
        query: display_query,
        execution_time_ms,
    };

    // Invalidate stale cache entries when new messages are found in live mode
    if force_refresh.unwrap_or(false) && last_timestamp.is_some() {
        // Find the newest message timestamp for cache invalidation
        let newest_timestamp = result.messages.first().map(|m| m.ts.as_str());
        if let (Some(ref ch), Some(ts)) = (&channel, newest_timestamp) {
            info!("Invalidating cache for channel {} after timestamp {}", ch, ts);
            state.invalidate_channel_cache(ch, Some(ts)).await;
        }
    }

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
                &has_files,
                result.clone(),
            )
            .await;
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_user_channels(
    state: State<'_, AppState>,
    include_dms: Option<bool>,
) -> AppResult<Vec<(String, String)>> {
    info!("[DEBUG] get_user_channels called with include_dms: {:?}", include_dms);
    let client = state.get_client().await?;

    // Get regular channels (public and private)
    let mut channels = client.get_channels().await?;
    info!("[DEBUG] Regular channels fetched: {}", channels.len());

    // If DMs are requested and feature is enabled, include them
    if include_dms.unwrap_or(false) {
        info!("Including DM channels in channel list");

        // Try to fetch DM channels, but don't fail if permissions are missing
        match client.get_dm_channels().await {
            Ok(dm_channels) => {
                info!("Successfully fetched {} DM channels", dm_channels.len());

                // Get users for mapping user IDs to names
                let users = match client.get_all_users().await {
                    Ok(users) => {
                        // Debug: Log all users that might be related to our issue
                        for user in &users {
                            if user.id == "U04F9M6JX2M" ||
                               user.name.contains("murayama") ||
                               user.name.contains("yandt89") ||
                               (user.real_name.as_ref().map_or(false, |n| n.contains("murayama") || n.contains("yandt89"))) ||
                               (user.profile.as_ref().and_then(|p| p.display_name.as_ref()).map_or(false, |n| n.contains("murayama") || n.contains("yandt89"))) {
                                info!("[DEBUG] Relevant user found:");
                                info!("  id: {}", user.id);
                                info!("  name: {}", user.name);
                                info!("  real_name: {:?}", user.real_name);
                                if let Some(ref p) = user.profile {
                                    info!("  profile.display_name: {:?}", p.display_name);
                                    info!("  profile.real_name: {:?}", p.real_name);
                                }
                            }
                        }
                        users
                    },
                    Err(e) => {
                        warn!("Failed to fetch users for DM name mapping: {}", e);
                        vec![]
                    }
                };

                // Create a map of user IDs to display names
                let user_map: HashMap<String, String> = users
                    .iter()
                    .filter_map(|user| {
                        // Debug logging for the specific user
                        if user.id == "U04F9M6JX2M" {
                            info!("[DEBUG] Found user U04F9M6JX2M:");
                            info!("  - id: {}", user.id);
                            info!("  - name: {}", user.name);
                            info!("  - real_name: {:?}", user.real_name);
                            if let Some(ref profile) = user.profile {
                                info!("  - profile.display_name: {:?}", profile.display_name);
                                info!("  - profile.real_name: {:?}", profile.real_name);
                            }
                        }

                        // Check if user is a bot or deleted
                        let is_bot = user.is_bot.unwrap_or(false);
                        let is_deleted = user.deleted.unwrap_or(false);

                        // Priority order for display name:
                        // For deleted users, prepend [Deleted]
                        // For bot users, use real_name first (often more descriptive)
                        // For regular users, use the standard priority
                        let display_name = if is_deleted {
                            format!("[Deleted] {}", user.name)
                        } else if is_bot {
                            // For bots, prefer real_name which is often more descriptive
                            user.real_name.clone()
                                .filter(|n| !n.is_empty())
                                .or_else(|| user.profile.as_ref()
                                    .and_then(|p| p.display_name.clone())
                                    .filter(|n| !n.is_empty()))
                                .or_else(|| user.profile.as_ref()
                                    .and_then(|p| p.real_name.clone())
                                    .filter(|n| !n.is_empty()))
                                .unwrap_or_else(|| format!("[Bot] {}", user.name))
                        } else {
                            // Regular users - standard priority
                            user.profile.as_ref()
                                .and_then(|p| p.display_name.clone())
                                .filter(|n| !n.is_empty())
                                .or_else(|| user.profile.as_ref()
                                    .and_then(|p| p.real_name.clone())
                                    .filter(|n| !n.is_empty()))
                                .or_else(|| {
                                    // Try the real_name field at the top level
                                    user.real_name.clone().filter(|n| !n.is_empty())
                                })
                                .unwrap_or_else(|| {
                                    // Use name field as last resort before ID
                                    // Note: name field is the @handle, not the display name
                                    if !user.name.is_empty() {
                                        user.name.clone()
                                    } else {
                                        user.id.clone()
                                    }
                                })
                        };

                        // More targeted debug logging
                        if user.id == "U04F9M6JX2M" {
                            info!("[DEBUG] *** IMPORTANT: User U04F9M6JX2M (username='{}') mapped to display_name: '{}'",
                                 user.name, display_name);
                        }

                        // Also log if we find murayama or yandt89 anywhere
                        if user.id.contains("murayama") || user.name.contains("murayama") ||
                           user.name.contains("yandt89") || display_name.contains("murayama") ||
                           display_name.contains("yandt89") {
                            info!("[DEBUG] User mapping: id={}, name={}, display_name={}",
                                 user.id, user.name, display_name);
                        }

                        Some((user.id.clone(), display_name))
                    })
                    .collect();

                info!("[DEBUG] Built user_map with {} users", user_map.len());

                // Count bot and deleted users
                let bot_count = users.iter().filter(|u| u.is_bot.unwrap_or(false)).count();
                let deleted_count = users.iter().filter(|u| u.deleted.unwrap_or(false)).count();
                info!("[DEBUG] User breakdown: {} total, {} bots, {} deleted",
                     users.len(), bot_count, deleted_count);

                // Debug: Check for specific problematic users
                let problem_users = ["U2R5VHFND", "U2R5VKH1P", "U2UAC7Q3S", "U6FTNV0CE", "UBZ931BR8", "UCK5KGMME", "UDUJSB4SJ"];
                for problem_id in &problem_users {
                    if user_map.contains_key(*problem_id) {
                        info!("[DEBUG] Found problem user {} in map: '{}'", problem_id, user_map.get(*problem_id).unwrap());
                    } else {
                        info!("[DEBUG] WARNING: Problem user {} NOT found in user_map", problem_id);
                        // Check if it's in the users list at all
                        let in_users = users.iter().any(|u| u.id == *problem_id);
                        info!("[DEBUG]   - User {} in users list: {}", problem_id, in_users);
                    }
                }

                // Log a sample of the user_map for debugging
                for (id, name) in user_map.iter().take(5) {
                    info!("[DEBUG]   Sample user_map entry: {} -> {}", id, name);
                }

                // Convert DM and Group DM channels to the same format as regular channels
                for dm in dm_channels {
                    // Debug: Log DM channels with specific user
                    if dm.user.as_ref().map_or(false, |u| u == "U04F9M6JX2M") {
                        info!("[DEBUG] Found DM channel for U04F9M6JX2M:");
                        info!("  channel.id: {}", dm.id);
                        info!("  channel.user: {:?}", dm.user);
                        info!("  channel.name: {:?}", dm.name);
                        info!("  channel.is_im: {:?}", dm.is_im);
                    }
                    let (dm_name, is_im, is_mpim) = if dm.is_mpim.unwrap_or(false) {
                        // This is a Group DM (MPIM)
                        // Group DMs don't have a single user field, they have multiple participants
                        let mut group_name = dm.name.clone()
                            .or_else(|| dm.name_normalized.clone())
                            .unwrap_or_else(|| format!("Group-DM-{}", &dm.id[..8.min(dm.id.len())]));

                        // Debug: Log the raw group name we're processing
                        info!("[DEBUG] Raw Group DM name for {}: '{}'", dm.id, group_name);

                        // Clean up the mpdm- prefix and resolve usernames to display names
                        if group_name.starts_with("mpdm-") {
                            info!("[DEBUG] ===== START MPDM NAME RESOLUTION =====");
                            info!("[DEBUG] Processing mpdm Group DM name: '{}'", group_name);

                            let user_part = &group_name[5..]; // Remove "mpdm-" prefix
                            // Remove trailing -1 if present
                            let clean_part = user_part.trim_end_matches("-1");
                            // Split by -- to get individual usernames (not user IDs!)
                            let usernames: Vec<&str> = clean_part.split("--").collect();
                            info!("[DEBUG] Extracted usernames from mpdm name: {:?}", usernames);

                            let mut resolved_names = Vec::new();

                            for username in usernames {
                                info!("[DEBUG] Resolving username: '{}'", username);

                                // Look through all users to find the one with this username
                                let mut found_display_name = None;

                                for user in &users {
                                    // Check if this user's name matches the username
                                    if user.name.trim().eq_ignore_ascii_case(username.trim()) {
                                        info!("[DEBUG] Found user with username '{}': ID={}, real_name={:?}",
                                             username, user.id, user.real_name);

                                        // Get their display name from user_map
                                        if let Some(display_name) = user_map.get(&user.id) {
                                            info!("[DEBUG] Resolved '{}' (ID: {}) to display name: '{}'",
                                                 username, user.id, display_name);
                                            found_display_name = Some(display_name.clone());
                                            break;
                                        } else {
                                            info!("[DEBUG] WARNING: User ID {} not found in user_map!", user.id);
                                        }
                                    }
                                }

                                // Use the resolved display name or fall back to the username
                                if let Some(display_name) = found_display_name {
                                    resolved_names.push(display_name);
                                } else {
                                    info!("[DEBUG] Could not resolve username '{}', using as-is", username);
                                    resolved_names.push(username.to_string());
                                }
                            }

                            // Create a readable name from resolved users
                            info!("[DEBUG] Resolved names: {:?}", resolved_names);
                            group_name = resolved_names.join(", ");
                            info!("[DEBUG] Final mpdm Group DM name: '{}'", group_name);
                            info!("[DEBUG] ===== END MPDM NAME RESOLUTION =====");
                        } else if group_name.contains("-") {
                            // Handle Group DM names that come as usernames separated by dashes
                            // Example: "a.ogawa-kanayama-yandt89-y.kurihashi-1"
                            info!("[DEBUG] ===== START GROUP DM NAME RESOLUTION =====");
                            info!("[DEBUG] Processing username-based Group DM name: '{}'", group_name);
                            info!("[DEBUG] Channel ID: {}", dm.id);

                            // Remove trailing -1 if present
                            let clean_name = group_name.trim_end_matches("-1");

                            // Split by dashes to get individual usernames
                            let usernames: Vec<&str> = clean_name.split('-').collect();
                            let mut resolved_names = Vec::new();

                            for username in usernames {
                                // Look through the user_map to find the user with this username
                                let mut found_display_name = None;

                                // Debug: Log what we're looking for
                                info!("[DEBUG] Looking for username: '{}'", username);

                                // The user_map is keyed by user ID, but we need to find by username
                                // We need to iterate through all users to find the matching username
                                for user in &users {
                                    // Trim and compare case-insensitively to avoid issues
                                    if user.name.trim().eq_ignore_ascii_case(username.trim()) {
                                        // Found the user, now get their display name from user_map
                                        info!("[DEBUG] Found user with username '{}': ID={}, name={}, real_name={:?}",
                                             username, user.id, user.name, user.real_name);

                                        // Debug: Log profile info
                                        if let Some(ref profile) = user.profile {
                                            info!("[DEBUG]   profile.display_name={:?}, profile.real_name={:?}",
                                                 profile.display_name, profile.real_name);
                                        }

                                        if let Some(display_name) = user_map.get(&user.id) {
                                            info!("[DEBUG] user_map[{}] = '{}'", user.id, display_name);
                                            info!("[DEBUG] Resolved username '{}' (ID: {}) to display name: '{}'",
                                                 username, user.id, display_name);
                                            found_display_name = Some(display_name.clone());
                                            break;
                                        } else {
                                            info!("[DEBUG] WARNING: User ID {} not found in user_map!", user.id);
                                        }
                                    }
                                }

                                // Use the resolved display name or fall back to the username
                                if let Some(display_name) = found_display_name {
                                    resolved_names.push(display_name);
                                } else {
                                    // Couldn't resolve, use the username as-is
                                    info!("[DEBUG] Could not resolve username '{}' to display name, using as-is", username);
                                    resolved_names.push(username.to_string());
                                }
                            }

                            // Create a readable name from resolved users
                            info!("[DEBUG] Resolved names array: {:?}", resolved_names);
                            group_name = resolved_names.join(", ");
                            info!("[DEBUG] Final resolved Group DM name: '{}'", group_name);
                            info!("[DEBUG] ===== END GROUP DM NAME RESOLUTION =====");
                        }

                        // Prefix with special indicator for Group DMs
                        let display_name = format!("👥 {}", group_name);
                        info!("[DEBUG] *** FINAL Group DM channel {} -> '{}' (will be cached as this)", dm.id, display_name);
                        (display_name, false, true)
                    } else if dm.is_im.unwrap_or(false) {
                        // This is a regular DM
                        // DMs have a user field that contains the other user's ID
                        let display_name = if let Some(ref user_id) = dm.user {
                            // Debug: Check what we're about to look up
                            if user_id == "U04F9M6JX2M" {
                                info!("[DEBUG] About to look up user U04F9M6JX2M in user_map");
                                info!("[DEBUG] user_map contains key '{}': {}", user_id, user_map.contains_key(user_id));
                                if let Some(mapped_name) = user_map.get(user_id) {
                                    info!("[DEBUG] user_map['{}'] = '{}'", user_id, mapped_name);
                                }
                            }

                            // Look up the user's display name
                            let name = user_map.get(user_id)
                                .map(|name| format!("@{}", name))
                                .unwrap_or_else(|| format!("@{}", user_id));

                            // Special debug for our problematic user
                            if user_id == "U04F9M6JX2M" {
                                info!("[DEBUG] DM channel {} for user U04F9M6JX2M resulted in name: '{}'", dm.id, name);
                            }

                            info!("[DEBUG] DM channel {} mapped to user '{}' -> '{}'", dm.id, user_id, name);
                            name
                        } else {
                            // Fallback: use channel ID
                            info!("[DEBUG] DM channel {} has no user field, using fallback name", dm.id);
                            format!("DM-{}", dm.id)
                        };

                        // If we couldn't find the user in the map, try fetching individually
                        // Check if display_name is just "@" + user ID (e.g., "@U2R5VHFND")
                        // User IDs typically start with U and are 9-11 alphanumeric characters
                        let is_raw_user_id = display_name.starts_with("@U") &&
                                            display_name.len() >= 10 &&
                                            display_name.len() <= 12 &&
                                            display_name[1..].chars().all(|c| c.is_alphanumeric());

                        let final_display_name = if is_raw_user_id {
                            // This looks like we only have a user ID, try to fetch the user info
                            if let Some(user_id) = &dm.user {
                                info!("[DEBUG] User {} not in initial map (display_name='{}'), attempting individual fetch",
                                     user_id, display_name);
                                match client.get_user_info(user_id).await {
                                    Ok(user_info) => {
                                        let fetched_name = user_info.profile.as_ref()
                                            .and_then(|p| p.display_name.clone())
                                            .filter(|n| !n.is_empty())
                                            .or_else(|| user_info.profile.as_ref()
                                                .and_then(|p| p.real_name.clone())
                                                .filter(|n| !n.is_empty()))
                                            .or_else(|| user_info.real_name.clone().filter(|n| !n.is_empty()))
                                            .unwrap_or_else(|| user_info.name.clone());

                                        let formatted_name = if user_info.deleted.unwrap_or(false) {
                                            format!("@[Deleted] {}", fetched_name)
                                        } else if user_info.is_bot.unwrap_or(false) {
                                            format!("@[Bot] {}", fetched_name)
                                        } else {
                                            format!("@{}", fetched_name)
                                        };

                                        info!("[DEBUG] Successfully fetched user {} -> '{}'", user_id, formatted_name);
                                        formatted_name
                                    }
                                    Err(e) => {
                                        info!("[DEBUG] Failed to fetch user {}: {}", user_id, e);
                                        display_name // Keep the original ID-based name
                                    }
                                }
                            } else {
                                display_name
                            }
                        } else {
                            display_name
                        };
                        (final_display_name, true, false)
                    } else {
                        // Unknown type - shouldn't happen but handle gracefully
                        warn!("[DEBUG] Unknown channel type for {}: is_im={:?}, is_mpim={:?}",
                              dm.id, dm.is_im, dm.is_mpim);
                        continue;
                    };

                    // Add to channels list with proper type flags
                    channels.push(crate::slack::models::SlackConversation {
                        id: dm.id.clone(),
                        name: Some(dm_name.clone()),
                        name_normalized: dm.name_normalized.clone(),
                        is_channel: Some(false),
                        is_group: Some(is_mpim), // Group DMs are considered "groups" in Slack
                        is_im: Some(is_im),
                        is_mpim: Some(is_mpim),
                        is_private: Some(true), // Both DMs and Group DMs are private
                        user: dm.user,
                        is_member: None,  // Not applicable for DMs
                        is_muted: None,   // Not applicable for DMs
                        is_archived: None, // Not applicable for DMs
                    });

                    let channel_type = if is_mpim { "Group DM" } else { "DM" };
                    info!("[DEBUG] Added {} channel to list: {} -> {}", channel_type, dm.id, dm_name);
                }
            }
            Err(e) => {
                // Log but don't fail - DMs are optional
                if e.to_string().contains("missing_scope") || e.to_string().contains("im:read") {
                    info!("DM channels not available: Missing im:read permission");
                } else {
                    warn!("Failed to fetch DM channels: {}", e);
                }
            }
        }
    }

    let mut channel_list = Vec::new();
    let mut dm_count = 0;
    let mut group_dm_count = 0;
    for channel in channels {
        if let Some(name) = channel.name {
            if name.starts_with("@") {
                dm_count += 1;
            } else if name.starts_with("👥") {
                group_dm_count += 1;
            }
            channel_list.push((channel.id.clone(), name.clone()));
            // Cache the channel with its type information
            let is_im = channel.is_im.unwrap_or(false);
            let is_mpim = channel.is_mpim.unwrap_or(false);
            state.cache_channel(channel.id, name, is_im, is_mpim).await;
        }
    }

    info!("[DEBUG] Returning {} total channels: {} regular DMs, {} Group DMs",
          channel_list.len(), dm_count, group_dm_count);
    if dm_count > 0 || group_dm_count > 0 {
        info!("[DEBUG] Sample DM/Group DM channels: {:?}",
            channel_list.iter()
                .filter(|(_, name)| name.starts_with("@") || name.starts_with("👥"))
                .take(5)
                .collect::<Vec<_>>());
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
    has_files: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<SearchResult> {
    // This is an optimized version that returns messages immediately without reactions
    // Reactions will be loaded progressively by the frontend

    let start_time = Instant::now();

    // Check cache first (skip if force_refresh is true)
    if !force_refresh.unwrap_or(false) {
        if let Some(cached_result) = state
            .get_cached_search(&query, &channel, &user, &from_date, &to_date, &limit, &has_files)
            .await
        {
            info!("Fast search: returning cached result in {}ms", start_time.elapsed().as_millis());
            return Ok(cached_result);
        }
    } else {
        info!("Fast search: Skipping cache due to force_refresh=true");
    }

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
            
            // Determine if this includes DM channels
            let dm_channel_count = channels.iter()
                .filter(|ch| ch.starts_with("D") || ch.starts_with("G"))
                .count();

            if dm_channel_count > 0 {
                info!("Fast search: Multi-channel search includes {} DM/Group DM channels", dm_channel_count);
            }

            // Create futures for parallel execution
            let search_futures = channels.iter().map(|single_channel| {
                let client = Arc::clone(&client);
                let query = query.clone();
                let channel = single_channel.clone();
                let user = user.clone();
                let from_date = from_date.clone();
                let to_date = to_date.clone();

                async move {
                    // Check if this is a DM/Group DM channel
                    let is_dm_channel = channel.starts_with("D") || channel.starts_with("G");

                    if is_dm_channel {
                        // Use DM-specific search for DM/Group DM channels
                        info!("Fast search: Using DM search for channel: {}", channel);

                        // For DMs, use the search_dm_messages function
                        let query_str = if query.is_empty() {
                            None
                        } else {
                            Some(query.as_str())
                        };

                        match client.search_dm_messages(&channel, query_str, max_results).await {
                            Ok(mut messages) => {
                                // Apply date filters if specified
                                if let Some(ref from) = from_date {
                                    messages.retain(|msg| {
                                        let ts_float: f64 = msg.ts.parse().unwrap_or(0.0);
                                        let msg_date = chrono::DateTime::from_timestamp(ts_float as i64, 0)
                                            .map(|dt| dt.format("%Y-%m-%d").to_string())
                                            .unwrap_or_default();
                                        msg_date >= *from
                                    });
                                }

                                if let Some(ref to) = to_date {
                                    messages.retain(|msg| {
                                        let ts_float: f64 = msg.ts.parse().unwrap_or(0.0);
                                        let msg_date = chrono::DateTime::from_timestamp(ts_float as i64, 0)
                                            .map(|dt| dt.format("%Y-%m-%d").to_string())
                                            .unwrap_or_default();
                                        msg_date <= *to
                                    });
                                }

                                // Add channel info to DM messages
                                for msg in &mut messages {
                                    if msg.channel.is_none() {
                                        msg.channel = Some(SlackChannelInfo {
                                            id: channel.clone(),
                                            name: channel.clone(), // Will be resolved to proper name later
                                        });
                                    }
                                }

                                info!("Fast search: Found {} messages in DM channel '{}'", messages.len(), channel);
                                Ok::<Vec<SlackMessage>, anyhow::Error>(messages)
                            }
                            Err(e) => {
                                error!("Fast search: Failed to search DM channel '{}': {}", channel, e);
                                // Return empty vec on error to continue with other channels
                                Ok::<Vec<SlackMessage>, anyhow::Error>(vec![])
                            }
                        }
                    } else {
                        // Use regular search for normal channels
                        let search_request = SearchRequest {
                            query: query.clone(),
                            channel: Some(channel.clone()),
                            user,
                            has_files,
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
                has_files,
            };
            
            let search_query = build_search_query(&search_request);
            info!("Fast search with query: {}", search_query);

            // Check if this is a DM or Group DM channel search based on cached channel info
            let is_dm_search = if let Some(ref ch) = channel {
                // Get the full channel cache to check channel type
                let channel_cache_full = state.get_channel_cache_full().await;
                if let Some(cached_channel) = channel_cache_full.get(ch) {
                    cached_channel.is_im || cached_channel.is_mpim
                } else {
                    // Fallback to ID prefix check for channels not in cache
                    (ch.starts_with("D") || ch.starts_with("G")) && ch.len() > 8
                }
            } else {
                false
            };

            if is_dm_search {
                if let Some(ref ch) = channel {
                    let channel_cache_full = state.get_channel_cache_full().await;
                    let channel_type = if let Some(cached_channel) = channel_cache_full.get(ch) {
                        if cached_channel.is_mpim {
                            "Group DM"
                        } else {
                            "DM"
                        }
                    } else if ch.starts_with("G") {
                        "Group DM"
                    } else {
                        "DM"
                    };
                    info!("Detected {} channel search for: {}", channel_type, ch);

                    // Use the dedicated DM search function
                    let query_str = if query.is_empty() {
                        None
                    } else {
                        Some(query.as_str())
                    };
                    let dm_messages = client.search_dm_messages(
                        ch,
                        query_str,
                        limit.unwrap_or(100),
                    ).await?;

                    info!("{} search returned {} messages", channel_type, dm_messages.len());

                    // Filter by date if specified
                    let filtered_messages: Vec<SlackMessage> = dm_messages.into_iter()
                        .filter(|msg| {
                            if let Some(ref from) = from_date {
                                // msg.ts is a String in SlackMessage
                                let ts_float: f64 = msg.ts.parse().unwrap_or(0.0);
                                let msg_date = chrono::DateTime::from_timestamp(ts_float as i64, 0)
                                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                                    .unwrap_or_default();
                                msg_date >= *from
                            } else {
                                true
                            }
                        })
                        .filter(|msg| {
                            if let Some(ref to) = to_date {
                                // msg.ts is a String in SlackMessage
                                let ts_float: f64 = msg.ts.parse().unwrap_or(0.0);
                                let msg_date = chrono::DateTime::from_timestamp(ts_float as i64, 0)
                                    .map(|dt| dt.format("%Y-%m-%d").to_string())
                                    .unwrap_or_default();
                                msg_date <= *to
                            } else {
                                true
                            }
                        })
                        .collect();

                    info!("After date filtering: {} messages", filtered_messages.len());
                    all_slack_messages = filtered_messages;

                    // Skip the normal search flow
                }
            } else if !is_dm_search && search_query == "USE_CONVERSATIONS_HISTORY" {
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

                // Filter by user if specified (only for single user, multi-user is handled below)
                if let Some(ref user_filter) = user {
                    // Skip single-user filter if this is a multi-user query (contains comma)
                    if !user_filter.contains(',') {
                        let user_id = if user_filter.starts_with("<@") && user_filter.ends_with(">") {
                            &user_filter[2..user_filter.len()-1]
                        } else {
                            user_filter.trim_start_matches('@')
                        };

                        info!("Filtering {} messages for single user: {}", all_slack_messages.len(), user_id);

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

                        info!("After single user filter: {} messages", all_slack_messages.len());
                    }
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
            has_files,
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
        } else if let Some(bot_profile) = &slack_msg.bot_profile {
            // For bot/app messages, use bot profile name
            bot_profile.name.clone().unwrap_or_else(|| {
                slack_msg.username.clone().unwrap_or_else(|| "Unknown".to_string())
            })
        } else {
            slack_msg.username.clone().unwrap_or_else(|| "Unknown".to_string())
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
            user: slack_msg.user.clone().unwrap_or_else(|| {
                // For bot messages, use bot_id if available, otherwise use empty string
                slack_msg.bot_id.clone().unwrap_or_else(|| String::new())
            }),
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
    // BUT skip cache for force_refresh (used in realtime updates)
    if !force_refresh.unwrap_or(false) {
        for message in messages.iter_mut() {
            if let Some(cached_reactions) = state.get_cached_reactions(&message.channel, &message.ts).await {
                message.reactions = Some(cached_reactions);
            }
        }
    } else {
        info!("Fast search: Skipping reaction cache due to force_refresh=true");
    }

    // Apply file filter if requested
    if let Some(true) = has_files {
        let before_count = messages.len();
        messages.retain(|msg| {
            msg.files.is_some() && !msg.files.as_ref().unwrap().is_empty()
        });
        info!("Fast search: Applied file filter: {}/{} messages with attachments", messages.len(), before_count);
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
                has_files,
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
                has_files,
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
            has_files,
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
