use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
pub enum AppError {
    #[error("API error: {0}")]
    ApiError(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Authentication error: {0}")]
    AuthError(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::NetworkError(err.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Unknown(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::ParseError(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::StorageError(err.to_string())
    }
}

impl From<tauri_plugin_store::Error> for AppError {
    fn from(err: tauri_plugin_store::Error) -> Self {
        AppError::StorageError(err.to_string())
    }
}

// Convert AppError to a format suitable for Tauri commands
impl AppError {
    pub fn to_string(&self) -> String {
        match self {
            AppError::ApiError(msg) => format!("API Error: {}", msg),
            AppError::NetworkError(msg) => format!("Network Error: {}", msg),
            AppError::AuthError(msg) => format!("Authentication Error: {}", msg),
            AppError::ParseError(msg) => format!("Parse Error: {}", msg),
            AppError::ConfigError(msg) => format!("Configuration Error: {}", msg),
            AppError::StorageError(msg) => format!("Storage Error: {}", msg),
            AppError::Unknown(msg) => format!("Error: {}", msg),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;