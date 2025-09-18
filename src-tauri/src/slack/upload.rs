use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;
use tracing::{debug, error, info};

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Debug, Serialize, Deserialize)]
pub struct FileUploadRequest {
    pub channel_id: String,
    pub file_path: String,
    pub filename: Option<String>,
    pub title: Option<String>,
    pub initial_comment: Option<String>,
    pub thread_ts: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileUploadResponse {
    pub ok: bool,
    pub file: Option<SlackFile>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SlackFile {
    pub id: String,
    pub name: String,
    pub title: String,
    pub mimetype: String,
    pub size: i64,
    pub url_private: Option<String>,
    pub url_private_download: Option<String>,
    pub permalink: Option<String>,
    pub permalink_public: Option<String>,
    pub thumb_64: Option<String>,
    pub thumb_80: Option<String>,
    pub thumb_360: Option<String>,
    pub thumb_480: Option<String>,
    pub thumb_720: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GetUploadUrlResponse {
    ok: bool,
    upload_url: Option<String>,
    file_id: Option<String>,
    error: Option<String>,
}


#[derive(Debug, Deserialize)]
struct CompleteUploadResponse {
    ok: bool,
    files: Option<Vec<SlackFile>>,
    error: Option<String>,
}

pub struct FileUploader {
    client: Client,
    token: String,
}

impl FileUploader {
    pub fn new(token: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minutes for large files
            .build()?;

        Ok(Self { client, token })
    }

    /// Post a message to broadcast file upload to channel
    async fn post_broadcast_message(
        &self,
        channel_id: &str,
        thread_ts: &str,
        message: &str,
    ) -> Result<()> {
        let url = format!("{}/chat.postMessage", SLACK_API_BASE);

        let params = serde_json::json!({
            "channel": channel_id,
            "text": message,
            "thread_ts": thread_ts,
            "reply_broadcast": true
        });

        debug!("Posting broadcast message for file upload to channel: {}", channel_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Content-Type", "application/json")
            .json(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to post broadcast message. Status: {}, Response: {}", status, text);
            return Err(anyhow!("Failed to post broadcast message: {}", text));
        }

        let result: serde_json::Value = response.json().await?;

        if !result["ok"].as_bool().unwrap_or(false) {
            return Err(anyhow!(
                "Failed to post broadcast message: {}",
                result["error"].as_str().unwrap_or("Unknown error")
            ));
        }

        debug!("Broadcast message posted successfully");
        Ok(())
    }

    /// Step 1: Get upload URL from Slack
    async fn get_upload_url(
        &self,
        filename: &str,
        length: usize,
    ) -> Result<(String, String)> {
        let url = format!("{}/files.getUploadURLExternal", SLACK_API_BASE);

        let params = [
            ("filename", filename.to_string()),
            ("length", length.to_string()),
        ];

        info!("Getting upload URL for file: {} (size: {} bytes)", filename, length);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to get upload URL. Status: {}, Response: {}", status, text);
            return Err(anyhow!("Failed to get upload URL: {}", text));
        }

        let result: GetUploadUrlResponse = response.json().await?;

        if !result.ok {
            return Err(anyhow!(
                "Failed to get upload URL: {}",
                result.error.unwrap_or_else(|| "Unknown error".to_string())
            ));
        }

        let upload_url = result.upload_url.ok_or_else(|| anyhow!("No upload URL received"))?;
        let file_id = result.file_id.ok_or_else(|| anyhow!("No file ID received"))?;

        debug!("Got upload URL and file ID: {}", file_id);
        Ok((upload_url, file_id))
    }

    /// Step 2: Upload file to the given URL
    async fn upload_to_url(&self, upload_url: &str, file_data: Vec<u8>) -> Result<()> {
        info!("Uploading {} bytes to temporary URL", file_data.len());

        let response = self
            .client
            .post(upload_url)
            .body(file_data)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to upload file. Status: {}, Response: {}", status, text);
            return Err(anyhow!("Failed to upload file: {}", text));
        }

        debug!("File uploaded successfully to temporary URL");
        Ok(())
    }

    /// Step 3: Complete the upload (single file)
    async fn complete_upload(
        &self,
        file_id: &str,
        title: Option<String>,
        channel_id: &str,
        initial_comment: Option<String>,
        thread_ts: Option<String>,
        reply_broadcast: Option<bool>,
    ) -> Result<SlackFile> {
        let url = format!("{}/files.completeUploadExternal", SLACK_API_BASE);

        let mut params = serde_json::json!({
            "files": [{
                "id": file_id,
                "title": title,
            }],
            "channel_id": channel_id,
        });

        if let Some(ref comment) = initial_comment {
            params["initial_comment"] = serde_json::json!(comment);
        }

        if let Some(ref ts) = thread_ts {
            params["thread_ts"] = serde_json::json!(ts);
            // NOTE: reply_broadcast is NOT supported by files.completeUploadExternal
            // We'll need to handle this with a separate chat.postMessage call
        }

        info!("Completing upload for file ID: {} to channel: {}", file_id, channel_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to complete upload. Status: {}, Response: {}", status, text);
            return Err(anyhow!("Failed to complete upload: {}", text));
        }

        let result: CompleteUploadResponse = response.json().await?;

        if !result.ok {
            return Err(anyhow!(
                "Failed to complete upload: {}",
                result.error.unwrap_or_else(|| "Unknown error".to_string())
            ));
        }

        let files = result.files.ok_or_else(|| anyhow!("No files in response"))?;
        let file = files.into_iter().next().ok_or_else(|| anyhow!("No file in response"))?;

        // If reply_broadcast is true and we're in a thread, post a broadcast message
        if let Some(ref ts) = thread_ts {
            if let Some(broadcast) = reply_broadcast {
                if broadcast {
                    // Create a message with file information
                    let message = if let Some(comment) = &initial_comment {
                        if !comment.is_empty() {
                            format!("{}", comment)
                        } else {
                            format!("Shared file: {}", file.name)
                        }
                    } else {
                        format!("Shared file: {}", file.name)
                    };

                    // Post the broadcast message
                    if let Err(e) = self.post_broadcast_message(channel_id, &ts, &message).await {
                        error!("Failed to post broadcast message: {}", e);
                        // Don't fail the whole upload, just log the error
                    }
                }
            }
        }

        debug!("Upload completed successfully: {}", file.id);
        Ok(file)
    }

    /// Step 3: Complete multiple uploads in a single message
    async fn complete_batch_upload(
        &self,
        file_infos: Vec<(String, Option<String>)>, // (file_id, title)
        channel_id: &str,
        initial_comment: Option<String>,
        thread_ts: Option<String>,
        reply_broadcast: Option<bool>,
    ) -> Result<Vec<SlackFile>> {
        let url = format!("{}/files.completeUploadExternal", SLACK_API_BASE);

        let files_array: Vec<serde_json::Value> = file_infos
            .iter()
            .map(|(id, title)| {
                let mut file_obj = serde_json::json!({ "id": id });
                if let Some(t) = title {
                    file_obj["title"] = serde_json::json!(t);
                }
                file_obj
            })
            .collect();

        let mut params = serde_json::json!({
            "files": files_array,
            "channel_id": channel_id,
        });

        if let Some(ref comment) = initial_comment {
            params["initial_comment"] = serde_json::json!(comment);
        }

        if let Some(ref ts) = thread_ts {
            params["thread_ts"] = serde_json::json!(ts);
            // NOTE: reply_broadcast is NOT supported by files.completeUploadExternal
            // We'll need to handle this with a separate chat.postMessage call
        }

        info!("Completing batch upload for {} files to channel: {}", file_infos.len(), channel_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            error!("Failed to complete batch upload. Status: {}, Response: {}", status, text);
            return Err(anyhow!("Failed to complete batch upload: {}", text));
        }

        let result: CompleteUploadResponse = response.json().await?;

        if !result.ok {
            return Err(anyhow!(
                "Failed to complete batch upload: {}",
                result.error.unwrap_or_else(|| "Unknown error".to_string())
            ));
        }

        let files = result.files.ok_or_else(|| anyhow!("No files in response"))?;

        // If reply_broadcast is true and we're in a thread, post a broadcast message
        if let Some(ref ts) = thread_ts {
            if let Some(broadcast) = reply_broadcast {
                if broadcast {
                    // Create a message with file information
                    let file_names: Vec<String> = files
                        .iter()
                        .map(|f| f.name.clone())
                        .collect();

                    let message = if let Some(comment) = &initial_comment {
                        if !comment.is_empty() {
                            format!("{}", comment)
                        } else {
                            format!("Shared {} file(s): {}", files.len(), file_names.join(", "))
                        }
                    } else {
                        format!("Shared {} file(s): {}", files.len(), file_names.join(", "))
                    };

                    // Post the broadcast message
                    if let Err(e) = self.post_broadcast_message(channel_id, &ts, &message).await {
                        error!("Failed to post broadcast message: {}", e);
                        // Don't fail the whole upload, just log the error
                    }
                }
            }
        }

        debug!("Batch upload completed successfully: {} files", files.len());
        Ok(files)
    }

    /// Upload a file using the 3-step workflow
    pub async fn upload_file(
        &self,
        file_path: &str,
        channel_id: &str,
        initial_comment: Option<String>,
        thread_ts: Option<String>,
        reply_broadcast: Option<bool>,
    ) -> Result<FileUploadResponse> {
        // Read the file
        let path = Path::new(file_path);
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow!("Invalid filename"))?
            .to_string();

        let file_data = fs::read(file_path).await?;
        let file_size = file_data.len();

        info!("Uploading file: {} ({} bytes)", filename, file_size);

        // Step 1: Get upload URL
        let (upload_url, file_id) = self.get_upload_url(&filename, file_size).await?;

        // Step 2: Upload file to URL
        self.upload_to_url(&upload_url, file_data).await?;

        // Step 3: Complete upload
        let file = self
            .complete_upload(
                &file_id,
                Some(filename.clone()),
                channel_id,
                initial_comment,
                thread_ts,
                reply_broadcast,
            )
            .await?;

        Ok(FileUploadResponse {
            ok: true,
            file: Some(file),
            error: None,
        })
    }

    /// Upload raw data (e.g., from clipboard) using the 3-step workflow
    pub async fn upload_data(
        &self,
        data: Vec<u8>,
        filename: String,
        channel_id: &str,
        initial_comment: Option<String>,
        thread_ts: Option<String>,
        reply_broadcast: Option<bool>,
    ) -> Result<FileUploadResponse> {
        let file_size = data.len();

        info!("Uploading data: {} ({} bytes)", filename, file_size);

        // Step 1: Get upload URL
        let (upload_url, file_id) = self.get_upload_url(&filename, file_size).await?;

        // Step 2: Upload data to URL
        self.upload_to_url(&upload_url, data).await?;

        // Step 3: Complete upload
        let file = self
            .complete_upload(
                &file_id,
                Some(filename.clone()),
                channel_id,
                initial_comment,
                thread_ts,
                reply_broadcast,
            )
            .await?;

        Ok(FileUploadResponse {
            ok: true,
            file: Some(file),
            error: None,
        })
    }

    /// Upload multiple files in a single batch (all files in one message)
    pub async fn upload_files_batch(
        &self,
        files: Vec<FileUploadRequest>,
        channel_id: &str,
        initial_comment: Option<String>,
        thread_ts: Option<String>,
        reply_broadcast: Option<bool>,
    ) -> Result<FileUploadResponse> {
        if files.is_empty() {
            return Err(anyhow!("No files to upload"));
        }

        let mut uploaded_files: Vec<(String, Option<String>)> = Vec::new();

        // Step 1 & 2: Upload each file individually to get file IDs
        for file_req in files {
            if file_req.file_path.is_empty() {
                return Err(anyhow!("File path is required for batch upload"));
            }

            // File path provided
            let path = Path::new(&file_req.file_path);
            let filename = file_req.filename.clone().unwrap_or_else(|| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("file")
                    .to_string()
            });
            let title = file_req.title.clone().or_else(|| Some(filename.clone()));
            let file_data = fs::read(&file_req.file_path).await?;

            info!("Processing file: {} ({} bytes)", filename, file_data.len());
            let (upload_url, file_id) = self.get_upload_url(&filename, file_data.len()).await?;
            self.upload_to_url(&upload_url, file_data).await?;

            uploaded_files.push((file_id, title));
        }

        // Step 3: Complete all uploads in a single call
        let files = self
            .complete_batch_upload(
                uploaded_files,
                channel_id,
                initial_comment,
                thread_ts,
                reply_broadcast,
            )
            .await?;

        Ok(FileUploadResponse {
            ok: true,
            file: files.first().cloned(), // Return first file for compatibility
            error: None,
        })
    }

    /// Upload multiple data blobs (e.g., clipboard images) in a single batch
    pub async fn upload_data_batch(
        &self,
        data_items: Vec<(Vec<u8>, String)>, // (data, filename)
        channel_id: &str,
        initial_comment: Option<String>,
        thread_ts: Option<String>,
        reply_broadcast: Option<bool>,
    ) -> Result<Vec<SlackFile>> {
        if data_items.is_empty() {
            return Err(anyhow!("No data to upload"));
        }

        let mut uploaded_files: Vec<(String, Option<String>)> = Vec::new();

        // Step 1 & 2: Upload each data blob individually to get file IDs
        for (data, filename) in data_items {
            info!("Processing data: {} ({} bytes)", filename, data.len());
            let (upload_url, file_id) = self.get_upload_url(&filename, data.len()).await?;
            self.upload_to_url(&upload_url, data).await?;
            uploaded_files.push((file_id, Some(filename)));
        }

        // Step 3: Complete all uploads in a single call
        self.complete_batch_upload(
            uploaded_files,
            channel_id,
            initial_comment,
            thread_ts,
            reply_broadcast,
        )
        .await
    }
}

/// Validate file before upload
pub fn validate_file(file_path: &str, max_size: usize) -> Result<()> {
    let metadata = std::fs::metadata(file_path)?;

    if !metadata.is_file() {
        return Err(anyhow!("Path is not a file"));
    }

    let file_size = metadata.len() as usize;
    if file_size > max_size {
        return Err(anyhow!(
            "File size ({} bytes) exceeds maximum allowed size ({} bytes)",
            file_size,
            max_size
        ));
    }

    Ok(())
}

/// Get MIME type for a file
pub fn get_mime_type(file_path: &str) -> String {
    mime_guess::from_path(file_path)
        .first_or_octet_stream()
        .to_string()
}