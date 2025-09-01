# Personal Slack Client - Project Overview

## Purpose
A desktop application that enhances Slack's search capabilities, allowing users to:
- Search and view more than 10 messages at once (removes Slack's 10-item limit)
- Browse complete thread conversations efficiently
- Filter by channel, user, and date range
- Parse Slack URLs to instantly view threads
- Paginate through all matching messages automatically

## Technology Stack

### Backend (Rust)
- **Framework**: Tauri v2 (desktop application framework)
- **Language**: Rust (2021 edition)
- **Key Dependencies**:
  - `reqwest`: HTTP client for Slack API calls
  - `tokio`: Async runtime
  - `serde/serde_json`: JSON serialization
  - `chrono`: Date/time handling
  - `anyhow/thiserror`: Error handling
  - `tracing/tracing-subscriber`: Logging

### Frontend (TypeScript/Svelte)
- **Framework**: Svelte 4.2 with TypeScript
- **Build Tool**: Vite 5.4
- **Key Dependencies**:
  - `@tauri-apps/api`: Tauri frontend API
  - `svelte-preprocess`: TypeScript preprocessing

### API Integration
- **Slack Web API**: Uses User Token (xoxp-) for authentication
- **Required Scopes**:
  - `search:read`: Search messages
  - `channels:read`: List channels
  - `users:read`: Get user information
  - `channels:history`: Read message history

## Security Features
- Token stored securely using Tauri's store plugin
- Token never exposed in frontend
- All API calls made from Rust backend
- Secure IPC between frontend and backend