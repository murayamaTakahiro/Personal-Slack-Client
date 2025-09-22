# DM Channel Search Fix

## Problem
DM channels were showing correctly in the channel selector but search was failing because:
1. The search query was using the display name (e.g., `in:@murayama`) instead of the channel ID (e.g., `in:D096JP29HQH`)
2. The Slack API requires channel IDs for DM channels, not display names

## Solution Implemented

### 1. Backend Changes (`src-tauri/src/slack/client.rs`)
- Modified `build_search_query` function to detect and handle DM channel IDs properly
- Added logic to identify DM channels by checking if they start with "D" and have the right length
- Added warning for cases where display names are passed instead of IDs

### 2. Frontend Changes (`src/lib/components/ChannelSelector.svelte`)
- Updated `selectChannel` function to accept both `channelId` and `channelName` parameters
- For DM channels (names starting with '@'), the channel ID is used for the value
- Regular channels continue to use the channel name
- Display names are shown correctly in the UI (with @ for DMs, # for regular channels)

### 3. Data Flow
1. Backend returns channels as `(id, name)` tuples
2. Channel store maps these to objects with both `id` and `name` fields
3. ChannelSelector uses:
   - `channel.id` for DM channels when setting the value
   - `channel.name` for display purposes
   - Correct prefixes (@ for DMs, # for channels) in the UI

## Testing Required
1. Select a DM channel from the dropdown
2. Perform a search with the DM channel selected
3. Check the logs to verify the search query uses the channel ID (e.g., `in:D096JP29HQH`)
4. Verify that search results are returned correctly

## Expected Behavior
- DM channels appear with @ prefix in the selector
- When selected, the channel ID (not the display name) is used for search
- Search queries should work correctly for both regular channels and DM channels