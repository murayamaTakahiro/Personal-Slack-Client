# ✨ Personal Slack Client

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat-square)
![Rust](https://img.shields.io/badge/rust-stable-orange.svg?style=flat-square)
![Svelte](https://img.shields.io/badge/svelte-4.2.0-ff3e00.svg?style=flat-square)
![Tauri](https://img.shields.io/badge/tauri-2.7.0-24C8D8.svg?style=flat-square)

**🚀 Supercharged Slack desktop client with unlimited search, DM support, and lightning-fast performance**

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Configuration](#-configuration) • [Keyboard Shortcuts](#-keyboard-shortcuts)

---

## 🎯 Why Personal Slack Client?

Traditional Slack limits search results to 10 messages, making it difficult to find older conversations. **Personal Slack Client** removes these limitations while adding powerful features for power users.

### ⚡ Core Capabilities

- **🔍 Unlimited Search** - Search through all messages without the 10-result limitation
- **💬 DM & Group DM Support** - Full access to direct messages and group conversations
- **🎭 Multi-Workspace** - Switch seamlessly between multiple Slack workspaces
- **⚡ Blazing Fast** - Rust backend with optimized caching and parallel processing
- **🔒 Secure** - Tokens stored securely, never exposed in the UI

## ✨ Features

### 🔍 Search & Navigation
- **Unlimited Results** - No more 10-message search limitation
- **Advanced Filters** - Filter by channel, user, date range, and message type
- **Thread Viewer** - View complete thread conversations with context
- **URL Parsing** - Paste any Slack URL to instantly jump to that message/thread
- **Smart Caching** - Lightning-fast repeated searches with intelligent cache management

### 💬 Messaging & Reactions
- **DM Support** - Search and view Direct Messages (1-on-1 conversations)
- **Group DM Support** - Access Multi-Party Direct Messages (MPIMs)
- **Quick Reactions** - Number keys (1-9) for instant emoji reactions
- **Custom Emoji** - Full support for workspace custom emoji
- **Thread Replies** - Post replies directly to threads
- **Mention Support** - @-mention users with autocomplete

### 🎮 Power User Features
- **Vim-style Navigation** - `j`/`k` for message navigation, `/` for search
- **Live Mode** - Real-time updates from multiple channels simultaneously
- **Batch Operations** - Process hundreds of messages efficiently
- **File Preview** - Built-in image and PDF viewer with keyboard navigation
- **Performance Dashboard** - Monitor API usage and response times

### 🎨 User Experience
- **Zoom Controls** - Scale interface from 50% to 200%
- **Keyboard-First** - Complete keyboard navigation support
- **Fast Search** - Instant search with debouncing and caching
- **Workspace Switching** - Quick switch between workspaces (`Ctrl+1-9`)
- **Saved Searches** - Store and quickly access frequent searches

## 📦 Installation

### Prerequisites

```bash
# Required
✓ Node.js v16+
✓ Rust (latest stable)
✓ Slack User Token (xoxp-)
```

### Build from Source

```bash
# Clone repository
git clone https://github.com/yourusername/personal-slack-client.git
cd personal-slack-client

# Install dependencies
npm install

# Build application
npm run tauri:build

# Or run in development mode
npm run tauri:dev
```

## 🚀 Quick Start

### 1️⃣ Get Your Slack Token

1. Visit [Slack API Apps](https://api.slack.com/apps)
2. Create a new app or select existing
3. Install to workspace
4. Copy the **User Token** (`xoxp-...`)

### 2️⃣ Required OAuth Scopes

Configure these scopes in your Slack app:

| Scope | Purpose |
|-------|---------|
| `search:read` | Search messages across workspace |
| `channels:read` | List and access public/private channels |
| `channels:history` | Read channel message history |
| `users:read` | Get user information and profiles |
| `im:read` | Access Direct Message channels |
| `im:history` | Read Direct Message history |
| `mpim:read` | Access Group DM channels |
| `mpim:history` | Read Group DM history |
| `groups:read` | Access private channels |
| `groups:history` | Read private channel history |
| `reactions:read` | View message reactions |
| `reactions:write` | Add reactions to messages |
| `chat:write` | Post messages and replies |
| `files:read` | View and download files |

### 3️⃣ Configure & Launch

1. Launch the application
2. Press `Ctrl+,` to open Settings
3. Enter your Slack token
4. Start searching with `/` or `Ctrl+F`

## ⌨️ Keyboard Shortcuts

### 🎯 Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Next message |
| `k` / `↑` | Previous message |
| `Esc` | Close dialog/thread |

### 🔍 Search & Filter

| Key | Action |
|-----|--------|
| `Ctrl+K` | Focus search |

### 💬 Actions

| Key | Action |
|-----|--------|
| `1-9` | Quick reaction |
| `r` | Reply to thread |
| `Ctrl+Enter` | Send message |
| `@` | Mention user |

### 🎮 Workspace & View

| Key | Action |
|-----|--------|
| `Ctrl+1-9` | Switch workspace |
| `Ctrl+L` | Toggle Live mode |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `?` | Show Keyboard Shortcuts |

## 🛠️ Configuration

### Token Storage
Tokens are securely stored in your system's credential store:
- **Windows**: Windows Credential Manager
- **macOS**: Keychain
- **Linux**: Secret Service API

### Settings Location
```
Windows: %APPDATA%\personal-slack-client\
macOS:   ~/Library/Application Support/personal-slack-client/
Linux:   ~/.config/personal-slack-client/
```

## 🏗️ Architecture

```
personal-slack-client/
├── src-tauri/          # 🦀 Rust backend
│   ├── slack/          # Slack API client
│   ├── commands/       # Tauri IPC commands
│   └── state.rs        # Application state
├── src/                # 🎨 Svelte frontend
│   ├── components/     # UI components
│   ├── stores/         # State management
│   └── api/            # API layer
└── package.json
```

### Tech Stack

- **Backend**: Rust + Tauri 2.0 for native performance
- **Frontend**: Svelte 4 + TypeScript for reactive UI
- **API**: Slack Web API with batched requests
- **Caching**: LRU cache + IndexedDB for offline access
- **Security**: OS keychain integration for token storage

## 🔥 Performance

- **400+ messages/second** processing capability
- **30 concurrent API requests** for parallel fetching
- **Smart caching** with automatic invalidation
- **Debounced search** for responsive typing
- **Virtual scrolling** for large message lists
- **Optimized re-renders** with Svelte's reactivity

