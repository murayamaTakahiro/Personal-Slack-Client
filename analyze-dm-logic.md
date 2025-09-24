# DM User Name Resolution Analysis

## The Problem
- User ID: `U04F9M6JX2M`
- Expected display name: `murayama`
- Actual display name showing: `yandt89`

## How DM Names Work in the Code

1. **DM Channel Structure** (`SlackConversation`):
   - `id`: Channel ID (e.g., "D12345")
   - `user`: User ID of the OTHER person in the DM (e.g., "U04F9M6JX2M")
   - `is_im`: true for DMs

2. **User Mapping Process**:
   a. Fetch all users via `client.get_all_users()`
   b. Build a HashMap: `user_id -> display_name`
   c. For each DM channel, look up `dm.user` in the HashMap

3. **Display Name Priority** (lines 722-740):
   1. `profile.display_name` (if not empty)
   2. `profile.real_name` (if not empty)
   3. `real_name` (top-level field, if not empty)
   4. `name` (username field)
   5. `id` (fallback)

## Possible Causes

### Theory 1: Wrong User ID in DM Channel
The DM channel might have a different user ID than expected in its `user` field.

### Theory 2: User Data Mismatch
The user `U04F9M6JX2M` might have:
- `name`: "yandt89"
- `real_name`: "murayama" (but empty or null)
- `profile.display_name`: empty or null

### Theory 3: Multiple Users Getting Confused
There might be another user with similar data causing confusion.

### Theory 4: Cache Issue
Old cached data might be interfering with the correct mapping.

## Debug Strategy

1. **Log the actual user data** for `U04F9M6JX2M` when fetched
2. **Log the DM channel data** to see what user ID is in the `user` field
3. **Log the final mapping** to see what gets stored in the HashMap
4. **Check for any user with name "yandt89"** to see if there's confusion

## Fix Approaches

### Approach 1: Verify Field Priority
Make sure we're checking all the right fields in the right order.

### Approach 2: Add More Defensive Checks
Ensure we're not accidentally using the wrong user's data.

### Approach 3: Clear Cache
Add a way to clear user cache and re-fetch fresh data.