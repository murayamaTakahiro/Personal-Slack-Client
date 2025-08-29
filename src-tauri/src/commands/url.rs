use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tracing::{debug, error, info, warn};

/// Result of opening URLs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenUrlsResult {
    pub opened_slack: bool,
    pub opened_external_count: usize,
    pub errors: Vec<String>,
}

/// Smart URL opening command that handles Slack and external URLs appropriately
/// 
/// Opens the first Slack URL found (if any) and all external URLs
/// with configurable delays between openings to prevent browser issues
#[tauri::command]
pub async fn open_urls_smart(
    app: AppHandle,
    slack_url: Option<String>,
    external_urls: Vec<String>,
    delay_ms: Option<u64>,
) -> Result<OpenUrlsResult, String> {
    info!(
        "Opening URLs: slack_url={:?}, external_urls={:?}, delay_ms={:?}",
        slack_url, external_urls, delay_ms
    );

    let delay_ms = delay_ms.unwrap_or(200); // Default 200ms delay
    let mut result = OpenUrlsResult {
        opened_slack: false,
        opened_external_count: 0,
        errors: Vec::new(),
    };

    // Open Slack URL first (if provided)
    if let Some(slack_url) = slack_url {
        match open_url_with_opener(&app, &slack_url).await {
            Ok(_) => {
                info!("Successfully opened Slack URL: {}", slack_url);
                result.opened_slack = true;
            }
            Err(e) => {
                let error_msg = format!("Failed to open Slack URL '{}': {}", slack_url, e);
                error!("{}", error_msg);
                result.errors.push(error_msg);
            }
        }
        
        // Add delay after Slack URL if we have external URLs to open
        if !external_urls.is_empty() && delay_ms > 0 {
            debug!("Waiting {}ms before opening external URLs", delay_ms);
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        }
    }

    // Open external URLs
    for (index, url) in external_urls.iter().enumerate() {
        // Add delay between external URLs (except for the first one)
        if index > 0 && delay_ms > 0 {
            debug!("Waiting {}ms before opening next external URL", delay_ms);
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        }

        match open_url_with_opener(&app, url).await {
            Ok(_) => {
                info!("Successfully opened external URL: {}", url);
                result.opened_external_count += 1;
            }
            Err(e) => {
                let error_msg = format!("Failed to open external URL '{}': {}", url, e);
                error!("{}", error_msg);
                result.errors.push(error_msg);
            }
        }
    }

    info!(
        "URL opening completed: slack={}, external={}/{}, errors={}",
        result.opened_slack,
        result.opened_external_count,
        external_urls.len(),
        result.errors.len()
    );

    Ok(result)
}

/// Helper function to open a URL using the Tauri opener plugin
async fn open_url_with_opener(_app: &AppHandle, url: &str) -> Result<(), String> {
    debug!("Opening URL: {}", url);
    
    // Validate URL format
    if url.is_empty() {
        return Err("URL cannot be empty".to_string());
    }
    
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("Invalid URL scheme: {}", url));
    }

    // Use the opener plugin to open the URL
    match tauri_plugin_opener::open_url(url, None::<&str>) {
        Ok(_) => {
            debug!("URL opened successfully: {}", url);
            Ok(())
        }
        Err(e) => {
            error!("Failed to open URL '{}': {}", url, e);
            Err(format!("Failed to open URL: {}", e))
        }
    }
}

/// Helper command to validate if URLs are properly formatted
#[tauri::command]
pub async fn validate_urls(urls: Vec<String>) -> Result<Vec<String>, String> {
    let mut valid_urls = Vec::new();
    
    for url in urls {
        if url.starts_with("http://") || url.starts_with("https://") {
            valid_urls.push(url);
        } else {
            warn!("Skipping invalid URL: {}", url);
        }
    }
    
    Ok(valid_urls)
}