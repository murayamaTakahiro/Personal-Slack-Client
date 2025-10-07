use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::fs;
use tracing::{info, error};
use base64::{engine::general_purpose, Engine as _};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AttachmentData {
    pub filename: String,
    pub content: String, // base64
}

/// Save thread export to a file
/// Shows a file save dialog and saves the content to the selected location
#[tauri::command]
pub async fn save_thread_export(
    app: AppHandle,
    content: String,
    default_name: String,
    extension: String,
) -> AppResult<ExportResult> {
    info!("Saving thread export with default name: {}", default_name);

    // Create file save dialog
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&format!("{} files", extension.to_uppercase()), &[&extension])
        .blocking_save_file();

    match file_path {
        Some(FilePath::Path(path)) => {
            info!("User selected path: {:?}", path);

            // Write content to file
            match fs::write(&path, content.as_bytes()).await {
                Ok(_) => {
                    info!("Successfully wrote file to {:?}", path);
                    Ok(ExportResult {
                        success: true,
                        path: Some(path.to_string_lossy().to_string()),
                        error: None,
                    })
                }
                Err(e) => {
                    error!("Failed to write file: {}", e);
                    Ok(ExportResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to write file: {}", e)),
                    })
                }
            }
        }
        Some(FilePath::Url(_)) => {
            // URL paths are not supported for saving
            Ok(ExportResult {
                success: false,
                path: None,
                error: Some("URL paths are not supported".to_string()),
            })
        }
        None => {
            // User cancelled the dialog
            info!("User cancelled file save dialog");
            Ok(ExportResult {
                success: false,
                path: None,
                error: Some("User cancelled".to_string()),
            })
        }
    }
}

/// Save thread export as a folder with markdown and attachments
/// Shows a folder save dialog and creates a directory structure
#[tauri::command]
pub async fn save_thread_export_folder(
    app: AppHandle,
    folder_name: String,
    markdown_content: String,
    attachments: Vec<AttachmentData>,
) -> AppResult<ExportResult> {
    info!("Saving thread export folder with name: {}", folder_name);

    // Create folder save dialog
    let folder_path = app
        .dialog()
        .file()
        .set_file_name(&folder_name)
        .blocking_pick_folder();

    match folder_path {
        Some(FilePath::Path(base_path)) => {
            info!("User selected folder: {:?}", base_path);

            // Create the thread folder
            let thread_folder = base_path.join(&folder_name);
            match fs::create_dir_all(&thread_folder).await {
                Ok(_) => info!("Created thread folder: {:?}", thread_folder),
                Err(e) => {
                    error!("Failed to create thread folder: {}", e);
                    return Ok(ExportResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to create folder: {}", e)),
                    });
                }
            }

            // Create attachments subdirectory
            let attachments_dir = thread_folder.join("attachments");
            match fs::create_dir_all(&attachments_dir).await {
                Ok(_) => info!("Created attachments folder: {:?}", attachments_dir),
                Err(e) => {
                    error!("Failed to create attachments folder: {}", e);
                    return Ok(ExportResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to create attachments folder: {}", e)),
                    });
                }
            }

            // Save markdown file
            let markdown_path = thread_folder.join("thread.md");
            match fs::write(&markdown_path, markdown_content.as_bytes()).await {
                Ok(_) => info!("Saved markdown file: {:?}", markdown_path),
                Err(e) => {
                    error!("Failed to write markdown file: {}", e);
                    return Ok(ExportResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to write markdown: {}", e)),
                    });
                }
            }

            // Save each attachment
            for attachment in attachments {
                let file_path = attachments_dir.join(&attachment.filename);

                // Decode base64 content
                let bytes = match general_purpose::STANDARD.decode(&attachment.content) {
                    Ok(b) => b,
                    Err(e) => {
                        error!("Failed to decode base64 for {}: {}", attachment.filename, e);
                        continue; // Skip this file but continue with others
                    }
                };

                match fs::write(&file_path, &bytes).await {
                    Ok(_) => info!("Saved attachment: {:?}", file_path),
                    Err(e) => {
                        error!("Failed to write attachment {}: {}", attachment.filename, e);
                        // Continue with other files
                    }
                }
            }

            Ok(ExportResult {
                success: true,
                path: Some(thread_folder.to_string_lossy().to_string()),
                error: None,
            })
        }
        Some(FilePath::Url(_)) => {
            Ok(ExportResult {
                success: false,
                path: None,
                error: Some("URL paths are not supported".to_string()),
            })
        }
        None => {
            info!("User cancelled folder save dialog");
            Ok(ExportResult {
                success: false,
                path: None,
                error: Some("User cancelled".to_string()),
            })
        }
    }
}
