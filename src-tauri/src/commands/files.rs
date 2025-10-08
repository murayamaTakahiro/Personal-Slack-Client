use crate::error::AppResult;
use crate::state::AppState;
use tauri::{State, AppHandle};
use tracing::{info, error, debug};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileDownloadOptions {
    pub save_path: Option<String>,
    pub show_dialog: bool,
}

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

/// Download a file from Slack to a specific directory or prompt for location
#[tauri::command]
pub async fn download_slack_file_with_options(
    url: String,
    file_name: String,
    save_path: Option<String>,
    show_dialog: bool,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let token = state.get_token().await?;
    
    info!("Downloading Slack file with options: {} -> {}", url, file_name);
    debug!("Options - save_path: {:?}, show_dialog: {}", save_path, show_dialog);
    
    // Determine the target directory
    let target_dir = if show_dialog {
        // Show a folder selection dialog using the new Tauri v2 dialog plugin
        // We'll use a blocking approach with channels to make it synchronous
        use tauri_plugin_dialog::DialogExt;
        use std::sync::mpsc::channel;
        
        let (tx, rx) = channel();
        
        app_handle.dialog()
            .file()
            .set_title("Select Download Location")
            .pick_folder(move |folder_path| {
                tx.send(folder_path).unwrap();
            });
        
        let dialog_result = rx.recv().unwrap();
        
        match dialog_result {
            Some(path) => path.as_path().unwrap().to_path_buf(),
            None => {
                info!("User cancelled download dialog");
                return Err(anyhow::anyhow!("Download cancelled by user").into());
            }
        }
    } else if let Some(path) = save_path {
        // Use the provided path
        PathBuf::from(path)
    } else {
        // Fall back to downloads directory
        dirs::download_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find downloads directory"))?
    };
    
    // Ensure the directory exists
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).await?;
    }
    
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
    
    // Create safe file path with unique name if file exists
    let mut file_path = target_dir.join(&file_name);
    let mut counter = 1;
    
    while file_path.exists() {
        let stem = Path::new(&file_name).file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let extension = Path::new(&file_name).extension()
            .and_then(|s| s.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_default();
        
        let new_name = format!("{}_{}{}", stem, counter, extension);
        file_path = target_dir.join(new_name);
        counter += 1;
    }
    
    // Save file
    let mut file = fs::File::create(&file_path).await?;
    file.write_all(&bytes).await?;
    file.flush().await?;
    
    info!("File downloaded successfully to: {:?}", file_path);
    
    Ok(file_path.to_string_lossy().to_string())
}

/// Download multiple files from Slack
#[tauri::command]
pub async fn download_slack_files_batch(
    files: Vec<(String, String)>, // Vec of (url, filename) tuples
    save_path: Option<String>,
    show_dialog: bool,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    let token = state.get_token().await?;
    
    info!("Downloading {} files in batch", files.len());
    
    // Determine the target directory (same logic as single file)
    let target_dir = if show_dialog {
        // Show a folder selection dialog using the new Tauri v2 dialog plugin
        // We'll use a blocking approach with channels to make it synchronous
        use tauri_plugin_dialog::DialogExt;
        use std::sync::mpsc::channel;
        
        let (tx, rx) = channel();
        
        app_handle.dialog()
            .file()
            .set_title("Select Download Location for Files")
            .pick_folder(move |folder_path| {
                tx.send(folder_path).unwrap();
            });
        
        let dialog_result = rx.recv().unwrap();
        
        match dialog_result {
            Some(path) => path.as_path().unwrap().to_path_buf(),
            None => {
                info!("User cancelled download dialog");
                return Err(anyhow::anyhow!("Download cancelled by user").into());
            }
        }
    } else if let Some(path) = save_path {
        PathBuf::from(path)
    } else {
        dirs::download_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not find downloads directory"))?
    };
    
    // Ensure the directory exists
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).await?;
    }
    
    let client = reqwest::Client::new();
    let mut downloaded_paths = Vec::new();
    
    for (url, file_name) in files {
        debug!("Downloading file: {}", file_name);
        
        // Fetch the file content
        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status();
            error!("Failed to download file {}: {}", file_name, status);
            continue; // Skip this file but continue with others
        }
        
        let bytes = response.bytes().await?;
        
        // Create safe file path with unique name if file exists
        let mut file_path = target_dir.join(&file_name);
        let mut counter = 1;
        
        while file_path.exists() {
            let stem = Path::new(&file_name).file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file");
            let extension = Path::new(&file_name).extension()
                .and_then(|s| s.to_str())
                .map(|e| format!(".{}", e))
                .unwrap_or_default();
            
            let new_name = format!("{}_{}{}", stem, counter, extension);
            file_path = target_dir.join(new_name);
            counter += 1;
        }
        
        // Save file
        let mut file = fs::File::create(&file_path).await?;
        file.write_all(&bytes).await?;
        file.flush().await?;
        
        downloaded_paths.push(file_path.to_string_lossy().to_string());
    }
    
    info!("Batch download completed: {} files downloaded", downloaded_paths.len());
    
    Ok(downloaded_paths)
}

/// Show a folder selection dialog and return the selected path
#[tauri::command]
pub async fn select_download_folder(app_handle: AppHandle) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    use std::sync::mpsc::channel;
    
    let (tx, rx) = channel();
    
    app_handle.dialog()
        .file()
        .set_title("Select Default Download Folder")
        .pick_folder(move |folder_path| {
            tx.send(folder_path).unwrap();
        });
    
    let dialog_result = rx.recv().unwrap();
    
    Ok(dialog_result.map(|p| p.as_path().unwrap().to_string_lossy().to_string()))
}

/// Get file content as text with size limit and encoding options
#[tauri::command]
pub async fn get_file_content(
    url: String,
    max_size: usize,
    encoding: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let token = state.get_token().await?;

    info!("Fetching file content from URL: {} (max_size: {}, encoding: {:?})", url, max_size, encoding);

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
        error!("Failed to fetch file content: {}", status);
        return Err(anyhow::anyhow!("Failed to fetch file content: {}", status).into());
    }

    // Get content length to check size
    if let Some(content_length) = response.content_length() {
        if content_length as usize > max_size {
            info!("File too large: {} bytes (max: {})", content_length, max_size);
            return Err(anyhow::anyhow!("File too large: {} bytes (max: {})", content_length, max_size).into());
        }
    }

    let bytes = response.bytes().await?;

    // Check actual size
    if bytes.len() > max_size {
        info!("File too large after download: {} bytes (max: {})", bytes.len(), max_size);
        return Err(anyhow::anyhow!("File too large: {} bytes (max: {})", bytes.len(), max_size).into());
    }

    // Convert to string with specified encoding
    let content = match encoding.as_deref() {
        Some("utf-16") => {
            // UTF-16 decoding
            let (decoded, _, had_errors) = encoding_rs::UTF_16LE.decode(&bytes);
            if had_errors {
                // Try UTF-16BE
                let (decoded, _, _) = encoding_rs::UTF_16BE.decode(&bytes);
                decoded.to_string()
            } else {
                decoded.to_string()
            }
        }
        Some("shift-jis") | Some("shift_jis") | Some("sjis") => {
            // Shift-JIS decoding (common for Japanese files)
            let (decoded, _, _) = encoding_rs::SHIFT_JIS.decode(&bytes);
            decoded.to_string()
        }
        Some("euc-jp") | Some("euc_jp") => {
            // EUC-JP decoding (common for Japanese files)
            let (decoded, _, _) = encoding_rs::EUC_JP.decode(&bytes);
            decoded.to_string()
        }
        Some("iso-8859-1") | Some("latin1") => {
            // ISO-8859-1 / Latin-1 decoding
            let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(&bytes);
            decoded.to_string()
        }
        None => {
            // Auto-detect encoding: Try UTF-8 first (most common for modern files)
            match String::from_utf8(bytes.to_vec()) {
                Ok(utf8_str) => {
                    info!("Auto-detected encoding as UTF-8");
                    utf8_str
                }
                Err(_) => {
                    // UTF-8 failed, try Shift-JIS (common for Japanese files)
                    let (decoded_sjis, _, had_errors_sjis) = encoding_rs::SHIFT_JIS.decode(&bytes);

                    if !had_errors_sjis && !decoded_sjis.contains('\u{fffd}') {
                        info!("Auto-detected encoding as Shift-JIS");
                        decoded_sjis.to_string()
                    } else {
                        // Try EUC-JP as fallback
                        let (decoded_euc, _, had_errors_euc) = encoding_rs::EUC_JP.decode(&bytes);

                        if !had_errors_euc && !decoded_euc.contains('\u{fffd}') {
                            info!("Auto-detected encoding as EUC-JP");
                            decoded_euc.to_string()
                        } else {
                            // Last resort: use Windows-1252 (Latin-1 compatible)
                            let (decoded_latin, _, _) = encoding_rs::WINDOWS_1252.decode(&bytes);
                            info!("Auto-detected encoding as Windows-1252/Latin-1");
                            decoded_latin.to_string()
                        }
                    }
                }
            }
        }
        _ => {
            // Default to UTF-8
            String::from_utf8(bytes.to_vec())
                .map_err(|e| anyhow::anyhow!("Failed to decode file as UTF-8: {}", e))?
        }
    };

    info!("Successfully fetched file content: {} characters", content.len());

    Ok(content)
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

/// Download file as binary data for Excel/Office file parsing
#[tauri::command]
pub async fn download_file_binary(
    workspace_id: String,
    url: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<u8>> {
    let token = state.get_token().await?;

    info!("Downloading binary file from workspace {}: {}", workspace_id, url);

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
        error!("Failed to fetch binary file: {}", status);
        return Err(anyhow::anyhow!("Failed to fetch binary file: {}", status).into());
    }

    let bytes = response.bytes().await?;

    info!("Downloaded {} bytes successfully", bytes.len());

    Ok(bytes.to_vec())
}