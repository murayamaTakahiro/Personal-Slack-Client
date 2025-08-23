# Development Commands

## Core Development Commands

### Running the Application
- **Development mode**: `npm run tauri:dev`
  - Starts both Vite dev server and Tauri in development mode
  - Hot reload enabled for frontend changes
  - Rust backend recompiles on changes

### Building for Production
- **Build application**: `npm run tauri:build`
  - Creates optimized production build
  - Generates platform-specific installer

### Frontend-only Development
- **Run Vite dev server**: `npm run dev`
- **Build frontend**: `npm run build`
- **Preview production build**: `npm run preview`

## Rust Development Commands

### Dependency Management
- **Install dependencies**: `cd src-tauri && cargo build`
- **Update dependencies**: `cd src-tauri && cargo update`
- **Check outdated**: `cd src-tauri && cargo outdated`

### Code Quality Tools
- **Format code**: `cd src-tauri && cargo fmt`
- **Run linter**: `cd src-tauri && cargo clippy`
- **Check compilation**: `cd src-tauri && cargo check`

### Testing (when implemented)
- **Run tests**: `cd src-tauri && cargo test`
- **Run specific test**: `cd src-tauri && cargo test test_name`

## Frontend Development Commands

### Installation
- **Install dependencies**: `npm install`
- **Clean install**: `rm -rf node_modules package-lock.json && npm install`

### TypeScript
- **Type checking**: `npx tsc --noEmit`
- **Svelte check**: `npx svelte-check`

## System Utilities (Linux/WSL)

### Git Commands
- **Status**: `git status`
- **Add files**: `git add .`
- **Commit**: `git commit -m "message"`
- **Push**: `git push`
- **Pull**: `git pull`
- **Branch**: `git branch -a`
- **Checkout**: `git checkout branch-name`

### File Operations
- **List files**: `ls -la`
- **Change directory**: `cd path`
- **Create directory**: `mkdir name`
- **Remove file**: `rm file`
- **Copy**: `cp source dest`
- **Move**: `mv source dest`

### Process Management
- **List processes**: `ps aux`
- **Kill process**: `kill -9 PID`
- **Find port usage**: `lsof -i :PORT`

### Search and Find
- **Find files**: `find . -name "*.rs"`
- **Search in files**: `grep -r "pattern" .`
- **Ripgrep (faster)**: `rg "pattern"`

## Tauri-specific Commands

### Tauri CLI
- **Info**: `npm run tauri info`
- **Dev with specific target**: `npm run tauri dev -- --target x86_64-pc-windows-msvc`
- **Build for specific platform**: `npm run tauri build -- --target x86_64-pc-windows-msvc`

## Environment Setup

### Initial Setup
1. Clone repository: `git clone [repo-url]`
2. Install Node dependencies: `npm install`
3. Build Rust dependencies: `cd src-tauri && cargo build`
4. Run development: `npm run tauri:dev`

### Slack Token Setup
1. Get token from https://api.slack.com/authentication/token-types#user
2. Token should start with `xoxp-`
3. Required scopes: search:read, channels:read, users:read, channels:history