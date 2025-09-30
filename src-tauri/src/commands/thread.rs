use crate::error::AppResult;
use crate::slack::{parse_slack_url, Message, ParsedUrl, ThreadMessages};
use crate::state::{AppState, CachedUser};
use std::collections::HashMap;
use tauri::State;
use tracing::{debug, error, info, warn};

fn replace_user_mentions(text: &str, user_cache: &HashMap<String, CachedUser>) -> String {
    crate::slack::parser::replace_user_mentions(text, user_cache)
}

#[tauri::command]
pub async fn get_thread(
    channel_id: String,
    thread_ts: String,
    state: State<'_, AppState>,
) -> AppResult<ThreadMessages> {
    info!(
        "Getting thread for channel: {}, ts: {}",
        channel_id, thread_ts
    );

    // Get the Slack client from app state
    let client = match state.get_client().await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to get Slack client: {}", e);
            return Err(e);
        }
    };

    // First, try to get the thread with the provided timestamp
    // If it returns only one message and that message is a reply,
    // we need to use the thread_ts from that message to get the full thread
    let initial_response = match client.get_thread(&channel_id, &thread_ts).await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to fetch thread from Slack API: {}", e);
            return Err(crate::error::AppError::ApiError(format!(
                "Failed to fetch thread: {}",
                e
            )));
        }
    };

    // Check if we got a single reply message
    let actual_thread_ts = if let Some(ref messages) = initial_response.messages {
        if messages.len() == 1 {
            if let Some(first_msg) = messages.first() {
                // If this single message has a thread_ts different from its ts,
                // it's a reply and we should use its thread_ts to get the full thread
                if let Some(ref msg_thread_ts) = first_msg.thread_ts {
                    if msg_thread_ts != &first_msg.ts {
                        info!("Detected child message (ts={}, thread_ts={}). Fetching full thread using parent ts={}",
                            first_msg.ts, msg_thread_ts, msg_thread_ts);
                        msg_thread_ts.clone()
                    } else {
                        thread_ts.clone()
                    }
                } else {
                    thread_ts.clone()
                }
            } else {
                thread_ts.clone()
            }
        } else {
            thread_ts.clone()
        }
    } else {
        thread_ts.clone()
    };

    // If we determined we need to use a different thread_ts, fetch again
    let response = if actual_thread_ts != thread_ts {
        match client.get_thread(&channel_id, &actual_thread_ts).await {
            Ok(r) => {
                info!("Successfully fetched full thread using parent ts={}", actual_thread_ts);
                if let Some(ref messages) = r.messages {
                    info!("Thread contains {} messages", messages.len());
                    for (i, msg) in messages.iter().enumerate() {
                        info!("  Message {}: ts={}, thread_ts={:?}, text_preview={}",
                            i,
                            msg.ts,
                            msg.thread_ts,
                            &msg.text.chars().take(50).collect::<String>()
                        );
                    }
                } else {
                    info!("Thread response has no messages");
                }
                r
            }
            Err(e) => {
                warn!("Failed to fetch full thread with parent ts={}, falling back to original response: {}", 
                    actual_thread_ts, e);
                initial_response
            }
        }
    } else {
        info!("Using initial response for thread");
        if let Some(ref messages) = initial_response.messages {
            info!("Thread contains {} messages", messages.len());
            for (i, msg) in messages.iter().enumerate() {
                info!("  Message {}: ts={}, thread_ts={:?}, text_preview={}",
                    i,
                    msg.ts,
                    msg.thread_ts,
                    &msg.text.chars().take(50).collect::<String>()
                );
            }
        } else {
            info!("Thread response has no messages");
        }
        initial_response
    };
    
    // Special case: Check if we still need a synthetic parent
    // This happens when the parent message is deleted or inaccessible
    let mut synthetic_parent_needed = false;
    let mut orphan_thread_ts = None;
    
    if let Some(ref messages) = response.messages {
        // Check if we have any messages and none of them is a parent
        let has_parent = messages.iter().any(|msg| {
            msg.thread_ts.is_none() || msg.thread_ts.as_ref() == Some(&msg.ts)
        });
        
        if !has_parent && !messages.is_empty() {
            // All messages are replies, we need a synthetic parent
            if let Some(first_msg) = messages.first() {
                if let Some(ref msg_thread_ts) = first_msg.thread_ts {
                    warn!("No parent message found in thread. Parent ts={} may be deleted or inaccessible.", 
                        msg_thread_ts);
                    info!("Creating synthetic parent message for orphaned thread");
                    synthetic_parent_needed = true;
                    orphan_thread_ts = Some(msg_thread_ts.clone());
                }
            }
        }
    }

    let mut messages = response.messages.ok_or_else(|| {
        crate::error::AppError::ApiError("No messages in thread response".to_string())
    })?;

    if messages.is_empty() {
        return Err(crate::error::AppError::ApiError(
            "Thread not found".to_string(),
        ));
    }

    // Get user and channel caches
    let user_cache_simple = state.get_user_cache().await;
    let mut channel_cache = state.get_channel_cache().await;

    // If channel name is not in cache, try to fetch it (but don't fail if it doesn't work)
    if !channel_cache.contains_key(&channel_id) {
        match client.get_channel_info(&channel_id).await {
            Ok(channel_info) => {
                if let Some(name) = channel_info.name {
                    // Determine if this is a DM or Group DM based on channel info
                    let is_im = channel_info.is_im.unwrap_or(false);
                    let is_mpim = channel_info.is_mpim.unwrap_or(false);
                    state.cache_channel(channel_id.clone(), name.clone(), is_im, is_mpim).await;
                    channel_cache.insert(channel_id.clone(), name);
                }
            }
            Err(e) => {
                debug!("Could not fetch channel info for {}: {}", channel_id, e);
                // Use channel ID as fallback name
                channel_cache.insert(channel_id.clone(), channel_id.clone());
            }
        }
    }

    // Collect unique user IDs that need fetching
    let mut users_to_fetch = Vec::new();
    for msg in &messages {
        if let Some(user_id) = &msg.user {
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
    }

    // Refresh cache after batch fetching
    let user_cache_simple = state.get_user_cache().await;
    let user_cache_full = state.get_user_cache_full().await;

    // If we need a synthetic parent, create it
    if synthetic_parent_needed {
        if let Some(ref thread_ts) = orphan_thread_ts {
            info!("Inserting synthetic parent message with ts={}", thread_ts);
            // Count the actual replies we have
            let reply_count = messages.len();
            // Create a synthetic parent message using SlackReplyMessage struct
            let synthetic_parent = crate::slack::SlackReplyMessage {
                ts: thread_ts.clone(),
                thread_ts: Some(thread_ts.clone()), // Parent has thread_ts equal to ts
                user: Some("system".to_string()),
                username: Some("System".to_string()),
                bot_id: None,
                bot_profile: None,
                text: "[Thread parent message is unavailable - may have been deleted or is inaccessible]".to_string(),
                reply_count: Some(reply_count), // Set the actual reply count
                reply_users: None,
                reply_users_count: None,
                latest_reply: None,
                reactions: None,
                files: None,
            };
            // Insert at the beginning
            messages.insert(0, synthetic_parent);
        }
    }
    
    // Convert messages to our format
    let mut converted_messages = Vec::new();

    for msg in messages {
        // Debug log to understand the message structure
        info!("Thread message data: user={:?}, username={:?}, bot_id={:?}, bot_profile={:?}",
            msg.user, msg.username, msg.bot_id, msg.bot_profile);

        let user_name = if let Some(user_id) = &msg.user {
            user_cache_simple
                .get(user_id)
                .cloned()
                .unwrap_or_else(|| user_id.clone())
        } else if let Some(bot_profile) = &msg.bot_profile {
            // For bot/app messages, use bot profile name
            bot_profile.name.clone().unwrap_or_else(|| {
                msg.username.clone().unwrap_or_else(|| "Unknown".to_string())
            })
        } else {
            // Fallback to username field
            msg.username.clone().unwrap_or_else(|| "Unknown".to_string())
        };

        info!("Thread message final user_name: {}", user_name);

        // Get channel name from cache
        let channel_name = channel_cache
            .get(&channel_id)
            .cloned()
            .unwrap_or_else(|| channel_id.clone());

        // Build permalink (approximate, as we don't have workspace info)
        let permalink = format!(
            "https://slack.com/archives/{}/p{}",
            channel_id,
            msg.ts.replace('.', "")
        );

        // Replace user mentions in the text
        let processed_text = replace_user_mentions(&msg.text, &user_cache_full);

        converted_messages.push(Message {
            ts: msg.ts.clone(),
            thread_ts: msg.thread_ts.clone(),
            user: msg.user.clone()
                .or_else(|| msg.bot_id.clone())
                .or_else(|| msg.username.clone())
                .unwrap_or_else(|| String::new()),
            user_name,
            text: processed_text,
            channel: channel_id.clone(),
            channel_name: channel_name.clone(),
            permalink,
            is_thread_parent: msg.reply_count.unwrap_or(0) > 0,
            reply_count: msg.reply_count,
            reactions: msg.reactions.clone(),
            files: msg.files.clone(),
        });
    }

    // Find the parent message (the one without thread_ts or where thread_ts equals ts)
    let mut parent: Option<Message> = None;
    let mut replies = Vec::new();
    
    info!("Processing {} messages to find parent and replies", converted_messages.len());
    
    for msg in converted_messages {
        // Debug logging to understand the messages
        info!("  Message: ts={}, thread_ts={:?}, is_thread_parent={}", 
            msg.ts, msg.thread_ts, msg.is_thread_parent);
        
        // A message is the parent if:
        // 1. It has no thread_ts (it's the root message), OR
        // 2. Its thread_ts equals its ts (it's the thread parent)
        let is_parent = msg.thread_ts.is_none() || 
                       msg.thread_ts.as_ref() == Some(&msg.ts);
        
        if is_parent && parent.is_none() {
            info!("  -> Identified as PARENT");
            parent = Some(msg);
        } else {
            info!("  -> Identified as REPLY");
            replies.push(msg);
        }
    }
    
    // If we couldn't find a parent by the above logic, use the first message
    let parent = parent.unwrap_or_else(|| {
        if !replies.is_empty() {
            warn!("Could not identify thread parent, using first reply as parent");
            replies.remove(0)
        } else {
            // This should not happen, but handle it gracefully
            error!("No messages found in thread response");
            Message {
                ts: thread_ts.to_string(),
                thread_ts: None,
                user: "Unknown".to_string(),
                user_name: "Unknown".to_string(),
                text: "Thread not found".to_string(),
                channel: channel_id.clone(),
                channel_name: channel_cache.get(&channel_id).cloned().unwrap_or_else(|| channel_id.clone()),
                permalink: format!("https://slack.com/archives/{}/p{}", channel_id, thread_ts.replace('.', "")),
                is_thread_parent: false,
                reply_count: Some(0),
                reactions: None,
                files: None,
            }
        }
    });

    info!("Thread retrieved: parent ts={}, {} replies", parent.ts, replies.len());

    Ok(ThreadMessages { parent, replies })
}

#[tauri::command]
pub async fn parse_slack_url_command(url: String) -> AppResult<ParsedUrl> {
    info!("Parsing Slack URL: {}", url);

    match parse_slack_url(&url) {
        Ok(parsed) => {
            info!(
                "URL parsed successfully: channel={}, ts={}, thread_ts={:?}",
                parsed.channel_id, parsed.message_ts, parsed.thread_ts
            );
            Ok(parsed)
        }
        Err(e) => {
            error!("Failed to parse URL '{}': {}", url, e);
            Err(crate::error::AppError::ParseError(format!(
                "Invalid Slack URL format: {}",
                e
            )))
        }
    }
}

#[tauri::command]
pub async fn get_thread_from_url(
    url: String,
    state: State<'_, AppState>,
) -> AppResult<ThreadMessages> {
    info!("Getting thread from URL: {}", url);

    // Parse the URL
    let parsed = match parse_slack_url(&url) {
        Ok(p) => {
            info!(
                "URL parsed successfully: channel={}, ts={}, thread_ts={:?}",
                p.channel_id, p.message_ts, p.thread_ts
            );
            p
        }
        Err(e) => {
            error!("Failed to parse URL '{}': {}", url, e);
            return Err(crate::error::AppError::ParseError(format!(
                "Invalid Slack URL format: {}",
                e
            )));
        }
    };

    // Determine the thread timestamp
    let thread_ts = parsed
        .thread_ts
        .unwrap_or_else(|| parsed.message_ts.clone());
    info!("Using thread timestamp: {}", thread_ts);

    // Get the thread
    match get_thread(parsed.channel_id.clone(), thread_ts.clone(), state).await {
        Ok(thread) => {
            info!(
                "Successfully retrieved thread with {} replies",
                thread.replies.len()
            );
            Ok(thread)
        }
        Err(e) => {
            error!(
                "Failed to get thread for channel={}, ts={}: {}",
                parsed.channel_id, thread_ts, e
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn open_in_slack(permalink: String) -> AppResult<()> {
    debug!("Opening in Slack: {}", permalink);

    // Use Tauri's shell API to open the URL in the default browser
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", &permalink])
            .spawn()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&permalink)
            .spawn()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&permalink)
            .spawn()
            .map_err(|e| crate::error::AppError::Unknown(e.to_string()))?;
    }

    info!("Opened URL in browser");

    Ok(())
}
