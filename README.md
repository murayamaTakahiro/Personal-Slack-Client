# Slack Search Enhancer

A powerful desktop application that enhances Slack's search capabilities, allowing you to search and view more than 10 messages at once and efficiently browse thread conversations.

## Features

- **Enhanced Search**: Search for messages with no 10-item limit
- **Advanced Filters**: Filter by channel, user, date range
- **Thread Viewer**: View complete thread conversations
- **URL Parsing**: Paste a Slack URL to instantly view the thread
- **Pagination**: Automatically fetches all matching messages
- **Fast Performance**: Built with Rust backend for optimal speed
- **Secure**: Token stored securely, never exposed

## Technology Stack

- **Backend**: Rust with Tauri framework
- **Frontend**: Svelte with TypeScript
- **API**: Slack Web API
- **Authentication**: User Token (xoxp-)

## Prerequisites

- Node.js (v16 or higher)
- Rust (latest stable)
- npm or yarn
- Slack User Token

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/slack-search-enhancer.git
cd slack-search-enhancer
```

2. Install dependencies:
```bash
npm install
```

3. Install Rust dependencies:
```bash
cd src-tauri
cargo build
```

## Development

Run the development server:
```bash
npm run tauri:dev
```

## Build

Build for production:
```bash
npm run tauri:build
```

## Configuration

### Getting Your Slack Token

1. Go to [Slack API](https://api.slack.com/authentication/token-types#user)
2. Create a new app or use an existing one
3. Install the app to your workspace
4. Copy the User Token (starts with `xoxp-`)

### Required Scopes

The following OAuth scopes are required:
- `search:read` - Search messages
- `channels:read` - List channels
- `users:read` - Get user information
- `channels:history` - Read message history

## Usage

1. **Initial Setup**:
   - Click the Settings button
   - Enter your Slack User Token
   - Enter your workspace name
   - Save settings

2. **Search Messages**:
   - Enter search query in the search bar
   - Optional: Use advanced filters for channel, user, date range
   - Click Search or press Enter
   - Results appear in the left panel

3. **View Threads**:
   - Click on any message to view its thread
   - Thread appears in the right panel
   - Click "Open in Slack" to view in browser

4. **URL Thread Viewing**:
   - Paste a Slack message URL in the URL input field
   - Click "Load Thread" to instantly view the conversation

## Project Structure

```
slack-search-enhancer/
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── slack/      # Slack API integration
│   │   │   ├── client.rs      # API client
│   │   │   ├── models.rs      # Data models
│   │   │   └── parser.rs      # URL parser
│   │   ├── commands/   # Tauri commands
│   │   │   ├── search.rs      # Search commands
│   │   │   └── thread.rs      # Thread commands
│   │   ├── state.rs    # Application state
│   │   ├── error.rs    # Error handling
│   │   └── lib.rs      # Main library
├── src/                # Svelte frontend
│   ├── lib/
│   │   ├── components/ # UI components
│   │   ├── stores/     # State management
│   │   ├── api/        # API layer
│   │   └── types/      # TypeScript types
│   └── App.svelte      # Main component
└── package.json
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) 
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
