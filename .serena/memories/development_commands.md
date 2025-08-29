# Development Commands

## Build & Run
- `npm run tauri:dev` - Development server
- `npm run tauri:build` - Production build
- `npm run dev` - Frontend only development
- `npm run build` - Frontend build
- `npm run preview` - Preview built frontend

## Dependencies
- `npm install` - Install frontend dependencies
- `cd src-tauri && cargo build` - Build Rust backend

## Project Structure
- Frontend: Svelte + TypeScript in `src/`
- Backend: Rust + Tauri in `src-tauri/`
- No specific linting/formatting commands found in package.json
- Uses standard Node.js + Cargo dependency management

## Testing
- No specific test commands found in package.json
- Likely uses standard Rust `cargo test` for backend testing

## Key Files for Current Work
- `src/lib/services/keyboardService.ts` - Keyboard event handling
- `src/lib/components/ThreadView.svelte` - Thread display and navigation
- `src/lib/services/urlService.ts` - URL extraction and opening
- `src/lib/api/slack.ts` - Slack API calls