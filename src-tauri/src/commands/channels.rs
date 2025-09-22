use crate::error::AppResult;
use crate::slack::models::{SlackConversation, SlackMessage};
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;
use tracing::{error, info, warn};

#[tauri::command]
pub async fn save_favorite_channels(app: AppHandle, favorites: Vec<String>) -> AppResult<()> {
    info!("Saving {} favorite channels", favorites.len());

    let store = app.store("channels.dat")?;
    store.set("favorite_channels", Value::from(favorites));
    store.save()?;

    Ok(())
}

#[tauri::command]
pub async fn get_favorite_channels(app: AppHandle) -> AppResult<Vec<String>> {
    let store = app.store("channels.dat")?;

    if let Some(value) = store.get("favorite_channels") {
        if let Some(favorites) = value.as_array() {
            let channel_list: Vec<String> = favorites
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();

            info!("Loaded {} favorite channels", channel_list.len());
            return Ok(channel_list);
        }
    }

    info!("No favorite channels found");
    Ok(Vec::new())
}

#[tauri::command]
pub async fn save_recent_channels(app: AppHandle, recent: Vec<String>) -> AppResult<()> {
    info!("Saving {} recent channels", recent.len());

    let store = app.store("channels.dat")?;
    store.set("recent_channels", Value::from(recent));
    store.save()?;

    Ok(())
}

#[tauri::command]
pub async fn get_recent_channels(app: AppHandle) -> AppResult<Vec<String>> {
    let store = app.store("channels.dat")?;

    if let Some(value) = store.get("recent_channels") {
        if let Some(recent) = value.as_array() {
            let channel_list: Vec<String> = recent
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();

            info!("Loaded {} recent channels", channel_list.len());
            return Ok(channel_list);
        }
    }

    info!("No recent channels found");
    Ok(Vec::new())
}

/// Get DM channels (Phase 1: Read-only)
/// IMPORTANT: This is an experimental feature that requires:
/// 1. Feature flag to be enabled (dmChannelsEnabled)
/// 2. Token with im:read scope
#[tauri::command]
pub async fn get_dm_channels(state: State<'_, AppState>) -> AppResult<Vec<SlackConversation>> {
    info!("Getting DM channels (Phase 1: Read-only)");

    // Get the Slack client
    let client = state.get_client().await?;

    // Try to fetch DM channels
    match client.get_dm_channels().await {
        Ok(dms) => {
            info!("Successfully fetched {} DM channels", dms.len());
            Ok(dms)
        }
        Err(e) => {
            // Log the error with appropriate severity based on the error type
            if e.to_string().contains("missing_scope") || e.to_string().contains("im:read") {
                warn!("Cannot fetch DM channels: Missing im:read permission. {}", e);
            } else {
                error!("Failed to fetch DM channels: {}", e);
            }
            Err(e.into())
        }
    }
}

/// Check if the token has permission to access DM channels
#[tauri::command]
pub async fn check_dm_permissions(state: State<'_, AppState>) -> AppResult<bool> {
    info!("Checking DM channel permissions");

    let client = state.get_client().await?;

    // Try a minimal DM channel fetch to check permissions
    match client.get_dm_channels().await {
        Ok(_) => {
            info!("DM channel permissions verified");
            Ok(true)
        }
        Err(e) => {
            if e.to_string().contains("missing_scope") || e.to_string().contains("im:read") {
                info!("DM channel permissions not available: {}", e);
                Ok(false)
            } else {
                // Some other error occurred
                error!("Error checking DM permissions: {}", e);
                Err(e.into())
            }
        }
    }
}

/// Search for messages within a single DM channel (Phase 2)
/// IMPORTANT: This is an experimental feature that requires:
/// 1. Feature flag to be enabled (dmChannelsEnabled)
/// 2. Token with im:history scope
/// 3. Uses conversations.history API, NOT search.messages
#[tauri::command]
pub async fn search_dm_messages(
    state: State<'_, AppState>,
    dm_id: String,
    query: Option<String>,
    limit: Option<usize>,
) -> AppResult<Vec<SlackMessage>> {
    info!(
        "Searching DM channel {} with query: {:?} (Phase 2)",
        dm_id, query
    );

    // Get the Slack client
    let client = state.get_client().await?;

    // Set default limit if not provided (conservative for DMs)
    let max_results = limit.unwrap_or(50).min(100);

    // Try to search DM messages
    match client
        .search_dm_messages(&dm_id, query.as_deref(), max_results)
        .await
    {
        Ok(messages) => {
            info!(
                "Successfully searched DM {}: found {} messages",
                dm_id,
                messages.len()
            );
            Ok(messages)
        }
        Err(e) => {
            // Log the error with appropriate severity based on the error type
            if e.to_string().contains("missing_scope") || e.to_string().contains("im:history") {
                warn!("Cannot search DM messages: Missing im:history permission. {}", e);
            } else {
                error!("Failed to search DM messages: {}", e);
            }
            Err(e.into())
        }
    }
}
