use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentData {
    pub filename: String,
    pub content: String, // base64
}

/// Save thread export to a file
/// Shows a file save dialog and saves the content to the selected location
/// If default_dir is provided and valid, saves directly without showing dialog
#[tauri::command]
pub async fn save_thread_export(
    app: AppHandle,
    content: String,
    default_name: String,
    extension: String,
    default_dir: Option<String>,
) -> AppResult<ExportResult> {
    info!("Saving thread export with default name: {}", default_name);

    // If default directory is provided, try to save there first
    if let Some(dir_path) = default_dir {
        if !dir_path.is_empty() {
            info!("Attempting to save to default directory: {}", dir_path);

            let dir = PathBuf::from(&dir_path);
            let file_path = dir.join(&default_name);

            // Check if directory exists
            if !dir.exists() {
                error!("Default directory does not exist: {:?}", dir);
                info!("Falling back to file dialog");
                return show_save_dialog(app, content, default_name, extension).await;
            }

            // Try to write file
            match fs::write(&file_path, content.as_bytes()).await {
                Ok(_) => {
                    info!("Successfully saved to default directory: {:?}", file_path);
                    return Ok(ExportResult {
                        success: true,
                        path: Some(file_path.to_string_lossy().to_string()),
                        error: None,
                    });
                }
                Err(e) => {
                    error!("Failed to write to default directory: {}", e);
                    info!("Falling back to file dialog");
                    // Fall through to dialog
                }
            }
        }
    }

    // Default directory not specified or failed - show dialog
    show_save_dialog(app, content, default_name, extension).await
}

/// Show file save dialog and save content
async fn show_save_dialog(
    app: AppHandle,
    content: String,
    default_name: String,
    extension: String,
) -> AppResult<ExportResult> {
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&format!("{} files", extension.to_uppercase()), &[&extension])
        .blocking_save_file();

    match file_path {
        Some(FilePath::Path(path)) => {
            info!("User selected path: {:?}", path);

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
            Ok(ExportResult {
                success: false,
                path: None,
                error: Some("URL paths are not supported".to_string()),
            })
        }
        None => {
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
/// If default_dir is provided and valid, saves directly without showing dialog
#[tauri::command]
pub async fn save_thread_export_folder(
    app: AppHandle,
    folder_name: String,
    markdown_content: String,
    attachments: Vec<AttachmentData>,
    default_dir: Option<String>,
) -> AppResult<ExportResult> {
    info!("Saving thread export folder with name: {}", folder_name);

    // If default directory is provided, try to save there first
    if let Some(base_dir_path) = default_dir {
        if !base_dir_path.is_empty() {
            info!("Attempting to save folder to default directory: {}", base_dir_path);

            let base_path = PathBuf::from(&base_dir_path);

            // Check if directory exists
            if !base_path.exists() {
                error!("Default directory does not exist: {:?}", base_path);
                info!("Falling back to folder dialog");
                return show_folder_dialog(app, folder_name, markdown_content, attachments).await;
            }

            // Try to create export folder
            match create_export_folder(base_path, folder_name.clone(), markdown_content.clone(), attachments.clone()).await {
                Ok(thread_folder_path) => {
                    info!("Successfully saved folder to default directory: {:?}", thread_folder_path);
                    return Ok(ExportResult {
                        success: true,
                        path: Some(thread_folder_path.to_string_lossy().to_string()),
                        error: None,
                    });
                }
                Err(e) => {
                    error!("Failed to save to default directory: {}", e);
                    info!("Falling back to folder dialog");
                    // Fall through to dialog
                }
            }
        }
    }

    // Default directory not specified or failed - show dialog
    show_folder_dialog(app, folder_name, markdown_content, attachments).await
}

/// Create export folder with markdown and attachments
async fn create_export_folder(
    base_path: PathBuf,
    folder_name: String,
    markdown_content: String,
    attachments: Vec<AttachmentData>,
) -> Result<PathBuf, std::io::Error> {
    // Create the thread folder
    let thread_folder = base_path.join(&folder_name);
    fs::create_dir_all(&thread_folder).await?;
    info!("Created thread folder: {:?}", thread_folder);

    // Create attachments subdirectory
    let attachments_dir = thread_folder.join("attachments");
    fs::create_dir_all(&attachments_dir).await?;
    info!("Created attachments folder: {:?}", attachments_dir);

    // Save markdown file
    let markdown_path = thread_folder.join("thread.md");
    fs::write(&markdown_path, markdown_content.as_bytes()).await?;
    info!("Saved markdown file: {:?}", markdown_path);

    // Save each attachment
    for attachment in attachments {
        let file_path = attachments_dir.join(&attachment.filename);

        // Decode base64 content
        let bytes = general_purpose::STANDARD
            .decode(&attachment.content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        fs::write(&file_path, &bytes).await?;
        info!("Saved attachment: {:?}", file_path);
    }

    Ok(thread_folder)
}

/// Show folder dialog and create export folder
async fn show_folder_dialog(
    app: AppHandle,
    folder_name: String,
    markdown_content: String,
    attachments: Vec<AttachmentData>,
) -> AppResult<ExportResult> {
    let folder_path = app
        .dialog()
        .file()
        .set_title(&format!(
            "Select parent folder (new folder '{}' will be created inside)",
            folder_name
        ))
        .blocking_pick_folder();

    match folder_path {
        Some(FilePath::Path(base_path)) => {
            info!("User selected folder: {:?}", base_path);

            match create_export_folder(base_path, folder_name, markdown_content, attachments).await {
                Ok(thread_folder_path) => {
                    Ok(ExportResult {
                        success: true,
                        path: Some(thread_folder_path.to_string_lossy().to_string()),
                        error: None,
                    })
                }
                Err(e) => {
                    error!("Failed to create export folder: {}", e);
                    Ok(ExportResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to create folder: {}", e)),
                    })
                }
            }
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
