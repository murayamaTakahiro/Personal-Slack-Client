# Keyboard Navigation Architecture

## Current Implementation

### KeyboardService
- Centralized service for managing keyboard shortcuts
- Singleton pattern with registration/unregistration of handlers
- Supports modifier keys (Ctrl, Alt, Shift, Meta)
- Cross-platform compatibility (Mac vs PC)
- Handles event prevention and propagation

### Existing Shortcuts
- **Navigation**: Arrow keys for up/down navigation
- **Focus**: Ctrl+1 (results), Ctrl+2 (thread)
- **Search**: Ctrl+K (focus search), Enter (execute)
- **Actions**: p (post), t (thread reply), r (reactions)
- **Numbers**: 1-9 for reaction shortcuts

### Components Navigation
1. **ResultList.svelte**:
   - Arrow keys for navigation with wrap-around
   - Focus management with `focusedIndex`
   - Smooth scrolling to selected items
   - Keyboard handlers registered via KeyboardService

2. **ThreadView.svelte**:
   - Already has Home/End key support for jump navigation
   - Arrow keys for message navigation
   - Enter to open in Slack
   - Focus management with `selectedIndex`

### Current Jump Navigation
- **ThreadView**: Home/End keys already implemented (lines 127-141)
- **ResultList**: Only has arrow key navigation, no jump shortcuts

## Gap Analysis
The ThreadView already has proper jump-to-first/last functionality with Home/End keys, but the ResultList component lacks this feature. We need to add consistent jump navigation to ResultList.