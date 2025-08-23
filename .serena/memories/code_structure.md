# Code Structure and Organization

## Project Layout

```
slack-search-enhancer/
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── slack/      # Slack API integration
│   │   │   ├── client.rs      # API client implementation
│   │   │   ├── models.rs      # Data models and types
│   │   │   └── parser.rs      # URL parser
│   │   ├── commands/   # Tauri commands (IPC handlers)
│   │   │   ├── auth.rs        # Authentication commands
│   │   │   ├── channels.rs    # Channel management
│   │   │   ├── search.rs      # Search functionality
│   │   │   └── thread.rs      # Thread operations
│   │   ├── state.rs    # Application state management
│   │   ├── error.rs    # Error handling types
│   │   └── lib.rs      # Main library entry point
│   ├── Cargo.toml      # Rust dependencies
│   └── tauri.conf.json # Tauri configuration
├── src/                # Svelte frontend
│   ├── lib/
│   │   ├── components/ # UI components
│   │   │   ├── ChannelSelector.svelte
│   │   │   ├── KeyboardHelp.svelte
│   │   │   ├── KeyboardSettings.svelte
│   │   │   ├── MessageItem.svelte
│   │   │   ├── ResultList.svelte
│   │   │   ├── SearchBar.svelte
│   │   │   ├── ThreadView.svelte
│   │   │   ├── UserSelector.svelte
│   │   │   └── WorkspaceSwitcher.svelte
│   │   ├── stores/     # State management
│   │   │   ├── channels.ts
│   │   │   ├── search.ts
│   │   │   ├── secureSettings.ts
│   │   │   ├── settings.ts
│   │   │   └── workspaces.ts
│   │   ├── api/        # API layer
│   │   │   ├── secure.ts      # Secure API calls
│   │   │   └── slack.ts       # Slack API interface
│   │   ├── services/   # Business logic
│   │   │   ├── keyboardService.ts
│   │   │   └── userService.ts
│   │   └── types/      # TypeScript types
│   │       ├── slack.ts       # Slack data types
│   │       └── workspace.ts   # Workspace types
│   ├── App.svelte      # Main application component
│   ├── main.ts         # Application entry point
│   └── styles.css      # Global styles
├── package.json        # Node dependencies
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
└── svelte.config.js    # Svelte configuration
```

## Module Organization

### Backend (Rust)
- **slack module**: Contains all Slack API integration logic
- **commands module**: Tauri command handlers for IPC
- **state module**: Application state management
- **error module**: Custom error types and handling

### Frontend (TypeScript/Svelte)
- **components**: Reusable UI components
- **stores**: Svelte stores for reactive state management
- **api**: API abstraction layer for backend communication
- **services**: Business logic and utilities
- **types**: TypeScript type definitions