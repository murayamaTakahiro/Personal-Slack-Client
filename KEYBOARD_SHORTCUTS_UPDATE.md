# Keyboard Shortcuts Update

## Ctrl+N Enhancement (2025-08-13)

### Previous Behavior
- **Ctrl+N** would only clear the search query and focus the search bar

### New Behavior  
- **Ctrl+N** now performs a full workspace refresh, similar to switching workspaces:
  - Clears all current search state (query, selected channels, users, dates)
  - Clears and reloads the channel list from Slack
  - Clears the user cache
  - Re-initializes the backend connection
  - Resets the search bar filters
  - Focuses the search input for a fresh start

### Benefits
- Ensures you're working with the latest channel and user data
- Clears any stale state that might affect search results
- Provides a true "fresh start" experience
- Consistent with the behavior when switching workspaces

### Technical Details
The implementation mirrors the `handleWorkspaceSwitched` function, performing:
1. State cleanup (search results, parameters, errors)
2. Cache clearing (channels, users)
3. Backend re-initialization
4. Channel list reload
5. UI refresh

This ensures data consistency and provides a clean slate for new searches.

## Focus Navigation Improvements (2025-08-13)

### Issue Fixed
Navigation shortcuts (Ctrl+1, Ctrl+2, Ctrl+K, Ctrl+U, Ctrl+L) were not working when focus was in input fields like the search bar.

### Solution
Updated all focus-related keyboard handlers to work from anywhere in the application by setting `allowInInput: true` for the following shortcuts:

- **Ctrl+K** - Focus search bar (works from anywhere)
- **Ctrl+1** - Focus results list (works from anywhere)
- **Ctrl+2** - Focus thread view (works from anywhere)
- **Ctrl+U** - Focus URL input (works from anywhere)
- **Ctrl+L** - Toggle channel selector (works from anywhere)
- **Ctrl+N** - New search/refresh (works from anywhere)

### Benefits
- Seamless navigation between different UI components
- No need to manually click outside input fields to use shortcuts
- Better keyboard-only navigation experience
- Consistent behavior regardless of current focus location

## Results List Navigation Fix (2025-08-13)

### Issue Fixed
After pressing Ctrl+1 to focus the results list, arrow keys were not working to navigate through messages.

### Solution
Enhanced the ResultList component with proper keyboard navigation:

1. **Added tabindex and focus handling** - The results list container now properly receives focus
2. **Direct keyboard event handler** - Added `handleKeyDown` function to handle arrow keys directly when list has focus
3. **Visual focus indicator** - Added blue border when results list has focus
4. **Improved navigation logic** - Arrow keys now work immediately after focusing the list

### How it Works
- **Ctrl+1** - Focuses the results list and selects the first message
- **Arrow Down/Up** - Navigate through messages (with wrap-around)
- **Enter** - Select/open the focused message
- **Visual feedback** - Blue border shows when list has focus, highlighted message shows current selection

### Technical Details
- Modified `focusList()` to actually focus the DOM element
- Added `on:keydown` handler to the messages container
- Set `tabindex="0"` to make the container focusable
- Added CSS for focus state visibility