use crate::error::{AppError, AppResult};
use crate::slack::{SlackClient, SearchResult};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, error};
use serde::{Serialize, Deserialize};
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Clone, Serialize, Deserialize)]
pub struct CachedUser {
    pub name: String,
    pub cached_at: u64,  // Unix timestamp
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CachedChannel {
    pub name: String,
    pub cached_at: u64,  // Unix timestamp
}

#[derive(Clone)]
pub struct CachedSearchResult {
    pub result: SearchResult,
    pub cached_at: u64,  // Unix timestamp
}

#[derive(Clone)]
pub struct AppState {
    token: Arc<RwLock<Option<String>>>,
    user_cache: Arc<RwLock<HashMap<String, CachedUser>>>,
    channel_cache: Arc<RwLock<HashMap<String, CachedChannel>>>,
    search_cache: Arc<RwLock<HashMap<u64, CachedSearchResult>>>,  // Hash of search params -> result
}

impl AppState {
    pub fn new() -> Self {
        Self {
            token: Arc::new(RwLock::new(None)),
            user_cache: Arc::new(RwLock::new(HashMap::new())),
            channel_cache: Arc::new(RwLock::new(HashMap::new())),
            search_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::from_secs(0))
            .as_secs()
    }
    
    fn is_cache_valid(cached_at: u64) -> bool {
        let now = Self::current_timestamp();
        const CACHE_DURATION_SECS: u64 = 86400; // 24 hours
        now - cached_at < CACHE_DURATION_SECS
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
                    "No Slack token configured. Please add your token in Settings (Settings button in top-right corner).".to_string()
                ));
            }
        };
        
        // Validate token format
        if !token.starts_with("xoxp-") && !token.starts_with("xoxb-") {
            error!("Invalid token format - should start with xoxp- or xoxb-");
            return Err(AppError::AuthError(
                "Invalid token format. Slack tokens should start with 'xoxp-' (user token) or 'xoxb-' (bot token).".to_string()
            ));
        }
        
        match SlackClient::new(token) {
            Ok(client) => {
                info!("Slack client created successfully");
                Ok(client)
            },
            Err(e) => {
                error!("Failed to create Slack client: {}", e);
                Err(AppError::ConfigError(format!("Failed to initialize Slack client: {}", e)))
            }
        }
    }

    pub async fn cache_user(&self, user_id: String, user_name: String) {
        let mut cache = self.user_cache.write().await;
        cache.insert(user_id, CachedUser {
            name: user_name,
            cached_at: Self::current_timestamp(),
        });
    }

    pub async fn cache_channel(&self, channel_id: String, channel_name: String) {
        let mut cache = self.channel_cache.write().await;
        cache.insert(channel_id, CachedChannel {
            name: channel_name,
            cached_at: Self::current_timestamp(),
        });
    }

    pub async fn get_user_cache(&self) -> HashMap<String, String> {
        let cache = self.user_cache.read().await;
        let mut result = HashMap::new();
        for (id, user) in cache.iter() {
            if Self::is_cache_valid(user.cached_at) {
                result.insert(id.clone(), user.name.clone());
            }
        }
        result
    }

    pub async fn get_channel_cache(&self) -> HashMap<String, String> {
        let cache = self.channel_cache.read().await;
        let mut result = HashMap::new();
        for (id, channel) in cache.iter() {
            if Self::is_cache_valid(channel.cached_at) {
                result.insert(id.clone(), channel.name.clone());
            }
        }
        result
    }

    pub async fn clear_caches(&self) {
        debug!("Clearing caches");
        let mut user_cache = self.user_cache.write().await;
        let mut channel_cache = self.channel_cache.write().await;
        let mut search_cache = self.search_cache.write().await;
        user_cache.clear();
        channel_cache.clear();
        search_cache.clear();
        info!("Caches cleared");
    }
    
    fn hash_search_params(
        query: &str,
        channel: &Option<String>,
        user: &Option<String>,
        from_date: &Option<String>,
        to_date: &Option<String>,
        limit: &Option<usize>,
    ) -> u64 {
        let mut hasher = DefaultHasher::new();
        query.hash(&mut hasher);
        channel.hash(&mut hasher);
        user.hash(&mut hasher);
        from_date.hash(&mut hasher);
        to_date.hash(&mut hasher);
        limit.hash(&mut hasher);
        hasher.finish()
    }
    
    pub async fn get_cached_search(
        &self,
        query: &str,
        channel: &Option<String>,
        user: &Option<String>,
        from_date: &Option<String>,
        to_date: &Option<String>,
        limit: &Option<usize>,
    ) -> Option<SearchResult> {
        let cache_key = Self::hash_search_params(query, channel, user, from_date, to_date, limit);
        let cache = self.search_cache.read().await;
        
        if let Some(cached) = cache.get(&cache_key) {
            // Check if cache is still valid (5 minutes for search results)
            const SEARCH_CACHE_DURATION_SECS: u64 = 300; // 5 minutes
            let now = Self::current_timestamp();
            if now - cached.cached_at < SEARCH_CACHE_DURATION_SECS {
                info!("Search result cache hit for query: {}", query);
                return Some(cached.result.clone());
            }
        }
        None
    }
    
    pub async fn cache_search_result(
        &self,
        query: &str,
        channel: &Option<String>,
        user: &Option<String>,
        from_date: &Option<String>,
        to_date: &Option<String>,
        limit: &Option<usize>,
        result: SearchResult,
    ) {
        let cache_key = Self::hash_search_params(query, channel, user, from_date, to_date, limit);
        let mut cache = self.search_cache.write().await;
        
        // Keep cache size reasonable (max 50 searches)
        if cache.len() >= 50 {
            // Remove oldest entry
            if let Some(oldest_key) = cache
                .iter()
                .min_by_key(|(_, v)| v.cached_at)
                .map(|(k, _)| *k)
            {
                cache.remove(&oldest_key);
            }
        }
        
        cache.insert(cache_key, CachedSearchResult {
            result,
            cached_at: Self::current_timestamp(),
        });
        debug!("Cached search result for query: {}", query);
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}