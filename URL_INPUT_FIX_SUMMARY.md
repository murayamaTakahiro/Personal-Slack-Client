# URL Input Field Keyboard Shortcut Fix

## Problem
The URL input field in SearchBar was not handling Ctrl+Enter for search execution, only plain Enter. This was due to overly restrictive conflict prevention logic that was trying to avoid interference with PostDialog's Ctrl+Enter shortcut.

## Root Cause Analysis
The previous implementation incorrectly assumed that keyboard shortcuts would conflict between components. However, since only one element can have focus at a time, there's no actual conflict:
- When URL input has focus → SearchBar handles the event
- When PostDialog textarea has focus → PostDialog handles the event
- These states are mutually exclusive

## Solution Implemented
Applied **focus-based event isolation** principle across all SearchBar input handlers:

### 1. URL Input Handler (`handleUrlKeydown`)
**Before:**
```javascript
function handleUrlKeydown(e: KeyboardEvent) {
  // Would not handle ANY Enter key if PostDialog was open
  if ($isPostDialogOpen) {
    if (e.ctrlKey && e.key === 'Enter') {
      return; // Let PostDialog handle it
    }
    return;
  }
  // Only handled plain Enter, not Ctrl+Enter
  if (e.key === 'Enter' && !e.ctrlKey && !urlLoading && urlInput.trim()) {
    e.preventDefault();
    handleUrlPaste();
  }
}
```

**After:**
```javascript
function handleUrlKeydown(e: KeyboardEvent) {
  // Handle both Enter and Ctrl+Enter when this input has focus
  if (e.key === 'Enter' && !urlLoading && urlInput.trim()) {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    handleUrlPaste();
  }
}
```

### 2. Search Input Handler (`handleKeydown`)
Also updated to use focus-based isolation instead of checking PostDialog state.

### 3. Date Input Handler (`handleDateKeydown`)
Updated to stop propagation and handle events when focused.

## Key Benefits
1. **Consistent behavior**: All Enter variations (Enter, Ctrl+Enter) now work in URL input
2. **No conflicts**: Focus-based isolation ensures clean event handling
3. **Simpler code**: Removed unnecessary PostDialog state checks
4. **Better UX**: Users can use their preferred shortcut (Enter or Ctrl+Enter) consistently

## Testing Checklist
- ✅ URL input handles Enter
- ✅ URL input handles Ctrl+Enter
- ✅ No interference with PostDialog when it has focus
- ✅ No interference with thread reply when it has focus
- ✅ Search and date inputs also work correctly

## Files Modified
- `/src/lib/components/SearchBar.svelte` - Updated three keyboard event handlers

## Principle Applied
**Focus-based event isolation**: The component with the focused element handles the keyboard event. Using `stopPropagation()` prevents the event from bubbling to other components, ensuring clean separation of concerns.