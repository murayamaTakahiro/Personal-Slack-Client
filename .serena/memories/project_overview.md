# Personal Slack Client - Project Overview

## Purpose
A supercharged Slack desktop client built with Tauri that removes the 10-message search limitation and adds powerful features for power users. Key features:
- Unlimited search across all messages
- DM and Group DM support
- Multi-workspace support
- Blazing fast performance with Rust backend
- File preview capabilities (images, PDFs, text, CSV, Office files)

## Tech Stack
- **Backend**: Rust + Tauri 2.0
- **Frontend**: Svelte 4 + TypeScript
- **API**: Slack Web API with batched requests
- **Build Tool**: Vite
- **File Processing**: pdfjs-dist (PDF), papaparse (CSV)
- **Caching**: LRU cache + IndexedDB

## Project Structure
```
personal-slack-client/
├── src-tauri/          # Rust backend
│   ├── src/commands/   # Tauri IPC commands
│   ├── src/slack/      # Slack API client
│   └── src/state.rs    # Application state
├── src/                # Svelte frontend
│   ├── lib/
│   │   ├── api/        # API layer for Slack communication
│   │   ├── components/ # UI components (including files/ for preview)
│   │   ├── services/   # Business logic services
│   │   ├── stores/     # State management
│   │   ├── types/      # TypeScript types
│   │   └── utils/      # Utility functions
│   ├── App.svelte      # Main application component
│   └── main.ts         # Entry point
└── package.json
```

## Key Components for File Preview
- `src/lib/components/files/` - File preview components
  - `FileAttachments.svelte` - Main container
  - `ImagePreview.svelte` - Image preview
  - `PdfPreview.svelte` - PDF preview
  - `TextPreview.svelte` - Text file preview
  - `CsvPreview.svelte` - CSV/TSV preview
  - `OfficePreview.svelte` - Office file preview (in progress)
  - `GenericFilePreview.svelte` - Fallback for unsupported files
  - `Lightbox.svelte` - Full-screen preview
- `src/lib/services/fileService.ts` - File type detection
- `src/lib/api/files.ts` - File API layer
