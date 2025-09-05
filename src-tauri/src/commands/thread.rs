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

    // Fetch the thread messages
    let response = match client.get_thread(&channel_id, &thread_ts).await {
        Ok(r) => {
            info!("Received thread response from Slack API");
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
            error!("Failed to fetch thread from Slack API: {}", e);
            return Err(crate::error::AppError::ApiError(format!(
                "Failed to fetch thread: {}",
                e
            )));
        }
    };

    let messages = response.messages.ok_or_else(|| {
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
                    state.cache_channel(channel_id.clone(), name.clone()).await;
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

    // Convert messages to our format
    let mut converted_messages = Vec::new();

    for msg in messages {
        let user_name = if let Some(user_id) = &msg.user {
            user_cache_simple
                .get(user_id)
                .cloned()
                .unwrap_or_else(|| user_id.clone())
        } else {
            "Unknown".to_string()
        };

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
            user: msg.user.clone().unwrap_or_else(|| "Unknown".to_string()),
            user_name,
            text: processed_text,
            channel: channel_id.clone(),
            channel_name: channel_name.clone(),
            permalink,
            is_thread_parent: msg.reply_count.unwrap_or(0) > 0,
            reply_count: msg.reply_count,
            reactions: None, // Thread messages don't include reactions for now
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
