use crate::error::AppResult;
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tracing::info;

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
