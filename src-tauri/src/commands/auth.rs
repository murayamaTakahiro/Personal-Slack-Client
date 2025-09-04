use crate::error::AppResult;
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn save_token_secure(
    app: AppHandle,
    token: String,
    key: Option<String>,
) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    let storage_key = key.unwrap_or_else(|| "slack_token".to_string());

    store.set(&storage_key, Value::String(token));
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn get_token_secure(app: AppHandle, key: Option<String>) -> AppResult<Option<String>> {
    let store = app.store("secure.dat")?;
    let storage_key = key.unwrap_or_else(|| "slack_token".to_string());


    if let Some(value) = store.get(&storage_key) {
        if let Some(token) = value.as_str() {
            return Ok(Some(token.to_string()));
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn delete_token_secure(app: AppHandle, key: Option<String>) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    let storage_key = key.unwrap_or_else(|| "slack_token".to_string());
    store.delete(&storage_key);
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn save_workspace_secure(app: AppHandle, workspace: String) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    store.set("workspace", Value::String(workspace));
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn get_workspace_secure(app: AppHandle) -> AppResult<Option<String>> {
    let store = app.store("secure.dat")?;

    if let Some(value) = store.get("workspace") {
        if let Some(workspace) = value.as_str() {
            return Ok(Some(workspace.to_string()));
        }
    }

    Ok(None)
}

// Mask token for display purposes
#[tauri::command]
pub fn mask_token(token: String) -> String {
    if token.len() <= 14 {
        return "*".repeat(token.len());
    }
    format!("{}...{}", &token[..10], &token[token.len() - 4..])
}

// Migrate existing tokens to new key format
#[tauri::command]
pub async fn migrate_tokens(app: AppHandle) -> AppResult<()> {

    let store = app.store("secure.dat")?;

    // Check if we have a token at the default key
    if let Some(value) = store.get("slack_token") {
        if let Some(_token) = value.as_str() {
        }
    }

    store.save()?;
    Ok(())
}

// Initialize token in app state from secure storage
#[tauri::command]
pub async fn init_token_from_storage(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<bool> {

    let store = app.store("secure.dat")?;

    // First check the default key
    if let Some(value) = store.get("slack_token") {
        if let Some(token) = value.as_str() {
            state.set_token(token.to_string()).await?;
            return Ok(true);
        }
    }

    Ok(false)
}
