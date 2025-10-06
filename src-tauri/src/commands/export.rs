use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::fs;
use tracing::{info, error};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
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
