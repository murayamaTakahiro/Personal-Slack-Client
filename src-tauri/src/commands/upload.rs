use crate::slack::upload::{FileUploadResponse, FileUploader, validate_file, get_mime_type};
use crate::state::AppState;
use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{error, info};

const MAX_FILE_SIZE: usize = 1024 * 1024 * 1024; // 1GB - Slack's maximum

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadFileRequest {
    pub file_path: String,
    pub channel_id: String,
    pub initial_comment: Option<String>,
    pub thread_ts: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadDataRequest {
    pub data: String, // Base64 encoded data
    pub filename: String,
    pub channel_id: String,
    pub initial_comment: Option<String>,
    pub thread_ts: Option<String>,
}

#[tauri::command]
pub async fn upload_file_to_slack(
    state: tauri::State<'_, AppState>,
    request: UploadFileRequest,
) -> Result<FileUploadResponse, String> {
    info!("Uploading file: {} to channel: {}", request.file_path, request.channel_id);

    // Validate the file
    if let Err(e) = validate_file(&request.file_path, MAX_FILE_SIZE) {
        error!("File validation failed: {}", e);
        return Err(format!("File validation failed: {}", e));
    }

    // Get the Slack token
    let token = state
        .get_token()
        .await
        .map_err(|e| format!("Failed to get token: {}", e))?;

    // Create uploader
    let uploader = FileUploader::new(token)
        .map_err(|e| format!("Failed to create uploader: {}", e))?;

    // Upload the file
    match uploader
        .upload_file(
            &request.file_path,
            &request.channel_id,
            request.initial_comment,
            request.thread_ts,
        )
        .await
    {
        Ok(response) => Ok(response),
        Err(e) => {
            error!("Failed to upload file: {}", e);
            Err(format!("Failed to upload file: {}", e))
        }
    }
}

#[tauri::command]
pub async fn upload_clipboard_image(
    state: tauri::State<'_, AppState>,
    request: UploadDataRequest,
) -> Result<FileUploadResponse, String> {
    info!("Uploading clipboard image to channel: {}", request.channel_id);

    // Decode base64 data
    let data = BASE64
        .decode(&request.data)
        .map_err(|e| format!("Failed to decode image data: {}", e))?;

    // Check size
    if data.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File size ({} bytes) exceeds maximum allowed size ({} bytes)",
            data.len(),
            MAX_FILE_SIZE
        ));
    }

    // Get the Slack token
    let token = state
        .get_token()
        .await
        .map_err(|e| format!("Failed to get token: {}", e))?;

    // Create uploader
    let uploader = FileUploader::new(token)
        .map_err(|e| format!("Failed to create uploader: {}", e))?;

    // Upload the data
    match uploader
        .upload_data(
            data,
            request.filename,
            &request.channel_id,
            request.initial_comment,
            request.thread_ts,
        )
        .await
    {
        Ok(response) => Ok(response),
        Err(e) => {
            error!("Failed to upload clipboard image: {}", e);
            Err(format!("Failed to upload image: {}", e))
        }
    }
}

#[tauri::command]
pub async fn get_file_info(file_path: String) -> Result<FileInfo, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mime_type = get_mime_type(&file_path);
    let size = metadata.len();

    Ok(FileInfo {
        filename,
        mime_type,
        size,
        path: file_path,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub path: String,
}