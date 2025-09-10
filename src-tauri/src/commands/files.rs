use crate::error::AppResult;
use crate::state::AppState;
use tauri::State;
use tracing::{info, error};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// Get a file's content with authentication
#[tauri::command]
pub async fn get_slack_file(
    url: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<u8>> {
    let token = state.get_token().await?;
    
    info!("Fetching Slack file from URL: {}", url);
    
    // Create a temporary client for file fetching
    let client = reqwest::Client::new();
    
    // Slack file URLs require authentication
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        error!("Failed to fetch file: {}", status);
        return Err(anyhow::anyhow!("Failed to fetch file: {}", status).into());
    }
    
    let bytes = response.bytes().await?;
    Ok(bytes.to_vec())
}

/// Get authenticated URL for a Slack file
/// This creates a temporary URL with authentication token embedded
#[tauri::command]
pub async fn get_authenticated_file_url(
    url: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let token = state.get_token().await?;
    
    // For Slack files, we need to append the token as a query parameter
    // This is not ideal for security but works for internal use
    let separator = if url.contains('?') { "&" } else { "?" };
    let authenticated_url = format!("{}{}token={}", url, separator, token);
    
    Ok(authenticated_url)
}

/// Download a file from Slack to local filesystem
#[tauri::command]
pub async fn download_slack_file(
    url: String,
    file_name: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let token = state.get_token().await?;
    
    info!("Downloading Slack file: {} -> {}", url, file_name);
    
    // Create a temporary client for file fetching
    let client = reqwest::Client::new();
    
    // Fetch the file content
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        error!("Failed to download file: {}", status);
        return Err(anyhow::anyhow!("Failed to download file: {}", status).into());
    }
    
    let bytes = response.bytes().await?;
    
    // Get downloads directory
    let download_dir = dirs::download_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not find downloads directory"))?;
    
    // Create safe file path
    let file_path = download_dir.join(&file_name);
    
    // Save file
    let mut file = fs::File::create(&file_path).await?;
    file.write_all(&bytes).await?;
    file.flush().await?;
    
    info!("File downloaded successfully to: {:?}", file_path);
    
    Ok(file_path.to_string_lossy().to_string())
}

/// Create a data URL from file content for embedding in HTML
#[tauri::command]
pub async fn create_file_data_url(
    url: String,
    mime_type: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let token = state.get_token().await?;
    
    info!("Creating data URL for file: {}", url);
    
    // Create a temporary client for file fetching
    let client = reqwest::Client::new();
    
    // Fetch the file content
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;
    
    if !response.status().is_success() {
        let status = response.status();
        error!("Failed to fetch file for data URL: {}", status);
        return Err(anyhow::anyhow!("Failed to fetch file: {}", status).into());
    }
    
    let bytes = response.bytes().await?;
    
    // Encode as base64
    use base64::{Engine as _, engine::general_purpose};
    let base64_data = general_purpose::STANDARD.encode(&bytes);
    
    // Create data URL
    let data_url = format!("data:{};base64,{}", mime_type, base64_data);
    
    Ok(data_url)
}