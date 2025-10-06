# Development Commands

## Running the Application
```bash
# Development mode with hot reload
npm run tauri:dev

# Build for production
npm run tauri:build

# Safe build with caching (Windows PowerShell)
npm run tauri:build-safe

# Frontend only (Vite dev server)
npm run dev

# Preview built frontend
npm run preview
```

## Build Management (Windows)
```bash
# Clean build artifacts
npm run tauri:clean

# Backup build cache
npm run tauri:backup

# Restore build cache
npm run tauri:restore
```

## System Commands (Linux/WSL)
The project runs on WSL2 (Linux), so use standard Unix commands:
- `ls` - List files
- `cd` - Change directory
- `grep` - Search in files
- `find` - Find files
- `git` - Version control

## File Path Conversion
Windows paths must be converted to WSL mount paths:
- Windows: `C:\Users\user\file.txt`
- WSL: `/mnt/c/Users/user/file.txt`
