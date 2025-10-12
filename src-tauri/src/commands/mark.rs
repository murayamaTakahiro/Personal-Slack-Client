//! Commands for marking messages as read on Slack
//!
//! This module provides Tauri commands to mark Slack messages as read,
//! which updates the user's read cursor on Slack.

use tauri::State;
use crate::state::AppState;

/// Mark a message as read on Slack
///
/// This command allows the frontend to mark a specific message as read
/// on Slack, which will update the read cursor for the user. All messages
/// up to and including the specified timestamp will be marked as read.
///
/// # Arguments
/// * `state` - Application state containing the Slack client
/// * `channel_id` - The channel ID where the message is located
///   - Public/private channels: "C..." format
///   - DMs: "D..." format
///   - Group DMs: "G..." format
/// * `timestamp` - The timestamp of the message to mark as read
///   - Format: "1234567890.123456" (Unix timestamp with microseconds)
///
/// # Returns
/// * `Result<(), String>` - Ok if successful, Err with error message if failed
///
/// # Errors
/// * "Slack client not initialized" - Client hasn't been set up
/// * Slack API errors (passed through from the client)
///
/// # Example
/// ```javascript
/// await invoke('mark_message_as_read', {
///   channelId: 'C1234567890',
///   timestamp: '1234567890.123456'
/// });
/// ```
#[tauri::command]
pub async fn mark_message_as_read(
    state: State<'_, AppState>,
    channel_id: String,
    timestamp: String,
) -> Result<(), String> {
    tracing::info!(
        "mark_message_as_read command called: channel={}, ts={}",
        channel_id,
        timestamp
    );

    // Get the Slack client from the application state
    let client = state
        .get_client()
        .await
        .map_err(|e| {
            tracing::error!("Failed to get Slack client: {}", e);
            e.to_string()
        })?;

    // Call the mark_conversation_as_read method
    let result = client
        .mark_conversation_as_read(&channel_id, &timestamp)
        .await
        .map_err(|e| {
            tracing::error!("Failed to mark message as read: {}", e);
            e.to_string()
        });

    if result.is_ok() {
        tracing::info!(
            "Successfully marked message as read: channel={}, ts={}",
            channel_id,
            timestamp
        );
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mark_message_as_read_signature() {
        // This test just ensures the function signature compiles correctly
        // Actual testing requires mocking the Slack client
    }
}
