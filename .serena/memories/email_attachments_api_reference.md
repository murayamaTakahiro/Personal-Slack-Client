# Email Attachments Feature - API Reference

## Table of Contents
1. [Type Definitions](#type-definitions)
2. [Utility Functions](#utility-functions)
3. [Component API](#component-api)
4. [Usage Examples](#usage-examples)

---

## Type Definitions

### EmailAddress

Represents an email address with display name.

```typescript
interface EmailAddress {
  /** Email address (e.g., "user@example.com") */
  address: string;
  
  /** Display name (e.g., "John Doe") */
  name: string;
  
  /** Original format (e.g., "John Doe <user@example.com>") */
  original: string;
}
```

**Source:** `src/lib/types/slack.ts`

**Example Data:**
```json
{
  "address": "john.doe@example.com",
  "name": "John Doe",
  "original": "John Doe <john.doe@example.com>"
}
```

---

### EmailAttachment

Represents a file attached to an email message.

```typescript
interface EmailAttachment {
  /** File name as it appears in the email */
  filename: string;
  
  /** File size in bytes */
  size: number;
  
  /** MIME type (e.g., "application/pdf", "image/png") */
  mimetype: string;
  
  /** Authenticated download URL from Slack */
  url: string;
  
  /** Additional metadata (usually null) */
  metadata: any | null;
}
```

**Source:** `src/lib/types/slack.ts`

**Example Data:**
```json
{
  "filename": "document.pdf",
  "size": 497976,
  "mimetype": "application/pdf",
  "url": "https://files-origin.slack.com/files-email-priv/...",
  "metadata": null
}
```

---

### SlackFile (Extended)

Extended interface with email-specific optional fields.

```typescript
interface SlackFile {
  // ... existing fields ...
  
  /** Email subject line */
  subject?: string;
  
  /** List of senders (usually one) */
  from?: EmailAddress[];
  
  /** List of primary recipients */
  to?: EmailAddress[];
  
  /** List of CC recipients */
  cc?: EmailAddress[];
  
  /** List of BCC recipients (rarely provided) */
  bcc?: EmailAddress[];
  
  /** List of file attachments in the email */
  attachments?: EmailAttachment[];
  
  /** Total count of attachments */
  original_attachment_count?: number;
  
  /** Count of inline attachments (images in body) */
  inline_attachment_count?: number;
  
  /** Plain text version of email body */
  plain_text?: string;
}
```

**Source:** `src/lib/types/slack.ts`

**Notes:**
- All email fields are optional for backward compatibility
- Non-email files will not have these fields
- Old cached data remains valid

---

## Utility Functions

### formatEmailAddress()

Formats email addresses for display.

**Signature:**
```typescript
function formatEmailAddress(addresses?: EmailAddress[]): string
```

**Parameters:**
- `addresses` (EmailAddress[] | undefined): Array of email addresses to format

**Returns:**
- Comma-separated formatted string
- Empty string if no addresses provided

**Examples:**
```typescript
// Single address
formatEmailAddress([
  { name: "John Doe", address: "john@example.com", original: "..." }
]);
// Returns: "John Doe <john@example.com>"

// Multiple addresses
formatEmailAddress([
  { name: "John", address: "john@example.com", original: "..." },
  { name: "Jane", address: "jane@example.com", original: "..." }
]);
// Returns: "John <john@example.com>, Jane <jane@example.com>"

// Empty array
formatEmailAddress([]);
// Returns: ""

// Undefined
formatEmailAddress(undefined);
// Returns: ""
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

### getPrimarySender()

Gets the primary sender's display name.

**Signature:**
```typescript
function getPrimarySender(addresses?: EmailAddress[]): string
```

**Parameters:**
- `addresses` (EmailAddress[] | undefined): Array of sender addresses

**Returns:**
- Display name or email address of first sender
- "Unknown" if no addresses provided

**Examples:**
```typescript
getPrimarySender([
  { name: "John Doe", address: "john@example.com", original: "..." }
]);
// Returns: "John Doe"

getPrimarySender([
  { name: "", address: "john@example.com", original: "..." }
]);
// Returns: "john@example.com"

getPrimarySender([]);
// Returns: "Unknown"
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

### getShortSender()

Gets a short display name suitable for thumbnails.

**Signature:**
```typescript
function getShortSender(addresses?: EmailAddress[]): string
```

**Parameters:**
- `addresses` (EmailAddress[] | undefined): Array of sender addresses

**Returns:**
- Short display name
- Username portion of email if no name
- "Unknown" if no addresses

**Examples:**
```typescript
getShortSender([
  { name: "John Doe", address: "john@example.com", original: "..." }
]);
// Returns: "John Doe"

getShortSender([
  { name: "", address: "john.doe@example.com", original: "..." }
]);
// Returns: "john.doe"

getShortSender([]);
// Returns: "Unknown"
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

### getAttachmentCountText()

Formats attachment count for display.

**Signature:**
```typescript
function getAttachmentCountText(count?: number): string
```

**Parameters:**
- `count` (number | undefined): Number of attachments

**Returns:**
- Formatted text with singular/plural
- Empty string if count is 0 or undefined

**Examples:**
```typescript
getAttachmentCountText(0);
// Returns: ""

getAttachmentCountText(1);
// Returns: "1 attachment"

getAttachmentCountText(5);
// Returns: "5 attachments"

getAttachmentCountText(undefined);
// Returns: ""
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

### getAttachmentIcon()

Gets emoji icon for attachment based on MIME type.

**Signature:**
```typescript
function getAttachmentIcon(mimetype: string): string
```

**Parameters:**
- `mimetype` (string): MIME type of the attachment

**Returns:**
- Emoji representing the file type

**Icon Mapping:**
| MIME Type Pattern | Icon | Description |
|-------------------|------|-------------|
| `application/pdf` | 📄 | PDF document |
| `application/zip`, `*rar*`, `*7z*` | 📦 | Archive file |
| `image/*` | 🖼️ | Image file |
| `*word*`, `*document*` | 📝 | Word document |
| `*excel*`, `*spreadsheet*` | 📊 | Spreadsheet |
| `*powerpoint*`, `*presentation*` | 📽️ | Presentation |
| `video/*` | 🎬 | Video file |
| `audio/*` | 🎵 | Audio file |
| `text/*` | 📃 | Text file |
| Default | 📎 | Generic file |

**Examples:**
```typescript
getAttachmentIcon("application/pdf");
// Returns: "📄"

getAttachmentIcon("image/png");
// Returns: "🖼️"

getAttachmentIcon("application/zip");
// Returns: "📦"

getAttachmentIcon("application/octet-stream");
// Returns: "📎"
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

### truncateSubject()

Truncates email subject for thumbnail display.

**Signature:**
```typescript
function truncateSubject(subject: string, maxLength: number = 50): string
```

**Parameters:**
- `subject` (string): Full email subject
- `maxLength` (number, optional): Maximum length (default: 50)

**Returns:**
- Truncated subject with ellipsis if needed
- Original subject if shorter than maxLength

**Examples:**
```typescript
truncateSubject("Short subject");
// Returns: "Short subject"

truncateSubject("This is a very long email subject that needs truncating", 30);
// Returns: "This is a very long email s..."

truncateSubject("", 50);
// Returns: ""
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

### validateAttachment()

Validates attachment before download.

**Signature:**
```typescript
function validateAttachment(attachment: EmailAttachment): {
  valid: boolean;
  message?: string;
  warning?: string;
}
```

**Parameters:**
- `attachment` (EmailAttachment): Email attachment to validate

**Returns:**
Object with validation result:
- `valid` (boolean): Whether attachment can be downloaded
- `message` (string | undefined): Error message if invalid
- `warning` (string | undefined): Warning message for valid but risky files

**Validation Rules:**
1. **Size Limit:** Maximum 100MB
2. **Dangerous Extensions:** `.exe`, `.bat`, `.cmd`, `.scr`, `.js`, `.vbs`, `.ps1`
3. **Required Fields:** Must have valid URL

**Examples:**
```typescript
// Valid attachment
validateAttachment({
  filename: "document.pdf",
  size: 1024 * 1024, // 1MB
  mimetype: "application/pdf",
  url: "https://...",
  metadata: null
});
// Returns: { valid: true }

// Oversized attachment
validateAttachment({
  filename: "huge.zip",
  size: 200 * 1024 * 1024, // 200MB
  mimetype: "application/zip",
  url: "https://...",
  metadata: null
});
// Returns: { 
//   valid: false, 
//   message: "File exceeds 100MB limit (200.0MB)" 
// }

// Dangerous file
validateAttachment({
  filename: "malware.exe",
  size: 1024,
  mimetype: "application/x-msdownload",
  url: "https://...",
  metadata: null
});
// Returns: { 
//   valid: true, 
//   warning: "malware.exe may contain executable code. Download with caution." 
// }

// Invalid attachment
validateAttachment({
  filename: "",
  size: 0,
  mimetype: "",
  url: "",
  metadata: null
});
// Returns: { 
//   valid: false, 
//   message: "Invalid attachment data" 
// }
```

**Source:** `src/lib/utils/emailHelpers.ts`

---

## Component API

### EmailPreview Component

Enhanced email preview component with attachment support.

**Props:**
```typescript
interface EmailPreviewProps {
  /** Slack file object (email type) */
  file: SlackFile;
  
  /** Workspace ID for API calls */
  workspaceId: string;
  
  /** Compact thumbnail mode */
  compact?: boolean;
}
```

**New Reactive Variables:**
```typescript
$: primarySender = getShortSender(file.from);
$: emailSubject = file.subject || fileName;
$: attachmentInfo = getAttachmentCountText(file.original_attachment_count);
$: hasMetadata = !!(file.subject || file.from || file.to);
$: hasAttachments = !!(file.attachments && file.attachments.length > 0);
```

**New Methods:**
```typescript
/**
 * Download an email attachment
 * @param attachment - Attachment to download
 * @param index - Attachment index for unique ID
 */
async function downloadAttachment(
  attachment: EmailAttachment, 
  index: number
): Promise<void>
```

**Events:**
- No new events (uses existing click handlers)

**Slots:**
- No slots

**Source:** `src/lib/components/files/EmailPreview.svelte`

---

## Usage Examples

### Example 1: Display Email with Attachments

```svelte
<script lang="ts">
  import EmailPreview from '$lib/components/files/EmailPreview.svelte';
  import type { SlackFile } from '$lib/types/slack';
  
  const emailFile: SlackFile = {
    id: "F123456",
    name: "Re: Contract",
    filetype: "email",
    mimetype: "text/html",
    size: 586708,
    subject: "Re: Contract Discussion",
    from: [{
      name: "John Doe",
      address: "john@example.com",
      original: "John Doe <john@example.com>"
    }],
    to: [{
      name: "Jane Smith",
      address: "jane@example.com",
      original: "Jane Smith <jane@example.com>"
    }],
    attachments: [{
      filename: "contract.pdf",
      size: 497976,
      mimetype: "application/pdf",
      url: "https://files.slack.com/...",
      metadata: null
    }],
    original_attachment_count: 1,
    // ... other required SlackFile fields ...
  };
</script>

<EmailPreview 
  file={emailFile} 
  workspaceId="T024X8GPP"
  compact={false}
/>
```

**Result:**
- Full preview with email headers
- Attachments section with download button
- Email body rendered below

---

### Example 2: Thumbnail View

```svelte
<EmailPreview 
  file={emailFile} 
  workspaceId="T024X8GPP"
  compact={true}
/>
```

**Result:**
- Compact thumbnail showing:
  - Sender: "John Doe"
  - Subject: "Re: Contract Discussion"
  - Metadata: "📎 1 attachment · 573 KB"

---

### Example 3: Using Email Helpers Directly

```svelte
<script lang="ts">
  import {
    formatEmailAddress,
    getPrimarySender,
    getAttachmentIcon,
    validateAttachment
  } from '$lib/utils/emailHelpers';
  import type { SlackFile } from '$lib/types/slack';
  
  export let file: SlackFile;
  
  $: sender = getPrimarySender(file.from);
  $: recipients = formatEmailAddress(file.to);
  
  function handleDownload(attachment) {
    const validation = validateAttachment(attachment);
    
    if (!validation.valid) {
      alert(validation.message);
      return;
    }
    
    if (validation.warning) {
      console.warn(validation.warning);
    }
    
    // Proceed with download...
  }
</script>

<div class="email-header">
  <div>From: {sender}</div>
  <div>To: {recipients}</div>
</div>

{#if file.attachments}
  {#each file.attachments as attachment}
    <div class="attachment">
      <span>{getAttachmentIcon(attachment.mimetype)}</span>
      <span>{attachment.filename}</span>
      <button on:click={() => handleDownload(attachment)}>
        Download
      </button>
    </div>
  {/each}
{/if}
```

---

### Example 4: Handling Missing Data

```svelte
<script lang="ts">
  import { formatEmailAddress } from '$lib/utils/emailHelpers';
  import type { SlackFile } from '$lib/types/slack';
  
  export let file: SlackFile;
  
  // Safe access with fallbacks
  $: fromAddresses = file.from || [];
  $: toAddresses = file.to || [];
  $: ccAddresses = file.cc || [];
  $: attachments = file.attachments || [];
  
  $: hasFrom = fromAddresses.length > 0;
  $: hasTo = toAddresses.length > 0;
  $: hasCc = ccAddresses.length > 0;
  $: hasAttachments = attachments.length > 0;
</script>

{#if hasFrom}
  <div>From: {formatEmailAddress(fromAddresses)}</div>
{/if}

{#if hasTo}
  <div>To: {formatEmailAddress(toAddresses)}</div>
{/if}

{#if hasCc}
  <div>CC: {formatEmailAddress(ccAddresses)}</div>
{/if}

{#if hasAttachments}
  <div>Attachments: {attachments.length}</div>
{/if}
```

---

### Example 5: Custom Attachment Download Handler

```typescript
import { downloadFile } from '$lib/api/files';
import { validateAttachment } from '$lib/utils/emailHelpers';
import { showError, showSuccess, showInfo } from '$lib/stores/toast';
import type { EmailAttachment } from '$lib/types/slack';

async function customDownloadHandler(
  attachment: EmailAttachment,
  workspaceId: string,
  fileId: string,
  index: number
) {
  // Validate
  const validation = validateAttachment(attachment);
  if (!validation.valid) {
    showError('Download failed', validation.message || 'Invalid file', 5000);
    return;
  }
  
  // Warn if dangerous
  if (validation.warning) {
    showInfo('Security Warning', validation.warning, 8000);
  }
  
  // Start download
  showInfo('Downloading', `Starting download of ${attachment.filename}...`, 3000);
  
  try {
    const result = await downloadFile(
      workspaceId,
      `${fileId}_att_${index}`,
      attachment.url,
      attachment.filename
    );
    
    if (result.success) {
      showSuccess('Success', `Downloaded ${attachment.filename}`, 3000);
    } else {
      showError('Failed', `Could not download ${attachment.filename}`, 5000);
    }
  } catch (error) {
    console.error('Download error:', error);
    showError('Error', 'Download failed', 5000);
  }
}
```

---

## API Compatibility

### Backward Compatibility

All new fields are optional, ensuring compatibility with:
- Old cached email data
- Non-email files
- Future Slack API changes

**Safe Access Pattern:**
```typescript
// ✅ Good - handles undefined gracefully
const sender = file.from?.[0]?.name || 'Unknown';

// ❌ Bad - will throw if undefined
const sender = file.from[0].name;
```

### Type Guards

**Check if file has email metadata:**
```typescript
function hasEmailMetadata(file: SlackFile): boolean {
  return !!(file.subject || file.from || file.to);
}
```

**Check if file has attachments:**
```typescript
function hasEmailAttachments(file: SlackFile): boolean {
  return !!(file.attachments && file.attachments.length > 0);
}
```

**Type-safe attachment access:**
```typescript
function getAttachments(file: SlackFile): EmailAttachment[] {
  return file.attachments || [];
}
```

---

## Error Handling

### Download Errors

```typescript
try {
  await downloadAttachment(attachment, index);
} catch (error) {
  if (error instanceof Error) {
    // Network error, auth error, etc.
    showError('Download failed', error.message, 5000);
  } else {
    // Unknown error
    showError('Download failed', 'An unexpected error occurred', 5000);
  }
}
```

### Validation Errors

```typescript
const validation = validateAttachment(attachment);

if (!validation.valid) {
  // Show error to user
  showError('Invalid file', validation.message || 'Cannot download', 5000);
  return;
}

if (validation.warning) {
  // Show warning but allow download
  showInfo('Warning', validation.warning, 8000);
}
```

### Missing Data Handling

```typescript
// Always use optional chaining and nullish coalescing
const subject = file.subject ?? 'No Subject';
const senderName = file.from?.[0]?.name ?? 'Unknown';
const attachmentCount = file.attachments?.length ?? 0;
```

---

## Performance Considerations

### Reactive Statements

Reactive statements are optimized to only recalculate when dependencies change:

```typescript
// ✅ Efficient - only recalculates when file.from changes
$: primarySender = getShortSender(file.from);

// ❌ Inefficient - recalculates on every update
$: {
  const sender = getShortSender(file.from);
  const subject = file.subject;
  // ...
}
```

### Conditional Rendering

Use `{#if}` blocks to avoid rendering unnecessary elements:

```typescript
// ✅ Good - only renders if attachments exist
{#if hasAttachments}
  <AttachmentsList />
{/if}

// ❌ Bad - always renders, even if hidden
<AttachmentsList hidden={!hasAttachments} />
```

### Large Attachment Lists

For emails with many attachments, the list is scrollable and height-limited:

```css
.attachments-list {
  max-height: 400px;
  overflow-y: auto;
}
```

---

## Constants and Configuration

### Size Limits

```typescript
const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024; // 100MB
```

### Dangerous File Extensions

```typescript
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.scr', 
  '.js', '.vbs', '.ps1'
];
```

### Subject Truncation

```typescript
const MAX_SUBJECT_LENGTH = 50; // characters
```

---

## Debugging

### Enable Debug Logging

```typescript
// Add to EmailPreview.svelte for debugging
$: if (hasMetadata || hasAttachments) {
  console.log('[EmailPreview] Enhanced data available:', {
    hasMetadata,
    hasAttachments,
    from: file.from?.length || 0,
    to: file.to?.length || 0,
    cc: file.cc?.length || 0,
    attachments: file.attachments?.length || 0,
    subject: file.subject?.substring(0, 50) + '...'
  });
}
```

### Inspect Slack API Response

```typescript
// Log raw file object from Slack API
console.log('[Debug] Raw email file:', JSON.stringify(file, null, 2));
```

---

## Migration Guide

### From Old EmailPreview

No migration needed - the component is backward compatible.

**Before (still works):**
```svelte
<EmailPreview file={oldEmailFile} workspaceId="..." />
```

**After (enhanced features automatically enabled):**
```svelte
<EmailPreview file={newEmailFile} workspaceId="..." />
```

### Type Updates

If you have custom types extending SlackFile:

```typescript
// Before
interface MyCustomFile extends SlackFile {
  customField: string;
}

// After - no changes needed
interface MyCustomFile extends SlackFile {
  customField: string; // Your fields
  // Email fields automatically included via SlackFile
}
```

---

## TypeScript Configuration

### tsconfig.json

Ensure strict mode is enabled for type safety:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Import Aliases

```typescript
// Use project aliases for cleaner imports
import type { SlackFile, EmailAddress, EmailAttachment } from '$lib/types/slack';
import { formatEmailAddress } from '$lib/utils/emailHelpers';
```
