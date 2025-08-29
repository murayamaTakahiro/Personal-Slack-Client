use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenUrlsResult {
    pub opened_slack: bool,
    pub opened_external_count: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn open_urls_smart(
    slack_url: Option<String>,
    external_urls: Vec<String>,
    delay_ms: Option<u64>,
) -> Result<OpenUrlsResult, String> {
    let mut result = OpenUrlsResult {
        opened_slack: false,
        opened_external_count: 0,
        errors: Vec::new(),
    };
    
    let delay = Duration::from_millis(delay_ms.unwrap_or(200));
    
    // Open Slack URL first if provided
    if let Some(url) = slack_url {
        match open_url(&url) {
            Ok(_) => {
                result.opened_slack = true;
                // Small delay after opening Slack URL
                sleep(delay).await;
            }
            Err(e) => {
                result.errors.push(format!("Failed to open Slack URL: {}", e));
            }
        }
    }
    
    // Open external URLs with delay between each
    for (index, url) in external_urls.iter().enumerate() {
        match open_url(url) {
            Ok(_) => {
                result.opened_external_count += 1;
                // Delay between URLs to avoid overwhelming the browser
                if index < external_urls.len() - 1 {
                    sleep(delay).await;
                }
            }
            Err(e) => {
                result.errors.push(format!("Failed to open URL {}: {}", url, e));
            }
        }
    }
    
    Ok(result)
}

// Helper function to open URL using system default browser
fn open_url(url: &str) -> Result<(), String> {
    match webbrowser::open(url) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open browser: {}", e)),
    }
}