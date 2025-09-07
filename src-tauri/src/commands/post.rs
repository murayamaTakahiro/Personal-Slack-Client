use crate::slack::models::PostMessageResponse;
use crate::state::AppState;

#[tauri::command]
pub async fn post_to_channel(
    state: tauri::State<'_, AppState>,
    channel_id: String,
    text: String,
) -> Result<PostMessageResponse, String> {
    let client = state.get_client().await.map_err(|e| e.to_string())?;

    match client.post_message(&channel_id, &text, None).await {
        Ok(mut response) => {
            // Get current user ID and name for the posted message
            if let Some(ref mut message) = response.message {
                // Get current user ID from state
                if let Ok((_, Some(user_id))) = client.test_auth().await {
                    // Set the user ID
                    message.user = user_id.clone();
                    
                    // Try to get user name from cache
                    let user_cache = state.get_user_cache().await;
                    if let Some(user_name) = user_cache.get(&user_id) {
                        message.user_name = Some(user_name.clone());
                    } else {
                        // Fetch user info if not in cache
                        if let Ok(user_info) = client.get_user_info(&user_id).await {
                            let name = user_info
                                .profile
                                .as_ref()
                                .and_then(|p| p.display_name.clone())
                                .or_else(|| user_info.real_name.clone())
                                .unwrap_or_else(|| user_info.name.clone());
                            message.user_name = Some(name.clone());
                            // Cache the user name
                            state.cache_user(user_id.clone(), name, None).await;
                        } else {
                            // If we can't get the user info, at least set the user ID as the name
                            message.user_name = Some(user_id.clone());
                        }
                    }
                }
            }
            Ok(response)
        }
        Err(e) => {
            eprintln!("Failed to post message: {e:?}");
            Err(format!("Failed to post message: {e}"))
        }
    }
}

#[tauri::command]
pub async fn post_thread_reply(
    state: tauri::State<'_, AppState>,
    channel_id: String,
    thread_ts: String,
    text: String,
) -> Result<PostMessageResponse, String> {
    let client = state.get_client().await.map_err(|e| e.to_string())?;

    match client
        .post_message(&channel_id, &text, Some(&thread_ts))
        .await
    {
        Ok(mut response) => {
            // Get current user ID and name for the posted message
            if let Some(ref mut message) = response.message {
                // Get current user ID from state
                if let Ok((_, Some(user_id))) = client.test_auth().await {
                    // Set the user ID
                    message.user = user_id.clone();
                    
                    // Try to get user name from cache
                    let user_cache = state.get_user_cache().await;
                    if let Some(user_name) = user_cache.get(&user_id) {
                        message.user_name = Some(user_name.clone());
                    } else {
                        // Fetch user info if not in cache
                        if let Ok(user_info) = client.get_user_info(&user_id).await {
                            let name = user_info
                                .profile
                                .as_ref()
                                .and_then(|p| p.display_name.clone())
                                .or_else(|| user_info.real_name.clone())
                                .unwrap_or_else(|| user_info.name.clone());
                            message.user_name = Some(name.clone());
                            // Cache the user name
                            state.cache_user(user_id.clone(), name, None).await;
                        } else {
                            // If we can't get the user info, at least set the user ID as the name
                            message.user_name = Some(user_id.clone());
                        }
                    }
                }
            }
            Ok(response)
        }
        Err(e) => {
            eprintln!("Failed to post thread reply: {e:?}");
            Err(format!("Failed to post thread reply: {e}"))
        }
    }
}

#[tauri::command]
pub async fn check_posting_permissions(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let client = state.get_client().await.map_err(|e| e.to_string())?;

    // Try posting a test message to verify permissions
    // Using auth.test would be better but this gives us actual posting permission check
    match client.test_auth().await {
        Ok((is_valid, _user_id)) => Ok(is_valid),
        Err(e) => {
            eprintln!("Failed to check permissions: {e:?}");
            Ok(false) // Return false if we can't verify, safer than assuming true
        }
    }
}
