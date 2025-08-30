use crate::error::AppResult;
use crate::slack::SlackReaction;
use crate::state::AppState;
use tauri::State;
use tracing::{error, info};

#[tauri::command]
pub async fn add_reaction(
    state: State<'_, AppState>,
    channel: String,
    timestamp: String,
    emoji: String,
) -> AppResult<()> {
    info!(
        "Adding reaction {} to message {} in channel {}",
        emoji, timestamp, channel
    );

    let client = state.get_client().await?;

    match client.add_reaction(&channel, &timestamp, &emoji).await {
        Ok(_) => {
            info!("Successfully added reaction");
            Ok(())
        }
        Err(e) => {
            error!("Failed to add reaction: {}", e);
            Err(e.into())
        }
    }
}

#[tauri::command]
pub async fn remove_reaction(
    state: State<'_, AppState>,
    channel: String,
    timestamp: String,
    emoji: String,
) -> AppResult<()> {
    info!(
        "Removing reaction {} from message {} in channel {}",
        emoji, timestamp, channel
    );

    let client = state.get_client().await?;

    match client.remove_reaction(&channel, &timestamp, &emoji).await {
        Ok(_) => {
            info!("Successfully removed reaction");
            Ok(())
        }
        Err(e) => {
            error!("Failed to remove reaction: {}", e);
            Err(e.into())
        }
    }
}

#[tauri::command]
pub async fn get_reactions(
    state: State<'_, AppState>,
    channel: String,
    timestamp: String,
) -> AppResult<Vec<SlackReaction>> {
    info!(
        "Getting reactions for message {} in channel {}",
        timestamp, channel
    );

    let client = state.get_client().await?;

    match client.get_reactions(&channel, &timestamp).await {
        Ok(reactions) => {
            info!("Successfully retrieved {} reactions", reactions.len());
            Ok(reactions)
        }
        Err(e) => {
            error!("Failed to get reactions: {}", e);
            Err(e.into())
        }
    }
}
