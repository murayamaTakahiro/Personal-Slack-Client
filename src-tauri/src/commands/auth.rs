use crate::error::AppResult;
use crate::state::AppState;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;
use serde_json::Value;
use tracing::info;

#[tauri::command]
pub async fn save_token_secure(
    app: AppHandle,
    token: String,
    key: Option<String>,
) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    let storage_key = key.unwrap_or_else(|| "slack_token".to_string());
    
    // Mask token for logging
    let masked = if token.len() > 14 {
        format!("{}...{}", &token[..10], &token[token.len()-4..])
    } else {
        "*".repeat(token.len())
    };
    
    info!("Saving token {} to key: {}", masked, storage_key);
    store.set(&storage_key, Value::String(token));
    store.save()?;
    Ok(())
}

#[tauri::command]
pub async fn get_token_secure(
    app: AppHandle,
    key: Option<String>,
) -> AppResult<Option<String>> {
    let store = app.store("secure.dat")?;
    let storage_key = key.unwrap_or_else(|| "slack_token".to_string());
    
    info!("Getting token from key: {}", storage_key);
    
    if let Some(value) = store.get(&storage_key) {
        if let Some(token) = value.as_str() {
            // Mask token for logging
            let masked = if token.len() > 14 {
                format!("{}...{}", &token[..10], &token[token.len()-4..])
            } else {
                "*".repeat(token.len())
            };
            info!("Found token {} at key: {}", masked, storage_key);
            return Ok(Some(token.to_string()));
        }
    }
    
    info!("No token found at key: {}", storage_key);
    Ok(None)
}

#[tauri::command]
pub async fn delete_token_secure(
    app: AppHandle,
    key: Option<String>,
) -> AppResult<()> {
    let store = app.store("secure.dat")?;
    let storage_key = key.unwrap_or_else(|| "slack_token".to_string());
    store.delete(&storage_key);
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

// Migrate existing tokens to new key format
#[tauri::command]
pub async fn migrate_tokens(
    app: AppHandle,
) -> AppResult<()> {
    info!("Starting token migration");
    
    let store = app.store("secure.dat")?;
    
    // Check if we have a token at the default key
    if let Some(value) = store.get("slack_token") {
        if let Some(_token) = value.as_str() {
            info!("Found legacy token at default key, will keep for backward compatibility");
        }
    }
    
    // List all keys to understand current state
    let keys: Vec<String> = store.keys().into_iter().map(|k| k.to_string()).collect();
    info!("Current keys in secure store: {:?}", keys);
    
    store.save()?;
    Ok(())
}

// Initialize token in app state from secure storage
#[tauri::command]
pub async fn init_token_from_storage(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<bool> {
    info!("Attempting to initialize token from secure storage");
    
    let store = app.store("secure.dat")?;
    
    // First check the default key
    if let Some(value) = store.get("slack_token") {
        if let Some(token) = value.as_str() {
            // Mask token for logging
            let masked = if token.len() > 14 {
                format!("{}...{}", &token[..10], &token[token.len()-4..])
            } else {
                "*".repeat(token.len())
            };
            info!("Found token in secure storage: {}, setting in app state", masked);
            state.set_token(token.to_string()).await?;
            return Ok(true);
        }
    }
    
    info!("No token found in secure storage at key 'slack_token'");
    
    // List all keys in the store for debugging
    let available_keys: Vec<_> = store.keys().into_iter().collect();
    info!("Available keys in store: {:?}", available_keys);
    
    Ok(false)
}