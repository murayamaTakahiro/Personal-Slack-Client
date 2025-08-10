use crate::error::{AppError, AppResult};
use crate::slack::SlackClient;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, error};

#[derive(Clone)]
pub struct AppState {
    token: Arc<RwLock<Option<String>>>,
    user_cache: Arc<RwLock<HashMap<String, String>>>,
    channel_cache: Arc<RwLock<HashMap<String, String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            token: Arc::new(RwLock::new(None)),
            user_cache: Arc::new(RwLock::new(HashMap::new())),
            channel_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn set_token(&self, token: String) -> AppResult<()> {
        debug!("Setting Slack token");
        let mut token_lock = self.token.write().await;
        *token_lock = Some(token);
        
        // Also save to secure storage
        // TODO: Implement secure storage using Tauri's keyring API
        
        info!("Token set successfully");
        Ok(())
    }

    pub async fn get_token(&self) -> AppResult<String> {
        let token_lock = self.token.read().await;
        
        if let Some(token) = token_lock.as_ref() {
            return Ok(token.clone());
        }
        
        // Try to load from secure storage
        // TODO: Implement secure storage retrieval
        
        // For now, try to get from environment variable
        if let Ok(token) = std::env::var("SLACK_USER_TOKEN") {
            drop(token_lock);
            self.set_token(token.clone()).await?;
            return Ok(token);
        }
        
        Err(AppError::AuthError("No Slack token configured".to_string()))
    }

    pub async fn get_client(&self) -> AppResult<SlackClient> {
        let token = match self.get_token().await {
            Ok(t) => {
                info!("Successfully retrieved token for Slack client");
                t
            },
            Err(e) => {
                error!("Failed to get token for Slack client: {}", e);
                return Err(AppError::AuthError(
                    "No Slack token configured. Please add your token in Settings.".to_string()
                ));
            }
        };
        
        match SlackClient::new(token) {
            Ok(client) => {
                info!("Slack client created successfully");
                Ok(client)
            },
            Err(e) => {
                error!("Failed to create Slack client: {}", e);
                Err(AppError::Unknown(e.to_string()))
            }
        }
    }

    pub async fn cache_user(&self, user_id: String, user_name: String) {
        let mut cache = self.user_cache.write().await;
        cache.insert(user_id, user_name);
    }

    pub async fn cache_channel(&self, channel_id: String, channel_name: String) {
        let mut cache = self.channel_cache.write().await;
        cache.insert(channel_id, channel_name);
    }

    pub async fn get_user_cache(&self) -> HashMap<String, String> {
        let cache = self.user_cache.read().await;
        cache.clone()
    }

    pub async fn get_channel_cache(&self) -> HashMap<String, String> {
        let cache = self.channel_cache.read().await;
        cache.clone()
    }

    pub async fn clear_caches(&self) {
        debug!("Clearing caches");
        let mut user_cache = self.user_cache.write().await;
        let mut channel_cache = self.channel_cache.write().await;
        user_cache.clear();
        channel_cache.clear();
        info!("Caches cleared");
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}