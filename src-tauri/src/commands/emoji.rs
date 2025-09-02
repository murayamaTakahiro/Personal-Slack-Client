use crate::error::AppError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize)]
pub struct EmojiListResponse {
    pub ok: bool,
    pub emoji: Option<HashMap<String, String>>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn get_emoji_list(state: State<'_, AppState>) -> Result<EmojiListResponse, AppError> {
    info!("Getting emoji list from Slack");
    
    // Get the Slack client from app state (handles token retrieval and client creation)
    let client = state.get_client().await?;

    match client.get_emoji_list().await {
        Ok(emoji_map) => {
            info!("Successfully fetched {} emojis", emoji_map.len());
            Ok(EmojiListResponse {
                ok: true,
                emoji: Some(emoji_map),
                error: None,
            })
        }
        Err(e) => {
            error!("Failed to get emoji list: {}", e);
            Ok(EmojiListResponse {
                ok: false,
                emoji: None,
                error: Some(e.to_string()),
            })
        }
    }
}