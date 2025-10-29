# Known Issues

## Inline Code Display Issue (Message List)

### Issue Overview
Inline code enclosed in backticks (`` ` ``) is not displayed correctly in the message list.

**Example:**
- Expected display: `` `inline code` `` → Pink inline code display
- Actual display: `inline code` → Displayed as regular text (backticks are removed)

### Scope of Impact
- **Message List**: ❌ Inline code not displayed correctly
- **Thread Display**: ✅ Displayed correctly

### Cause
This is a limitation due to the Slack API specification:

1. **search.messages API** (used for message list)
   - Returns preprocessed text optimized for search
   - Markdown symbols such as backticks are removed
   - Example: `` `code` `` → `code`

2. **conversations.replies API** (used for thread display)
   - Returns raw text as-is
   - Markdown symbols are preserved
   - Example: `` `code` `` → `` `code` ``

### Technical Details
```
# Message list API response
text: "inline display"  # Backticks have been removed

# Thread display API response
text: "`inline display`"  # Backticks are preserved
```

### Consideration of Solutions
Complete resolution requires one of the following backend modifications:

1. Use conversations.history API instead of search.messages API
2. Fetch raw data for each message individually after search
3. Restore original format information from the `blocks` field in Slack API

However, these changes have:
- Significant performance impact
- Potentially increased API call count
- High implementation complexity

### Current Response
We currently accept this limitation. If you need accurate markdown display, please check in the thread display.

---

## Read Status Limitation (Thread Messages)

### Issue Overview
With the implemented read status feature (Shift+R keyboard shortcut), messages displayed as threads in Slack cannot be marked as read.

### Scope of Impact
- **Channel Messages (Parent Messages)**: ✅ Can be marked as read
- **Thread Messages (Replies)**: ❌ Cannot be marked as read
- **DMs (Direct Messages)**: ✅ Can be marked as read

### Cause
This is a limitation due to the Slack API specification:

**API Used**: `conversations.mark`
- Supports marking messages as read on a per-channel basis
- Does not manage read status for individual messages within threads
- Does not support marking thread messages as read using the `thread_ts` parameter

### Technical Details
```typescript
// Current implementation
await invoke<void>('mark_as_read', {
  channel: message.channel,
  ts: message.ts  // For thread messages, this ts cannot mark as read
});
```

### Workaround
To mark messages within a thread as read, you need to open the corresponding thread in the official Slack app.

### Future Response
The current Slack API specification does not provide individual read marking for thread messages. We will consider support if the Slack API specification changes.

---

## "New" Badge Display Issue

### Issue Overview
When retrieving messages not in the cache, a "New" badge should be displayed, but sometimes it is not. Conversely, the badge may incorrectly appear on messages that should already be cached.

### Scope of Impact
- **Uncached Messages**: ⚠️ "New" badge may not be displayed
- **Cached Messages**: ⚠️ "New" badge may be displayed incorrectly

### Cause
There may be an issue with synchronization between cache state and badge display logic.

### Current Response
We are reviewing the cache management and badge display implementation.

---
*Last updated: October 29, 2025*
