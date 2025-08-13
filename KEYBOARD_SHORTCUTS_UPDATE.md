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