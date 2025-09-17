# Workspace-Specific User Favorites - Test Plan

## What Was Fixed
User favorites were previously global across all workspaces. Now they are workspace-specific, similar to how channels work.

## Changes Made

1. **Updated workspace types** (`src/lib/types/workspace.ts`)
   - Added `userFavorites`, `userFavoriteOrder`, and `recentUsers` to `WorkspaceData` interface
   - These fields store user favorites per workspace

2. **Modified userService** (`src/lib/services/userService.ts`)
   - Changed from subscribing to global settings to using workspace-specific data
   - Added workspace switch event listener to reload favorites
   - Clear user cache when switching workspaces
   - Save/load favorites to/from workspace data instead of global settings

3. **Updated UI components**
   - `UserSelector.svelte`: Listen for workspace switch events and reload favorites
   - `MentionAutocomplete.svelte`: Listen for workspace switch events and update favorites list

## How to Test

### Prerequisites
- Have at least 2 workspaces configured in the app
- Have different users available in each workspace

### Test Steps

1. **Initial Setup**
   - Start the app and log into Workspace A
   - Add 2-3 users to favorites in Workspace A (use the star icon in user selector)
   - Give them unique aliases to easily identify them

2. **Switch to Workspace B**
   - Use the workspace switcher to change to Workspace B
   - Verify that the user favorites list is empty (no favorites from Workspace A)
   - Add different users to favorites in Workspace B
   - Give them different aliases

3. **Switch Back to Workspace A**
   - Switch back to Workspace A
   - Verify that your original favorites from Workspace A are still there
   - The favorites from Workspace B should NOT appear

4. **Verify Persistence**
   - Restart the app
   - Check that each workspace still has its own set of favorites
   - Favorites should persist across app restarts

5. **Test User Selection Components**
   - In each workspace, open the user selector dropdown
   - Verify that only the workspace-specific favorites appear at the top
   - Test the mention autocomplete (@mentions) - should show workspace-specific favorites

### Expected Behavior

✅ Each workspace maintains its own independent list of user favorites
✅ Switching workspaces clears and reloads the appropriate favorites
✅ User favorites persist for each workspace across app restarts
✅ User cache is cleared when switching workspaces (preventing cross-workspace data leakage)
✅ UI components update immediately when switching workspaces

### Edge Cases to Test

1. **Empty Favorites**: Workspace with no favorites should show empty list
2. **Same User ID**: If the same user exists in multiple workspaces, their favorite status should be independent
3. **Rapid Switching**: Quickly switching between workspaces should not cause favorites to mix
4. **New Workspace**: Adding a new workspace should start with empty favorites

## Technical Details

The fix implements workspace-specific storage similar to how channels work:
- User favorites are stored in `workspaceData[workspaceId].userFavorites`
- When switching workspaces, a `workspace-switched` event is dispatched
- Components and services listen for this event to reload the appropriate data
- The user cache is cleared to prevent cross-workspace contamination