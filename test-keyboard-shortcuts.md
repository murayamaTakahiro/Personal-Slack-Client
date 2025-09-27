# Keyboard Shortcut Test Plan

## Test Scenarios for URL Input Field Fix

### 1. URL Input Field (SearchBar.svelte)
- [x] **Enter key**: Should execute URL search when URL input has focus
- [x] **Ctrl+Enter**: Should execute URL search when URL input has focus
- [x] **Focus isolation**: Event handling based on which input has focus

### 2. Search Input Field (SearchBar.svelte)
- [x] **Enter key**: Should execute search when search input has focus
- [x] **Ctrl+Enter**: Should execute search when search input has focus
- [x] **Focus isolation**: No interference with PostDialog

### 3. Date Input Fields (SearchBar.svelte)
- [x] **Enter key**: Should execute search when date input has focus
- [x] **Focus isolation**: No interference with PostDialog

### 4. PostDialog (PostDialog.svelte)
- [ ] **Ctrl+Enter**: Should submit post when dialog textarea has focus
- [ ] **Event isolation**: PostDialog events don't interfere with SearchBar

### 5. Thread Reply
- [ ] **Ctrl+Enter**: Should submit reply when thread reply textarea has focus

## Implementation Summary

### Changes Made:
1. **URL Input (`handleUrlKeydown`)**:
   - Now handles both Enter and Ctrl+Enter when focused
   - Uses `stopPropagation()` for clean event isolation
   - Removed PostDialog open check (not needed with focus-based isolation)

2. **Search Input (`handleKeydown`)**:
   - Handles Enter and Ctrl+Enter when focused
   - Added `stopPropagation()` for event isolation
   - Removed PostDialog open check

3. **Date Inputs (`handleDateKeydown`)**:
   - Handles Enter when focused
   - Added `stopPropagation()` for event isolation
   - Removed PostDialog open check

### Key Principle:
**Focus-based event isolation**: Each input handles keyboard events when it has focus, with `stopPropagation()` preventing conflicts. Since only one element can have focus at a time, there's no possibility of conflicts between components.

## Testing Instructions:

1. **Test URL Input**:
   - Click in URL input field
   - Paste a Slack URL
   - Press Enter → Should load thread
   - Paste another URL
   - Press Ctrl+Enter → Should also load thread

2. **Test with PostDialog Open**:
   - Open PostDialog (press P)
   - Click on URL input field (shifts focus from dialog)
   - Paste a URL and press Enter → Should load thread
   - Return focus to PostDialog textarea
   - Press Ctrl+Enter → Should post message

3. **Test Search Input**:
   - Type search query
   - Press Enter → Should search
   - Type another query
   - Press Ctrl+Enter → Should also search

4. **Test No Interference**:
   - Open PostDialog
   - Type in dialog textarea
   - Press Ctrl+Enter → Should post (not trigger search)
   - Close dialog
   - Focus URL input
   - Press Ctrl+Enter with URL → Should load thread (not open dialog)