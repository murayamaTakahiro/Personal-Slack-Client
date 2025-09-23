use crate::error::AppResult;
use crate::state::AppState;
use tauri::State;
use tracing::info;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// Extended SlackUserInfo with bot and deleted fields
#[derive(Debug, Deserialize)]
struct SlackUserInfoFull {
    pub id: String,
    pub name: String,
    pub real_name: Option<String>,
    pub profile: Option<SlackUserProfileFull>,
    pub is_bot: Option<bool>,
    pub deleted: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SlackUserProfileFull {
    pub display_name: Option<String>,
    pub real_name: Option<String>,
    pub image_48: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackUsersListResponseFull {
    pub ok: bool,
    pub members: Option<Vec<SlackUserInfoFull>>,
    pub error: Option<String>,
    pub response_metadata: Option<ResponseMetadata>,
}

#[derive(Debug, Deserialize)]
struct ResponseMetadata {
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserDebugInfo {
    pub id: String,
    pub name: String,
    pub real_name: Option<String>,
    pub display_name: Option<String>,
    pub is_bot: bool,
    pub deleted: bool,
    pub in_cache: bool,
    pub cache_name: Option<String>,
}

#[tauri::command]
pub async fn debug_user_info(user_id: String, state: State<'_, AppState>) -> AppResult<String> {
    let client = state.get_client().await?;

    info!("[DEBUG] Fetching info for user: {}", user_id);

    match client.get_user_info(&user_id).await {
        Ok(user_info) => {
            let mut result = format!("User Info for {}:\n", user_id);
            result.push_str(&format!("  id: {}\n", user_info.id));
            result.push_str(&format!("  name: {}\n", user_info.name));
            result.push_str(&format!("  real_name: {:?}\n", user_info.real_name));

            if let Some(ref profile) = user_info.profile {
                result.push_str("  Profile:\n");
                result.push_str(&format!("    display_name: {:?}\n", profile.display_name));
                result.push_str(&format!("    real_name: {:?}\n", profile.real_name));
            }

            // Determine what would be used as display name
            let display_name = user_info.profile.as_ref()
                .and_then(|p| p.display_name.clone())
                .filter(|n| !n.is_empty())
                .or_else(|| user_info.profile.as_ref()
                    .and_then(|p| p.real_name.clone())
                    .filter(|n| !n.is_empty()))
                .or_else(|| user_info.real_name.clone().filter(|n| !n.is_empty()))
                .or_else(|| {
                    if !user_info.name.is_empty() {
                        Some(user_info.name.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| user_info.id.clone());

            result.push_str(&format!("\nResolved display name: '{}'\n", display_name));

            info!("[DEBUG] {}", result);
            Ok(result)
        }
        Err(e) => {
            let error_msg = format!("Failed to get user info for {}: {}", user_id, e);
            info!("[DEBUG] {}", error_msg);
            Ok(error_msg)
        }
    }
}

#[tauri::command]
pub async fn debug_dm_channels(state: State<'_, AppState>) -> AppResult<String> {
    let client = state.get_client().await?;

    info!("[DEBUG] Fetching DM channels...");

    match client.get_dm_channels().await {
        Ok(dm_channels) => {
            let mut result = format!("Found {} DM channels:\n\n", dm_channels.len());

            // Look for specific user's DM
            for dm in &dm_channels {
                if dm.user.as_ref().map_or(false, |u| u == "U04F9M6JX2M") {
                    result.push_str(&format!("DM with U04F9M6JX2M (murayama):\n"));
                    result.push_str(&format!("  Channel ID: {}\n", dm.id));
                    result.push_str(&format!("  User field: {:?}\n", dm.user));
                    result.push_str(&format!("  Name: {:?}\n", dm.name));
                    result.push_str(&format!("  is_im: {:?}\n", dm.is_im));
                    result.push_str(&format!("  is_mpim: {:?}\n\n", dm.is_mpim));
                }
            }

            // Also list first 5 DMs for context
            result.push_str("First 5 DM channels:\n");
            for (i, dm) in dm_channels.iter().take(5).enumerate() {
                result.push_str(&format!("{}. Channel {}: user={:?}, name={:?}\n",
                    i+1, dm.id, dm.user, dm.name));
            }

            info!("[DEBUG] {}", result);
            Ok(result)
        }
        Err(e) => {
            let error_msg = format!("Failed to get DM channels: {}", e);
            info!("[DEBUG] {}", error_msg);
            Ok(error_msg)
        }
    }
}

#[tauri::command]
pub async fn debug_missing_users(state: State<'_, AppState>) -> AppResult<String> {
    let client = state.get_client().await?;

    info!("[DEBUG] Checking for missing users in DM channels");

    // Get all DM channels
    let dm_channels = match client.get_dm_channels().await {
        Ok(channels) => channels,
        Err(e) => {
            return Ok(format!("Failed to get DM channels: {}", e));
        }
    };

    // Get all users (including bots and deleted)
    let url = "https://slack.com/api/users.list";
    let mut all_users = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut params = HashMap::new();
        params.insert("limit", "1000".to_string());

        if let Some(ref cursor_value) = cursor {
            params.insert("cursor", cursor_value.clone());
        }

        let response = match client.client.get(url).query(&params).send().await {
            Ok(resp) => resp,
            Err(e) => {
                return Ok(format!("Failed to fetch users: {}", e));
            }
        };

        let result: SlackUsersListResponseFull = match response.json().await {
            Ok(r) => r,
            Err(e) => {
                return Ok(format!("Failed to parse user response: {}", e));
            }
        };

        if !result.ok {
            return Ok(format!("Slack API error: {:?}", result.error));
        }

        if let Some(users) = result.members {
            all_users.extend(users);
        }

        if let Some(metadata) = result.response_metadata {
            if let Some(next) = metadata.next_cursor {
                if !next.is_empty() {
                    cursor = Some(next);
                    continue;
                }
            }
        }
        break;
    }

    info!("[DEBUG] Fetched {} total users from Slack API", all_users.len());

    // Create user map
    let user_map: HashMap<String, SlackUserInfoFull> = all_users
        .into_iter()
        .map(|u| (u.id.clone(), u))
        .collect();

    // Find DM users that aren't in the user list
    let mut missing_users = Vec::new();
    let mut bot_users = Vec::new();
    let mut deleted_users = Vec::new();
    let mut normal_users = Vec::new();

    for dm in dm_channels.iter().filter(|d| d.is_im.unwrap_or(false)) {
        if let Some(ref user_id) = dm.user {
            if let Some(user) = user_map.get(user_id) {
                if user.is_bot.unwrap_or(false) {
                    bot_users.push((user_id.clone(), user.name.clone()));
                } else if user.deleted.unwrap_or(false) {
                    deleted_users.push((user_id.clone(), user.name.clone()));
                } else {
                    normal_users.push((user_id.clone(), user.name.clone()));
                }
            } else {
                missing_users.push(user_id.clone());
            }
        }
    }

    let mut result = String::new();
    result.push_str(&format!("DM Channel Analysis:\n"));
    result.push_str(&format!("Total DM channels: {}\n", dm_channels.iter().filter(|d| d.is_im.unwrap_or(false)).count()));
    result.push_str(&format!("Normal users: {}\n", normal_users.len()));
    result.push_str(&format!("Bot users: {}\n", bot_users.len()));
    result.push_str(&format!("Deleted users: {}\n", deleted_users.len()));
    result.push_str(&format!("Missing from users.list: {}\n\n", missing_users.len()));

    if !missing_users.is_empty() {
        result.push_str("Missing user IDs (not in users.list):\n");
        for id in &missing_users {
            result.push_str(&format!("  - {}\n", id));
        }
        result.push_str("\n");
    }

    if !bot_users.is_empty() {
        result.push_str("Bot users in DMs:\n");
        for (id, name) in &bot_users {
            result.push_str(&format!("  - {} ({})\n", id, name));
        }
        result.push_str("\n");
    }

    if !deleted_users.is_empty() {
        result.push_str("Deleted users in DMs:\n");
        for (id, name) in &deleted_users {
            result.push_str(&format!("  - {} ({})\n", id, name));
        }
        result.push_str("\n");
    }

    // Sample of normal users
    if !normal_users.is_empty() {
        result.push_str("Sample of normal users (first 5):\n");
        for (id, name) in normal_users.iter().take(5) {
            result.push_str(&format!("  - {} ({})\n", id, name));
        }
    }

    info!("[DEBUG] {}", result);
    Ok(result)
}

#[tauri::command]
pub async fn debug_problematic_users(state: State<'_, AppState>) -> AppResult<String> {
    let client = state.get_client().await?;

    info!("[DEBUG] Testing resolution of problematic users");

    // The users that were showing as IDs instead of names
    let problem_users = [
        "U2R5VHFND", "U2R5VKH1P", "U2UAC7Q3S",
        "U6FTNV0CE", "UBZ931BR8", "UCK5KGMME", "UDUJSB4SJ"
    ];

    let mut result = String::new();
    result.push_str("Testing Individual User Fetch for Problematic Users:\n\n");

    for user_id in &problem_users {
        result.push_str(&format!("User ID: {}\n", user_id));

        // Try to fetch the user info
        match client.get_user_info(user_id).await {
            Ok(user_info) => {
                result.push_str(&format!("  ✅ Successfully fetched user info\n"));
                result.push_str(&format!("  - name: {}\n", user_info.name));
                result.push_str(&format!("  - real_name: {:?}\n", user_info.real_name));

                if let Some(ref profile) = user_info.profile {
                    result.push_str(&format!("  - profile.display_name: {:?}\n", profile.display_name));
                    result.push_str(&format!("  - profile.real_name: {:?}\n", profile.real_name));
                }

                // Determine what would be used as display name
                let display_name = user_info.profile.as_ref()
                    .and_then(|p| p.display_name.clone())
                    .filter(|n| !n.is_empty())
                    .or_else(|| user_info.profile.as_ref()
                        .and_then(|p| p.real_name.clone())
                        .filter(|n| !n.is_empty()))
                    .or_else(|| user_info.real_name.clone().filter(|n| !n.is_empty()))
                    .unwrap_or_else(|| user_info.name.clone());

                result.push_str(&format!("  - Resolved display name: '{}'\n", display_name));
            }
            Err(e) => {
                result.push_str(&format!("  ❌ Failed to fetch: {}\n", e));
            }
        }
        result.push_str("\n");
    }

    result.push_str("\nChecking if these users appear in users.list...\n");

    // Get all users to check if they appear in the list
    match client.get_all_users().await {
        Ok(users) => {
            for user_id in &problem_users {
                let found = users.iter().any(|u| &u.id == user_id);
                result.push_str(&format!("  {} - in users.list: {}\n", user_id, found));
            }
        }
        Err(e) => {
            result.push_str(&format!("  Failed to fetch users.list: {}\n", e));
        }
    }

    info!("[DEBUG] {}", result);
    Ok(result)
}