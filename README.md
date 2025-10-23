# ✨ Personal Slack Client

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat-square)
![Rust](https://img.shields.io/badge/rust-stable-orange.svg?style=flat-square)
![Svelte](https://img.shields.io/badge/svelte-4.2.0-ff3e00.svg?style=flat-square)
![Tauri](https://img.shields.io/badge/tauri-2.7.0-24C8D8.svg?style=flat-square)

**🚀 Supercharged Slack desktop client that breaks free from limitations - unlimited search, advanced file previews, and professional-grade productivity features**

[Why Use This?](#-why-personal-slack-client) • [Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Keyboard Shortcuts](#️-keyboard-shortcuts)

---

## 🎯 Why Personal Slack Client?

**Slack's official client is great, but it has frustrating limitations for power users.** Personal Slack Client removes these barriers and adds enterprise-grade features that transform how you work with Slack.

### 💔 Limitations You'll Leave Behind

- ❌ **10-message search limit** - Can't find that important conversation from last month
- ❌ **Limited file previews** - Have to download Word/Excel files just to peek at them
- ❌ **No thread export** - Can't easily share discussion context with LLMs or documentation
- ❌ **Clunky navigation** - Mouse-dependent workflow slows you down
- ❌ **No advanced bookmarks** - Can't efficiently manage important messages
- ❌ **Limited keyboard shortcuts** - Productivity bottlenecks everywhere

### ✨ What You Gain

**🔍 Unlimited Search**
- Search through **ALL** your messages, no 10-result cap
- Advanced filters: channel, user, date range, message type
- Smart caching for instant repeated searches
- Saved searches for frequent queries
- Search keyword history with `Ctrl+H`

**📂 Professional File Management**
- **Office File Preview**: Word, Excel, PowerPoint, Google Docs/Sheets - preview without downloading
- **Advanced Image Viewer**: Interactive zoom (double-click or `+`/`-` keys), pan, and navigate
- **PDF Viewer**: Built-in preview with page navigation
- **Email Attachments**: View email metadata (From/To/Subject) and download attachments directly
- **Bulk Download**: Download all attachments from a message with `d` key

**🧵 Thread Productivity**
- **Thread Export** (`Ctrl+E`): Export entire threads to Markdown/TSV with attachments
- Perfect for feeding context to LLMs (ChatGPT, Claude, etc.)
- Complete conversation history preserved for documentation
- Includes sender info, timestamps, reactions, and file links

**⚡ Power User Navigation**
- **Vim-style shortcuts**: `j`/`k` for up/down, `h`/`e` for first/last
- **Quick Actions**: `t` for reply, `p` for post, `r` for react, `b` for bookmark
- **File Lightbox**: `i` to open, arrow keys or `h`/`l` to navigate
- **Live Mode** (`Ctrl+L`): Real-time updates from multiple channels
- **Today's Catch Up** (`Ctrl+Shift+T`): Quick overview of today's messages

**🎯 Advanced Features**
- **Smart Bookmarks**: Bookmark messages with `b`, manage with `Ctrl+B`
- **Mark as Read** (`Shift+R`): Mark messages as read directly
- **Zoom Controls** (`Ctrl +/-/0`): Scale UI from 50% to 200%
- **Performance Monitor** (`Ctrl+Shift+P`): Track API usage and response times
- **Channel Favorites**: Star channels with `f` for quick access

## ✨ Features

### 🔍 Search & Navigation
- **Unlimited Search Results** - No more 10-message limitation, search your entire history
- **Advanced Filters** - Filter by channel, user, date range, and message type
- **Thread Viewer** - View complete thread conversations with full context
- **URL Parsing** - Paste any Slack URL to instantly jump to that message/thread
- **Smart Caching** - Lightning-fast repeated searches with intelligent cache management
- **Saved Searches** (`Ctrl+/`) - Store and quickly access frequent search queries
- **Search History** (`Ctrl+H`, `Ctrl+T`) - Access keyword and URL history

### 💬 Messaging & Reactions
- **DM Support** - Search and view Direct Messages (1-on-1 conversations)
- **Group DM Support** - Access Multi-Party Direct Messages (MPIMs)
- **Quick Reactions** - Number keys (1-9) for instant emoji reactions
- **Custom Emoji** - Full support for workspace custom emoji
- **Thread Replies** - Post replies directly to threads with `t` or `Shift+T`
- **Message Posting** - Quick post with `p` or continuous mode with `Shift+P`
- **Mention Support** - @-mention users with autocomplete
- **Quote Messages** - Quote selected message with `q`

### 📁 File Preview & Management
- **Office Files** - Preview Word (.doc, .docx), Excel (.xlsx), PowerPoint files without downloading
- **Google Workspace** - Preview Google Docs, Sheets with interactive zoom
- **Images** - Full-featured image viewer with zoom, pan, navigation
- **PDFs** - Built-in PDF preview with page navigation
- **Email Files** - Display email metadata (From/To/CC/Subject) and download attachments
- **CSV/TSV** - Table preview for data files
- **Text Files** - Syntax highlighting for code and text files
- **Bulk Download** (`d`) - Download all attachments from a message at once

### 🧵 Thread Management
- **Thread Export** (`Ctrl+E`) - Export complete threads to Markdown or TSV format
- **Attachment URLs** - Includes authenticated file URLs in exports
- **Metadata Preservation** - Preserves sender info, timestamps, reactions
- **LLM-Ready Format** - Perfect for feeding context to AI assistants

### 🎮 Power User Features
- **Vim-style Navigation** - `j`/`k` for message navigation, `h`/`e` for first/last
- **Live Mode** (`Ctrl+L`) - Real-time updates from multiple channels simultaneously
- **Today's Catch Up** (`Ctrl+Shift+T`) - Quick overview of today's unread messages
- **Smart Bookmarks** - Bookmark messages with `b`, manage with `Ctrl+B`
- **Mark as Read** (`Shift+R`) - Mark currently focused message as read on Slack
- **Performance Dashboard** (`Ctrl+Shift+P`) - Monitor API usage and response times
- **Channel Favorites** (`f`) - Toggle favorite status on channels

### 🎨 User Experience
- **Zoom Controls** (`Ctrl +/-/0`) - Scale interface from 50% to 200%
- **Keyboard-First** - Complete keyboard navigation support (80+ shortcuts)
- **Fast Search** - Instant search with debouncing and caching
- **Multi-Workspace** - Switch between workspaces (support in progress)
- **Customizable Shortcuts** - Remap any keyboard shortcut in Settings

## 📦 Installation

### Prerequisites

**Windows System Requirements:**
- Windows 10 or later
- Node.js v16 or higher
- Rust (latest stable)
- Slack User Token (`xoxp-...`)

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

**Build Output:** The executable will be created in `src-tauri/target/release/`

## 🚀 Quick Start

### 1️⃣ Get Your Slack Token

**Important:** You need a Slack User Token (`xoxp-...`) to use this application. This token gives the app access to your Slack workspace on your behalf.

**Steps to obtain a token:**

1. Visit [Slack API Apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Give your app a name (e.g., "My Personal Slack Client")
4. Select your workspace
5. Navigate to **"OAuth & Permissions"** in the sidebar
6. Scroll down to **"Scopes"** section
7. Add the **User Token Scopes** listed in the next section
8. Scroll up and click **"Install to Workspace"**
9. Review permissions and click **"Allow"**
10. Copy the **"User OAuth Token"** (starts with `xoxp-`)

**Security Note:** Your token is stored securely in Windows Credential Manager and never exposed in the UI or logs.

### 2️⃣ Required OAuth Scopes

Configure these **User Token Scopes** in your Slack app's OAuth & Permissions page:

| Scope | Purpose | Required |
|-------|---------|----------|
| `search:read` | Search messages across workspace | ✅ Essential |
| `channels:read` | List and access public/private channels | ✅ Essential |
| `channels:history` | Read channel message history | ✅ Essential |
| `users:read` | Get user information and profiles | ✅ Essential |
| `im:read` | Access Direct Message channels | ✅ Essential |
| `im:history` | Read Direct Message history | ✅ Essential |
| `mpim:read` | Access Group DM channels | ✅ Essential |
| `mpim:history` | Read Group DM history | ✅ Essential |
| `groups:read` | Access private channels | ✅ Essential |
| `groups:history` | Read private channel history | ✅ Essential |
| `reactions:read` | View message reactions | ✅ Essential |
| `reactions:write` | Add reactions to messages | Recommended |
| `chat:write` | Post messages and replies | Recommended |
| `files:read` | View and download files | ✅ Essential |

**Note:** All scopes marked "Essential" are required for core functionality. "Recommended" scopes enable additional features like posting messages and adding reactions.

### 3️⃣ Configure & Launch

**First Time Setup:**

1. **Launch the application** by double-clicking the executable
2. **Click "Add Workspace"** button in the top-left corner (or it will be shown automatically if no workspace is configured)
3. **Fill in the workspace information**:
   - **Workspace Name**: A friendly name (e.g., "Work", "Personal")
   - **Workspace Domain**: Your Slack workspace domain (e.g., "mycompany" for mycompany.slack.com)
   - **User Token**: Paste the User OAuth Token you copied earlier (`xoxp-...`)
   - **Color**: Choose a color to identify this workspace (optional)
4. **Click "Add Workspace"** to save
   - Your token will be securely stored in Windows Credential Manager
   - The app will automatically switch to the new workspace
5. **Start using the app**:
   - Press `Ctrl+K` to focus the search bar
   - Type your search query and press `Enter`
   - Use `j`/`k` or arrow keys to navigate results
   - Press `Enter` to view a message thread
6. **Configure optional settings** (recommended):
   - Press `Ctrl+,` to open Settings
   - **Keyboard Shortcuts tab**: Review and customize shortcuts
   - **Emoji Reactions tab**: Set up quick reaction mappings (1-9 keys)
   - **Performance tab**: Adjust caching and API batch settings
   - **Download Settings tab**: Set default download location

**Quick Keyboard Guide:**
- `Ctrl+K` - Focus search bar
- `Ctrl+Shift+F` - Advanced search filters
- `j` / `k` - Navigate messages
- `t` - Reply in thread
- `r` - Add reaction
- `i` - Open file lightbox
- `Ctrl+E` - Export thread
- `?` - Show all keyboard shortcuts

**Troubleshooting:**
- **"Authentication failed"**: Check that your token is correct and all required scopes are granted
- **"No results"**: Make sure you have messages in your workspace and proper channel access
- **Blank screen**: Press `Ctrl+Shift+P` to check API status, or restart the app

### 4️⃣ Pro Tips for First-Time Users

- **Bookmark important messages** with `b` - Access them later with `Ctrl+B`
- **Set up saved searches** (`Ctrl+/`) for queries you run often
- **Enable Live Mode** (`Ctrl+L`) to monitor multiple channels in real-time
- **Customize your reaction shortcuts** in Settings → Emoji Reactions
- **Use `Ctrl+E`** on any thread to export it for documentation or LLM context
- **Press `?`** anytime to see all available keyboard shortcuts

## ⌨️ Keyboard Shortcuts

Personal Slack Client is designed for keyboard-first productivity. Press `?` anytime to view the complete shortcuts list in-app.

### 🔍 Search & Navigation

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+K` | Focus search bar | Global |
| `Ctrl+Shift+F` | Toggle advanced search | Global |
| `Ctrl+N` | New search (clear current) | Global |
| `Enter` | Execute search / Open result | Search bar / Result list |
| `Escape` | Clear search / Close dialog | Global |
| `j` / `↓` | Next message | Result list |
| `k` / `↑` | Previous message | Result list |
| `h` | Jump to first message | Result list |
| `e` | Jump to last message | Result list / Thread |
| `Ctrl+1` | Focus result list | Global |
| `Ctrl+2` | Focus thread view | Global |

### 🎯 Filters & Advanced Search

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+Shift+C` | Toggle channel selector | Search bar |
| `Ctrl+M` | Toggle multi-select mode | Channel selector |
| `Ctrl+R` | Select recent channels | Channel selector |
| `Ctrl+F` | Select all favorites | Channel selector |
| `Ctrl+Shift+A` | Apply selected channels | Channel selector |
| `f` | Toggle channel favorite | Channel selector |
| `Ctrl+Shift+U` | Focus user selector | Search bar |
| `Ctrl+Shift+D` | Focus date filter (from) | Search bar |
| `Ctrl+H` | Toggle keyword history | Search bar |
| `Ctrl+T` | Toggle URL history | Search bar |

### 💬 Messaging & Actions

| Key | Action | Context |
|-----|--------|---------|
| `t` | Reply in thread | Result list |
| `Shift+T` | Reply in thread (continuous) | Result list |
| `p` | Post message to channel | Result list |
| `Shift+P` | Post message (continuous) | Result list |
| `q` | Quote message | Result list |
| `r` | Open reaction picker | Result list / Thread |
| `1`-`9` | Quick reaction (your emoji) | Result list / Thread |
| `Shift+1`-`9` | Quick reaction (others' emoji) | Result list / Thread |
| `Ctrl+Enter` | Send message | Message composer |
| `Alt+Enter` | Open all URLs in message | Result list / Thread |

### 📁 Files & Attachments

| Key | Action | Context |
|-----|--------|---------|
| `i` | Open file in lightbox | Result list / Thread |
| `d` | Download all attachments | Result list / Thread |
| `Ctrl+U` | Upload files | Message composer |
| `→` / `l` / `Tab` | Next file | Lightbox |
| `←` / `h` / `Shift+Tab` | Previous file | Lightbox |
| `↑` / `k` | Scroll up | Lightbox (PDF/Office) |
| `↓` / `j` | Scroll down | Lightbox (PDF/Office) |
| `+` / `=` | Zoom in | Lightbox |
| `-` | Zoom out | Lightbox |
| `0` | Reset zoom (1:1) | Lightbox |
| `Escape` | Close lightbox | Lightbox |

### 🧵 Thread Management

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+E` | Export thread to Markdown/TSV | Thread view |
| `Enter` | Open thread | Result list |
| `Escape` | Close thread | Thread view |
| `j` / `↓` | Next message in thread | Thread view |
| `k` / `↑` | Previous message in thread | Thread view |

### 🔖 Bookmarks & Organization

| Key | Action | Context |
|-----|--------|---------|
| `b` | Toggle bookmark on message | Result list / Thread |
| `Ctrl+B` | Toggle bookmark manager | Global |
| `Shift+R` | Mark message as read | Result list / Thread |
| `Ctrl+/` | Toggle saved searches | Global |
| `Ctrl+Shift+S` | Save current search | Search bar |
| `Alt+S` | Quick save search | Search bar |
| `Ctrl+Shift+R` | Refresh search | Search bar |

### 🎮 View & UI Controls

| Key | Action | Context |
|-----|--------|---------|
| `Ctrl+L` | Toggle Live Mode | Global |
| `Ctrl+Shift+T` | Today's Catch Up | Global |
| `Ctrl+,` | Toggle Settings | Global |
| `?` | Show keyboard shortcuts | Global |
| `Ctrl+=` | Zoom in | Global |
| `Ctrl+-` | Zoom out | Global |
| `Ctrl+0` | Reset zoom | Global |
| `Ctrl+Shift+P` | Toggle performance monitor | Global |

**Tip:** All keyboard shortcuts can be customized in Settings (`Ctrl+,`) → Keyboard Shortcuts tab.

## 🛠️ Configuration

### Token Storage

Your Slack token is stored securely using the Windows Credential Manager:
- **Windows**: Windows Credential Manager (`Control Panel → Credential Manager`)
- Token is encrypted by the operating system
- Never exposed in UI, logs, or temporary files
- Can be manually removed from Credential Manager if needed

### Settings Location

Application settings and cache are stored in:
```
Windows: %APPDATA%\personal-slack-client\
```

**Directory structure:**
```
%APPDATA%\personal-slack-client\
├── settings.json          # App preferences (non-sensitive)
├── channels.json          # Channel cache
├── users.json             # User cache
└── emoji.json             # Emoji cache
```

**Note:** The Slack token is NOT stored in these files - it's in Windows Credential Manager.

### Advanced Settings

Access advanced settings in the Settings dialog (`Ctrl+,`):

- **Keyboard Shortcuts** - Customize all shortcuts
- **Emoji Reactions** - Map number keys to your favorite emojis
- **Cache Settings** - Adjust cache duration (default: 6 hours)
- **Performance Settings** - API batching, message limits, optimization toggles
- **Download Settings** - Default download location
- **Realtime Mode** - Configure Live Mode update intervals
- **Experimental Features** - Early access to new features

## 🏗️ Architecture

```
personal-slack-client/
├── src-tauri/          # 🦀 Rust backend
│   ├── src/
│   │   ├── commands/   # Tauri IPC commands
│   │   ├── slack/      # Slack API client (not yet implemented)
│   │   └── main.rs     # Application entry point
│   └── Cargo.toml      # Rust dependencies
├── src/                # 🎨 Svelte frontend
│   ├── lib/
│   │   ├── api/        # Slack API layer
│   │   ├── components/ # UI components
│   │   │   └── files/  # File preview components
│   │   ├── services/   # Business logic
│   │   ├── stores/     # State management (Svelte stores)
│   │   ├── types/      # TypeScript type definitions
│   │   └── utils/      # Utility functions
│   ├── App.svelte      # Main application component
│   └── main.ts         # Frontend entry point
└── package.json        # Node.js dependencies
```

### Tech Stack

- **Backend**: Rust + Tauri 2.0 for native performance and security
- **Frontend**: Svelte 4 + TypeScript for reactive UI
- **API**: Slack Web API with intelligent batching and caching
- **File Processing**:
  - PDF.js for PDF rendering
  - Mammoth.js for Word document conversion
  - SheetJS for Excel file parsing
  - PapaParse for CSV/TSV parsing
- **Caching**: LRU cache + IndexedDB for offline access
- **Security**: Windows Credential Manager integration for token storage

## 🔥 Performance

Personal Slack Client is optimized for speed and efficiency:

- **400+ messages/second** processing capability
- **30 concurrent API requests** for parallel fetching
- **Smart caching** with automatic invalidation (default: 6 hours)
- **Debounced search** for responsive typing (300ms delay)
- **Lazy loading** for file previews and reactions
- **Optimized re-renders** with Svelte's fine-grained reactivity
- **API batching** to minimize rate limit issues

**Performance Monitoring:** Press `Ctrl+Shift+P` to view real-time API usage, cache hit rates, and response times.

## 🤝 Contributing

Contributions are welcome! However, this is currently a personal project in active development. Please open an issue to discuss major changes before submitting a pull request.

## 📄 License

This project is provided as-is for personal use. License details to be determined.

## ⚠️ Disclaimer

This is an unofficial Slack client. It uses your personal Slack user token to access your workspace. Use at your own risk. The authors are not responsible for any data loss, account suspension, or other issues that may arise from using this application.

**Security Best Practices:**
- Never share your Slack token with anyone
- Only install this application from trusted sources
- Review the OAuth scopes before granting access
- Revoke the token from [Slack API Apps](https://api.slack.com/apps) if you suspect compromise

## 🙏 Acknowledgments

Built with these amazing open source technologies:
- [Tauri](https://tauri.app/) - Desktop app framework
- [Svelte](https://svelte.dev/) - Reactive UI framework
- [Slack API](https://api.slack.com/) - Slack Web API
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) - Word document conversion
- [SheetJS](https://sheetjs.com/) - Excel file parsing
