use crate::slack::upload::{FileUploadRequest as SlackFileUploadRequest, FileUploadResponse, FileUploader, validate_file, get_mime_type};
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
    pub reply_broadcast: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadDataRequest {
    pub data: String, // Base64 encoded data
    pub filename: String,
    pub channel_id: String,
    pub initial_comment: Option<String>,
    pub thread_ts: Option<String>,
    pub reply_broadcast: Option<bool>,
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
            request.reply_broadcast,
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
            request.reply_broadcast,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchUploadRequest {
    pub files: Vec<UploadFileRequest>,
    pub data_items: Vec<UploadDataRequest>,
    pub channel_id: String,
    pub initial_comment: Option<String>,
    pub thread_ts: Option<String>,
    pub reply_broadcast: Option<bool>,
}

#[tauri::command]
pub async fn upload_files_batch(
    state: tauri::State<'_, AppState>,
    request: BatchUploadRequest,
) -> Result<FileUploadResponse, String> {
    info!(
        "Batch uploading {} files and {} data items to channel: {}",
        request.files.len(),
        request.data_items.len(),
        request.channel_id
    );

    // Get the Slack token
    let token = state
        .get_token()
        .await
        .map_err(|e| format!("Failed to get token: {}", e))?;

    // Create uploader
    let uploader = FileUploader::new(token)
        .map_err(|e| format!("Failed to create uploader: {}", e))?;

    // Convert file requests to the format needed by the uploader
    let mut slack_file_requests = Vec::new();

    // Add file path uploads
    for file_req in request.files {
        // Validate the file
        if let Err(e) = validate_file(&file_req.file_path, MAX_FILE_SIZE) {
            error!("File validation failed for {}: {}", file_req.file_path, e);
            return Err(format!("File validation failed for {}: {}", file_req.file_path, e));
        }

        let path = PathBuf::from(&file_req.file_path);
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        slack_file_requests.push(SlackFileUploadRequest {
            channel_id: request.channel_id.clone(),
            file_path: file_req.file_path,
            filename: Some(filename.clone()),
            title: Some(filename),
            initial_comment: None, // Will be set at batch level
            thread_ts: None, // Will be set at batch level
        });
    }

    // Handle data uploads (clipboard images) separately
    let mut data_items = Vec::new();
    for data_req in request.data_items {
        let data = BASE64
            .decode(&data_req.data)
            .map_err(|e| format!("Failed to decode image data: {}", e))?;

        if data.len() > MAX_FILE_SIZE {
            return Err(format!(
                "Data size ({} bytes) exceeds maximum allowed size ({} bytes)",
                data.len(),
                MAX_FILE_SIZE
            ));
        }

        data_items.push((data, data_req.filename));
    }

    // Upload based on what we have
    if !slack_file_requests.is_empty() && !data_items.is_empty() {
        // We have both files and data - need to handle this case
        // For now, we'll prioritize files and warn about data
        info!("Warning: Mixed batch upload (files + clipboard) not fully supported yet");

        match uploader
            .upload_files_batch(
                slack_file_requests,
                &request.channel_id,
                request.initial_comment,
                request.thread_ts,
                request.reply_broadcast,
            )
            .await
        {
            Ok(response) => Ok(response),
            Err(e) => {
                error!("Failed to batch upload files: {}", e);
                Err(format!("Failed to batch upload files: {}", e))
            }
        }
    } else if !slack_file_requests.is_empty() {
        // Only files
        match uploader
            .upload_files_batch(
                slack_file_requests,
                &request.channel_id,
                request.initial_comment,
                request.thread_ts,
                request.reply_broadcast,
            )
            .await
        {
            Ok(response) => Ok(response),
            Err(e) => {
                error!("Failed to batch upload files: {}", e);
                Err(format!("Failed to batch upload files: {}", e))
            }
        }
    } else if !data_items.is_empty() {
        // Only data (clipboard images)
        match uploader
            .upload_data_batch(
                data_items,
                &request.channel_id,
                request.initial_comment,
                request.thread_ts,
                request.reply_broadcast,
            )
            .await
        {
            Ok(files) => Ok(FileUploadResponse {
                ok: true,
                file: files.first().cloned(),
                error: None,
            }),
            Err(e) => {
                error!("Failed to batch upload data: {}", e);
                Err(format!("Failed to batch upload data: {}", e))
            }
        }
    } else {
        Err("No files or data to upload".to_string())
    }
}