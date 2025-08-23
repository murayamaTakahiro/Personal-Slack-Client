# Code Conventions and Style Guide

## Rust Conventions

### General Style
- **Edition**: Rust 2021
- **Formatting**: Use `rustfmt` for automatic formatting
- **Linting**: Use `clippy` for additional linting
- **Module Organization**: Separate modules by functionality (slack, commands, state, error)

### Naming Conventions
- **Functions**: snake_case (e.g., `search_messages`, `fetch_all_results`)
- **Structs/Enums**: PascalCase (e.g., `SlackClient`, `SearchResult`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `SLACK_API_BASE`, `RATE_LIMIT_DELAY_MS`)
- **Module files**: snake_case (e.g., `client.rs`, `models.rs`)

### Error Handling
- Use `anyhow` for general error handling
- Use `thiserror` for custom error types
- Define custom `AppResult<T>` type alias for consistency
- Use `tracing` for logging (info, debug, error, warn levels)

### Async/Await
- Use `tokio` runtime for async operations
- Use `#[tauri::command]` for async command handlers
- Prefer `async/await` over raw futures

### Documentation
- Module-level documentation at file top
- Function documentation for public APIs
- Inline comments for complex logic

## TypeScript/Svelte Conventions

### General Style
- **Language**: TypeScript with strict mode
- **Framework**: Svelte 4.x with TypeScript preprocessing
- **Module System**: ES6 modules

### File Naming
- **Components**: PascalCase with .svelte extension (e.g., `SearchBar.svelte`)
- **TypeScript files**: camelCase with .ts extension (e.g., `keyboardService.ts`)
- **Type definition files**: camelCase (e.g., `slack.ts`)

### TypeScript Conventions
- **Interfaces/Types**: PascalCase (e.g., `SlackMessage`, `SearchOptions`)
- **Functions**: camelCase (e.g., `searchMessages`, `loadThread`)
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE or PascalCase for exported constants

### Svelte Components
- Use TypeScript in script tags: `<script lang="ts">`
- Props defined with TypeScript types
- Reactive statements with `$:` syntax
- Store subscriptions with `$` prefix

### State Management
- Use Svelte stores for global state
- Writable stores for mutable state
- Derived stores for computed values
- Custom store implementations when needed

## Project-wide Conventions

### API Communication
- All Slack API calls go through Rust backend
- Frontend communicates via Tauri commands
- Type-safe command invocation using TypeScript

### Security
- Never expose tokens in frontend code
- Use secure storage for sensitive data
- Validate all inputs from frontend

### Testing
- No test framework currently configured
- Consider adding tests for critical functionality

### Version Control
- Git for version control
- .gitignore configured for Node and Rust artifacts
- Commit messages should be descriptive