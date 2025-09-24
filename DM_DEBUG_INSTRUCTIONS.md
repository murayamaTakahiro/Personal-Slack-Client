# DM User Display Name Debug Instructions

## Problem Summary
- User ID `U04F9M6JX2M` should display as `@murayama` in DM channels
- Currently showing as `@yandt89` instead
- This affects the DM channel list display

## Debug Code Added

### 1. Enhanced Logging in `src-tauri/src/commands/search.rs`
- Lines 700-723: Logs all users related to murayama/yandt89 when fetching users
- Lines 728-756: Detailed logging when building user map, especially for U04F9M6JX2M
- Lines 780-787: Logs when finding DM channel for specific user
- Lines 799-816: Logs the actual mapping process for the user

### 2. Debug Commands in `src-tauri/src/commands/debug.rs`
- `debug_user_info(user_id)`: Fetches and displays detailed info for any user
- `debug_dm_channels()`: Lists all DM channels and highlights the one for U04F9M6JX2M

### 3. Test Files Created
- `debug-dm-issue.html`: Interactive debug page for testing in the app
- `test-user-api.sh`: Direct Slack API test (requires SLACK_TOKEN env var)
- `find-dm-issue.sh`: Searches logs for relevant entries
- `debug-user-mapping.sh`: Analyzes user mapping in logs

## How to Debug

### Step 1: Build and Run
```bash
cd src-tauri
cargo build
cd ..
npm run tauri dev
```

### Step 2: Trigger the Debug Logging
1. Open the app
2. Click on "Channels" to expand channel list
3. Make sure "Include Direct Messages" is checked
4. The debug logs will be written when DM channels are fetched

### Step 3: Check the Logs
Look for these log patterns in the terminal:

```
[DEBUG] Relevant user found:
  id: U04F9M6JX2M
  name: yandt89         # <-- This might be the issue
  real_name: Some("murayama")
  profile.display_name: None or Some("...")

[DEBUG] User U04F9M6JX2M mapped to display_name: 'yandt89'

[DEBUG] DM channel D... mapped to user 'U04F9M6JX2M' -> '@yandt89'
```

### Step 4: Use Debug Commands in Console
Open Developer Tools (F12) and run:

```javascript
// Get detailed info for the problematic user
await __TAURI__.invoke('debug_user_info', { userId: 'U04F9M6JX2M' })

// List all DM channels
await __TAURI__.invoke('debug_dm_channels', {})

// Get all channels including DMs
await __TAURI__.invoke('get_user_channels', { includeDms: true })
```

## Expected vs Actual

### Expected Behavior
The user map should prioritize fields in this order:
1. `profile.display_name` (if not empty)
2. `profile.real_name` (if not empty)
3. `real_name` (top-level, if not empty)
4. `name` (username)
5. `id` (fallback)

### Likely Issue
The user `U04F9M6JX2M` probably has:
- `name`: "yandt89" (Slack username)
- `real_name`: "murayama" or empty
- `profile.display_name`: empty or not set
- `profile.real_name`: possibly "murayama"

The code might not be correctly checking the `real_name` fields, or they might be empty/null in the API response.

## Solution Approaches

### Option 1: Fix Field Priority
Ensure we check both `real_name` (top-level) and `profile.real_name` properly.

### Option 2: Add User Preference
Allow users to set display name preferences for DMs.

### Option 3: Use Full Name First
Prioritize real_name fields over username for DMs.

## Next Steps

1. Run the app with debug logging
2. Check what values are actually coming from the Slack API
3. Verify the mapping logic is working correctly
4. Apply the fix based on the actual data

## Testing the Fix

After identifying and fixing the issue:
1. Clear any cached user data
2. Restart the app
3. Check if `@murayama` appears correctly in the DM list
4. Verify searching in that DM channel works correctly