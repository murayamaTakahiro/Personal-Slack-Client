use crate::error::AppResult;
use crate::state::AppState;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;
use serde_json::Value;
use tracing::{info, error};

#[tauri::command]
pub async fn save_token_secure(
    app: AppHandle,
    token: String,
) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    store.set("slack_token", Value::String(token));
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn get_token_secure(
    app: AppHandle,
) -> AppResult<Option<String>> {
    let store = app.store("secure.dat")?;
    
    if let Some(value) = store.get("slack_token") {
        if let Some(token) = value.as_str() {
            return Ok(Some(token.to_string()));
        }
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn delete_token_secure(
    app: AppHandle,
) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    store.delete("slack_token");
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn save_workspace_secure(
    app: AppHandle,
    workspace: String,
) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    store.set("workspace", Value::String(workspace));
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn get_workspace_secure(
    app: AppHandle,
) -> AppResult<Option<String>> {
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
    format!("{}...{}", &token[..10], &token[token.len()-4..])
}

// Initialize token in app state from secure storage
#[tauri::command]
pub async fn init_token_from_storage(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    info!("Attempting to initialize token from secure storage");
    
    let store = app.store("secure.dat")?;
    
    if let Some(value) = store.get("slack_token") {
        if let Some(token) = value.as_str() {
            info!("Found token in secure storage, setting in app state");
            state.set_token(token.to_string()).await?;
            return Ok(true);
        }
    }
    
    info!("No token found in secure storage");
    Ok(false)
}