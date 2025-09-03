# Changelog

All notable changes to Personal Slack Client will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Complete Features Guide documentation
- Comprehensive keyboard shortcuts reference
- Detailed emoji configuration guide
- Zoom controls documentation
- Realtime mode settings documentation
- Workspace management guide

## [1.3.0] - 2025-01-XX

### Added
- **Emoji System Enhancements**
  - Advanced emoji search with fuzzy matching
  - Visual emoji picker with Tab navigation
  - Auto-fix function for missing emojis
  - Japanese custom emoji support
  - Focus trap in emoji picker (Escape to close)
  - Section navigation with Tab/Shift+Tab

### Fixed
- Tab key navigation in emoji settings
- Escape key handling in emoji picker
- Unicode emoji display (removed unnecessary colons)
- Quick reaction emoji visibility

## [1.2.0] - 2025-01-XX

### Added
- **Zoom Controls**
  - Adjustable interface scaling (50%-200%)
  - Keyboard shortcuts: Ctrl+=/-, Ctrl+0 to reset
  - Persistent zoom settings
  - Font-based scaling for better text rendering

- **Multi-Workspace Support**
  - Switch between multiple Slack workspaces
  - Color-coded workspace identification
  - Secure token storage per workspace
  - Last-used workspace tracking

- **Realtime Mode**
  - Monitor multiple channels simultaneously
  - Configurable update intervals (15s to 5m)
  - Auto-scroll to new messages
  - Desktop notifications for new messages

## [1.1.0] - 2024-XX-XX

### Added
- **Customizable Keyboard Shortcuts**
  - Full keyboard navigation support
  - Customizable key bindings
  - Visual keyboard help overlay (?)
  - VI-style navigation (j/k, h/e)

- **Quick Reaction System**
  - Number keys (1-9) for instant reactions
  - Customizable emoji mappings
  - Support for custom workspace emojis
  - Reaction picker with search

### Fixed
- Message threading improvements
- Search performance optimization
- Memory leak in long-running sessions

## [1.0.0] - 2024-XX-XX

### Initial Release
- **Core Features**
  - Enhanced search without 10-item limit
  - Advanced filters (channel, user, date)
  - Complete thread viewer
  - URL parsing for direct thread access
  - Secure token storage
  - Fast Rust backend

### Security
- Tokens stored securely using Tauri's encrypted storage
- Tokens never exposed in UI or logs
- Masked token display in settings

## Development Guidelines

### Version Numbering
- MAJOR version: Incompatible API changes
- MINOR version: New functionality (backwards compatible)
- PATCH version: Bug fixes (backwards compatible)

### Categories
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Vulnerability fixes

---

For detailed feature documentation, see [FEATURES_GUIDE.md](./FEATURES_GUIDE.md)