# Email Attachments Feature - Implementation Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Phase 1: Type Definitions](#phase-1-type-definitions)
3. [Phase 2: Utility Functions](#phase-2-utility-functions)
4. [Phase 3: Thumbnail Enhancement](#phase-3-thumbnail-enhancement)
5. [Phase 4: Full Preview Metadata](#phase-4-full-preview-metadata)
6. [Phase 5: Attachments Display](#phase-5-attachments-display)
7. [Phase 6: Attachment Download](#phase-6-attachment-download)
8. [Code Review Checklist](#code-review-checklist)

---

## Prerequisites

### Required Knowledge
- TypeScript/Svelte basics
- Understanding of SlackFile type structure
- Familiarity with existing EmailPreview component

### Required Tools
- VS Code or similar editor
- TypeScript language server
- Project dependencies installed

### Before You Start
1. Read the feature specification document
2. Review the current EmailPreview.svelte implementation
3. Ensure you have test email data from Slack API
4. Create a feature branch: `git checkout -b feature/email-attachments`

---

## Phase 1: Type Definitions

**Estimated Time:** 10 minutes  
**Files Modified:** `src/lib/types/slack.ts`

### Step 1.1: Add Email-Specific Interfaces

**Location:** After line 410 in `src/lib/types/slack.ts`

```typescript
/**
 * Email address with display name
 * Used in email files for from/to/cc/bcc fields
 */
export interface EmailAddress {
  /** Email address (e.g., "user@example.com") */
  address: string;
  /** Display name (e.g., "John Doe") */
  name: string;
  /** Original format (e.g., "John Doe <user@example.com>") */
  original: string;
}

/**
 * Email attachment metadata
 * Represents files attached to forwarded email messages
 */
export interface EmailAttachment {
  /** File name as it appears in the email */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME type (e.g., "application/pdf") */
  mimetype: string;
  /** Authenticated download URL from Slack */
  url: string;
  /** Additional metadata (usually null) */
  metadata: any | null;
}
```

### Step 1.2: Extend SlackFile Interface

**Location:** Inside existing `SlackFile` interface (after line 410)

```typescript
export interface SlackFile {
  // ... existing fields (lines 356-410) ...
  
  // Email-specific fields (optional for backward compatibility)
  
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

### Step 1.3: Verify Type Safety

```bash
# Run TypeScript compiler to check for errors
npm run check
```

**Expected Result:** No type errors

### Commit Point 1
```bash
git add src/lib/types/slack.ts
git commit -m "feat: Add email-specific types for attachments and metadata"
```

---

## Phase 2: Utility Functions

**Estimated Time:** 15 minutes  
**Files Created:** `src/lib/utils/emailHelpers.ts`

### Step 2.1: Create Email Helpers File

**Location:** `src/lib/utils/emailHelpers.ts` (new file)

```typescript
import type { EmailAddress, EmailAttachment } from '$lib/types/slack';

/**
 * Format a list of email addresses for display
 * 
 * @param addresses - Array of email addresses
 * @returns Comma-separated formatted string (e.g., "John <john@example.com>, Jane <jane@example.com>")
 * 
 * @example
 * ```typescript
 * const addresses = [
 *   { name: "John Doe", address: "john@example.com", original: "..." }
 * ];
 * formatEmailAddress(addresses);
 * // Returns: "John Doe <john@example.com>"
 * ```
 */
export function formatEmailAddress(addresses?: EmailAddress[]): string {
  if (!addresses || addresses.length === 0) {
    return '';
  }
  
  return addresses
    .map(addr => {
      // If name is different from address, show both
      if (addr.name && addr.name !== addr.address) {
        return `${addr.name} <${addr.address}>`;
      }
      // Otherwise just show the address
      return addr.address;
    })
    .join(', ');
}

/**
 * Get the primary sender's display name
 * 
 * @param addresses - Array of sender addresses
 * @returns Display name or email address of first sender, or "Unknown"
 * 
 * @example
 * ```typescript
 * getPrimarySender([{ name: "John", address: "john@example.com", original: "..." }]);
 * // Returns: "John"
 * ```
 */
export function getPrimarySender(addresses?: EmailAddress[]): string {
  if (!addresses || addresses.length === 0) {
    return 'Unknown';
  }
  
  const primary = addresses[0];
  
  // Prefer name over email address
  return primary.name || primary.address;
}

/**
 * Get short display for sender (first name or first part of email)
 * 
 * @param addresses - Array of sender addresses
 * @returns Short display name suitable for thumbnails
 * 
 * @example
 * ```typescript
 * getShortSender([{ name: "John Doe", address: "john@example.com", original: "..." }]);
 * // Returns: "John Doe"
 * ```
 */
export function getShortSender(addresses?: EmailAddress[]): string {
  if (!addresses || addresses.length === 0) {
    return 'Unknown';
  }
  
  const primary = addresses[0];
  
  // Use name if available
  if (primary.name) {
    return primary.name;
  }
  
  // Otherwise extract username from email
  return primary.address.split('@')[0];
}

/**
 * Format attachment count for display
 * 
 * @param count - Number of attachments
 * @returns Formatted text (e.g., "1 attachment", "3 attachments")
 * 
 * @example
 * ```typescript
 * getAttachmentCountText(1);  // Returns: "1 attachment"
 * getAttachmentCountText(5);  // Returns: "5 attachments"
 * getAttachmentCountText(0);  // Returns: ""
 * ```
 */
export function getAttachmentCountText(count?: number): string {
  if (!count || count === 0) {
    return '';
  }
  
  return count === 1 ? '1 attachment' : `${count} attachments`;
}

/**
 * Get icon emoji for attachment based on MIME type
 * 
 * @param mimetype - MIME type of the attachment
 * @returns Emoji representing the file type
 * 
 * @example
 * ```typescript
 * getAttachmentIcon("application/pdf");  // Returns: "📄"
 * getAttachmentIcon("image/png");        // Returns: "🖼️"
 * getAttachmentIcon("application/zip");  // Returns: "📦"
 * ```
 */
export function getAttachmentIcon(mimetype: string): string {
  const type = mimetype.toLowerCase();
  
  // Archive files
  if (type.includes('zip') || type.includes('rar') || type.includes('7z') || 
      type.includes('tar') || type.includes('gz')) {
    return '📦';
  }
  
  // PDF files
  if (type.includes('pdf')) {
    return '📄';
  }
  
  // Image files
  if (type.startsWith('image/')) {
    return '🖼️';
  }
  
  // Word documents
  if (type.includes('word') || type.includes('document') || 
      type.includes('msword') || type.includes('officedocument.wordprocessingml')) {
    return '📝';
  }
  
  // Excel spreadsheets
  if (type.includes('excel') || type.includes('spreadsheet') || 
      type.includes('ms-excel') || type.includes('officedocument.spreadsheetml')) {
    return '📊';
  }
  
  // PowerPoint presentations
  if (type.includes('powerpoint') || type.includes('presentation') || 
      type.includes('ms-powerpoint') || type.includes('officedocument.presentationml')) {
    return '📽️';
  }
  
  // Video files
  if (type.startsWith('video/')) {
    return '🎬';
  }
  
  // Audio files
  if (type.startsWith('audio/')) {
    return '🎵';
  }
  
  // Text files
  if (type.startsWith('text/')) {
    return '📃';
  }
  
  // Default
  return '📎';
}

/**
 * Truncate email subject for thumbnail display
 * 
 * @param subject - Full email subject
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated subject with ellipsis if needed
 * 
 * @example
 * ```typescript
 * truncateSubject("This is a very long email subject that needs truncating", 30);
 * // Returns: "This is a very long email s..."
 * ```
 */
export function truncateSubject(subject: string, maxLength: number = 50): string {
  if (!subject) {
    return '';
  }
  
  if (subject.length <= maxLength) {
    return subject;
  }
  
  return subject.substring(0, maxLength - 3) + '...';
}

/**
 * Validate attachment before download
 * 
 * @param attachment - Email attachment to validate
 * @returns Object with valid flag and optional warning message
 * 
 * @example
 * ```typescript
 * const result = validateAttachment(attachment);
 * if (!result.valid) {
 *   showError('Invalid attachment', result.message);
 * }
 * ```
 */
export function validateAttachment(attachment: EmailAttachment): { 
  valid: boolean; 
  message?: string;
  warning?: string;
} {
  // Check if attachment exists
  if (!attachment || !attachment.url) {
    return { 
      valid: false, 
      message: 'Invalid attachment data' 
    };
  }
  
  // Size limit: 100MB
  const MAX_SIZE = 100 * 1024 * 1024;
  if (attachment.size > MAX_SIZE) {
    return { 
      valid: false, 
      message: `File exceeds 100MB limit (${(attachment.size / 1024 / 1024).toFixed(1)}MB)` 
    };
  }
  
  // Warn about potentially dangerous file types
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.js', '.vbs', '.ps1'];
  const filename = attachment.filename.toLowerCase();
  const hasDangerousExt = dangerousExtensions.some(ext => filename.endsWith(ext));
  
  if (hasDangerousExt) {
    return {
      valid: true,
      warning: `${attachment.filename} may contain executable code. Download with caution.`
    };
  }
  
  return { valid: true };
}
```

### Step 2.2: Add Unit Tests (Optional but Recommended)

**Location:** `src/lib/utils/emailHelpers.test.ts` (new file)

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatEmailAddress,
  getPrimarySender,
  getShortSender,
  getAttachmentCountText,
  getAttachmentIcon,
  truncateSubject,
  validateAttachment
} from './emailHelpers';
import type { EmailAddress, EmailAttachment } from '$lib/types/slack';

describe('emailHelpers', () => {
  const mockAddress: EmailAddress = {
    name: 'John Doe',
    address: 'john@example.com',
    original: 'John Doe <john@example.com>'
  };
  
  describe('formatEmailAddress', () => {
    it('formats single address with name', () => {
      expect(formatEmailAddress([mockAddress]))
        .toBe('John Doe <john@example.com>');
    });
    
    it('formats multiple addresses', () => {
      const addresses = [
        mockAddress,
        { name: 'Jane', address: 'jane@example.com', original: '...' }
      ];
      expect(formatEmailAddress(addresses))
        .toBe('John Doe <john@example.com>, Jane <jane@example.com>');
    });
    
    it('handles empty array', () => {
      expect(formatEmailAddress([])).toBe('');
    });
    
    it('handles undefined', () => {
      expect(formatEmailAddress(undefined)).toBe('');
    });
  });
  
  describe('getPrimarySender', () => {
    it('returns primary sender name', () => {
      expect(getPrimarySender([mockAddress])).toBe('John Doe');
    });
    
    it('returns Unknown for empty array', () => {
      expect(getPrimarySender([])).toBe('Unknown');
    });
  });
  
  describe('getAttachmentCountText', () => {
    it('returns singular for 1 attachment', () => {
      expect(getAttachmentCountText(1)).toBe('1 attachment');
    });
    
    it('returns plural for multiple attachments', () => {
      expect(getAttachmentCountText(5)).toBe('5 attachments');
    });
    
    it('returns empty for 0', () => {
      expect(getAttachmentCountText(0)).toBe('');
    });
  });
  
  describe('getAttachmentIcon', () => {
    it('returns correct icon for PDF', () => {
      expect(getAttachmentIcon('application/pdf')).toBe('📄');
    });
    
    it('returns correct icon for ZIP', () => {
      expect(getAttachmentIcon('application/zip')).toBe('📦');
    });
    
    it('returns default icon for unknown type', () => {
      expect(getAttachmentIcon('application/unknown')).toBe('📎');
    });
  });
  
  describe('validateAttachment', () => {
    const mockAttachment: EmailAttachment = {
      filename: 'test.pdf',
      size: 1000,
      mimetype: 'application/pdf',
      url: 'https://example.com/file',
      metadata: null
    };
    
    it('validates normal attachment', () => {
      const result = validateAttachment(mockAttachment);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });
    
    it('rejects oversized attachment', () => {
      const large = { ...mockAttachment, size: 200 * 1024 * 1024 };
      const result = validateAttachment(large);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('100MB');
    });
    
    it('warns about executable files', () => {
      const exe = { ...mockAttachment, filename: 'malware.exe' };
      const result = validateAttachment(exe);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('executable');
    });
  });
});
```

### Step 2.3: Verify Tests Pass

```bash
npm test -- emailHelpers.test.ts
```

### Commit Point 2
```bash
git add src/lib/utils/emailHelpers.ts src/lib/utils/emailHelpers.test.ts
git commit -m "feat: Add email helper utilities for formatting and validation"
```

---

## Phase 3: Thumbnail Enhancement

**Estimated Time:** 25 minutes  
**Files Modified:** `src/lib/components/files/EmailPreview.svelte`

### Step 3.1: Add Imports

**Location:** Top of `EmailPreview.svelte` (after existing imports)

```typescript
import {
  formatEmailAddress,
  getPrimarySender,
  getShortSender,
  getAttachmentCountText
} from '$lib/utils/emailHelpers';
```

### Step 3.2: Add Reactive Declarations

**Location:** After line 28 (after `$: fileName = ...`)

```typescript
// Email metadata for enhanced display
$: primarySender = getShortSender(file.from);
$: emailSubject = file.subject || fileName;
$: attachmentInfo = getAttachmentCountText(file.original_attachment_count);
$: hasMetadata = !!(file.subject || file.from || file.to);
$: hasAttachments = !!(file.attachments && file.attachments.length > 0);
```

### Step 3.3: Update Compact View Template

**Location:** Replace lines 376-389 (compact preview section)

```svelte
{:else if compact}
  <button class="compact-preview" on:click={() => {}} title={emailSubject}>
    <div class="compact-thumbnail">
      <div class="email-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="currentColor"/>
        </svg>
      </div>
    </div>
    <div class="compact-info">
      {#if hasMetadata}
        <!-- Enhanced display with email metadata -->
        <div class="email-from">{primarySender}</div>
        <div class="email-subject">{emailSubject}</div>
        <div class="email-meta">
          {#if attachmentInfo}
            <span class="attachment-badge">📎 {attachmentInfo}</span>
            <span class="meta-separator">·</span>
          {/if}
          <span class="file-size">{formattedSize}</span>
        </div>
      {:else}
        <!-- Fallback for emails without metadata -->
        <div class="email-subject">{fileName}</div>
        <div class="file-size">{formattedSize}</div>
      {/if}
    </div>
  </button>
```

### Step 3.4: Add CSS for Enhanced Thumbnail

**Location:** Add after line 525 (in `<style>` section)

```css
/* Email from field in thumbnail */
.email-from {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.125rem;
}

/* Email metadata row (attachments + size) */
.email-meta {
  display: flex;
  gap: 0.375rem;
  align-items: center;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
}

/* Separator dot between metadata items */
.meta-separator {
  color: var(--color-text-tertiary);
  opacity: 0.6;
}

/* Attachment count badge */
.attachment-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--color-primary);
  font-weight: 500;
}

/* Adjust subject line for 3-line layout */
.email-subject {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* Update compact-info to accommodate 3 lines */
.compact-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;  /* Reduced from 0.25rem */
  flex: 1;
  min-width: 0;
}

/* Theme-specific colors */
:global([data-theme="dark"]) {
  --color-text-tertiary: #696969;
}

:global([data-theme="light"]) {
  --color-text-tertiary: #999999;
}
```

### Step 3.5: Test Thumbnail Display

**Manual Test:**
1. Open app and search for an email message
2. Verify thumbnail shows:
   - Sender name on first line
   - Subject on second line
   - Attachment count + size on third line
3. Test with email without attachments
4. Test with old cached email (should fall back gracefully)

### Commit Point 3
```bash
git add src/lib/components/files/EmailPreview.svelte
git commit -m "feat: Enhance email thumbnail with sender and attachment info"
```

---

## Phase 4: Full Preview Metadata

**Estimated Time:** 30 minutes  
**Files Modified:** `src/lib/components/files/EmailPreview.svelte`

### Step 4.1: Add Metadata Section Template

**Location:** After line 425 (after `</preview-header>`)

```svelte
<!-- Email Metadata Section -->
{#if hasMetadata && !compact}
  <div class="email-metadata-section">
    {#if file.from && file.from.length > 0}
      <div class="metadata-row">
        <span class="metadata-label">From:</span>
        <span class="metadata-value">{formatEmailAddress(file.from)}</span>
      </div>
    {/if}
    
    {#if file.to && file.to.length > 0}
      <div class="metadata-row">
        <span class="metadata-label">To:</span>
        <span class="metadata-value">{formatEmailAddress(file.to)}</span>
      </div>
    {/if}
    
    {#if file.cc && file.cc.length > 0}
      <div class="metadata-row">
        <span class="metadata-label">CC:</span>
        <span class="metadata-value">{formatEmailAddress(file.cc)}</span>
      </div>
    {/if}
    
    {#if file.subject}
      <div class="metadata-row">
        <span class="metadata-label">Subject:</span>
        <span class="metadata-value subject">{file.subject}</span>
      </div>
    {/if}
  </div>
{/if}
```

### Step 4.2: Add Metadata Section CSS

**Location:** Add in `<style>` section (before theme variables)

```css
/* Email Metadata Section */
.email-metadata-section {
  padding: 0.875rem 1rem;
  background: var(--color-metadata-bg);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  flex-shrink: 0;
}

.metadata-row {
  display: flex;
  gap: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.5;
  align-items: baseline;
}

.metadata-label {
  color: var(--color-text-secondary);
  font-weight: 600;
  min-width: 70px;
  flex-shrink: 0;
  text-align: right;
}

.metadata-value {
  color: var(--color-text-primary);
  word-break: break-word;
  flex: 1;
  line-height: 1.6;
}

.metadata-value.subject {
  font-weight: 500;
}

/* Long email addresses should wrap nicely */
.metadata-value {
  word-wrap: break-word;
  overflow-wrap: anywhere;
}
```

### Step 4.3: Update Theme Variables

**Location:** Add to theme variables section

```css
/* Dark theme */
:global([data-theme="dark"]) {
  --color-metadata-bg: rgba(255, 255, 255, 0.02);
  /* ... existing variables ... */
}

/* Light theme */
:global([data-theme="light"]) {
  --color-metadata-bg: #fafafa;
  /* ... existing variables ... */
}
```

### Step 4.4: Test Metadata Display

**Manual Test:**
1. Open full email preview
2. Verify metadata section appears above email body
3. Check From/To/CC fields display correctly
4. Test with long email addresses (should wrap)
5. Test with emails missing some fields (e.g., no CC)
6. Verify section doesn't appear for non-email files

### Commit Point 4
```bash
git add src/lib/components/files/EmailPreview.svelte
git commit -m "feat: Add email metadata display in full preview"
```

---

## Phase 5: Attachments Display

**Estimated Time:** 40 minutes  
**Files Modified:** `src/lib/components/files/EmailPreview.svelte`

### Step 5.1: Import Additional Helpers

**Location:** Update imports at top of file

```typescript
import {
  formatEmailAddress,
  getPrimarySender,
  getShortSender,
  getAttachmentCountText,
  getAttachmentIcon,  // ADD THIS
  validateAttachment  // ADD THIS
} from '$lib/utils/emailHelpers';
```

### Step 5.2: Add Download Function

**Location:** After `copyToClipboard` function (around line 360)

```typescript
/**
 * Download an email attachment
 */
async function downloadAttachment(attachment: EmailAttachment, index: number) {
  // Validate attachment before download
  const validation = validateAttachment(attachment);
  
  if (!validation.valid) {
    showError('Invalid attachment', validation.message || 'Cannot download this file', 5000);
    return;
  }
  
  // Show warning if file is potentially dangerous
  if (validation.warning) {
    showInfo('Security warning', validation.warning, 8000);
  }
  
  showInfo('Download started', `Downloading ${attachment.filename}...`, 3000);
  
  try {
    // Create unique ID for attachment
    const attachmentId = `${file.id}_att_${index}`;
    
    // Use existing downloadFile API
    const localPath = await downloadFile(
      workspaceId,
      attachmentId,
      attachment.url,
      attachment.filename
    );
    
    if (localPath.success) {
      showSuccess(
        'Download complete', 
        `${attachment.filename} saved successfully`, 
        3000
      );
    } else {
      showError(
        'Download failed', 
        `Failed to download ${attachment.filename}`, 
        5000
      );
    }
  } catch (error) {
    console.error('[EmailPreview] Attachment download error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Download failed';
    showError('Download failed', errorMessage, 5000);
  }
}
```

### Step 5.3: Add Attachments Section Template

**Location:** After metadata section (after email-metadata-section closing div)

```svelte
<!-- Email Attachments Section -->
{#if hasAttachments && !compact}
  <div class="attachments-section">
    <div class="attachments-header">
      <span class="attachments-title">
        📎 {file.attachments.length} Attachment{file.attachments.length !== 1 ? 's' : ''}
      </span>
      <span class="attachments-total-size">
        Total: {formatFileSize(file.attachments.reduce((sum, att) => sum + att.size, 0))}
      </span>
    </div>
    
    <div class="attachments-list">
      {#each file.attachments as attachment, index (attachment.filename + index)}
        <div class="attachment-item">
          <div class="attachment-icon">
            {getAttachmentIcon(attachment.mimetype)}
          </div>
          
          <div class="attachment-info">
            <div class="attachment-name" title={attachment.filename}>
              {attachment.filename}
            </div>
            <div class="attachment-meta">
              <span class="attachment-size">{formatFileSize(attachment.size)}</span>
              <span class="meta-separator">·</span>
              <span class="attachment-type">{attachment.mimetype}</span>
            </div>
          </div>
          
          <button
            class="attachment-download-btn"
            on:click={() => downloadAttachment(attachment, index)}
            title="Download {attachment.filename}"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path 
                fill="currentColor" 
                d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"
              />
            </svg>
            <span>Download</span>
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
```

### Step 5.4: Add Attachments Section CSS

**Location:** Add in `<style>` section

```css
/* ============================================
   Email Attachments Section
   ============================================ */

.attachments-section {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
}

.attachments-header {
  padding: 0.75rem 1rem;
  background: var(--color-metadata-bg);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.attachments-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attachments-total-size {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.attachments-list {
  padding: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

/* Individual attachment item */
.attachment-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-attachment-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  transition: all 0.15s ease;
}

.attachment-item:hover {
  background: var(--color-hover-bg);
  border-color: var(--color-border-hover);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Attachment icon */
.attachment-icon {
  font-size: 1.75rem;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* Attachment info (name and metadata) */
.attachment-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.attachment-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.attachment-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.attachment-size {
  font-weight: 500;
}

.attachment-type {
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 0.6875rem;
  opacity: 0.8;
}

/* Download button */
.attachment-download-btn {
  padding: 0.5rem 0.875rem;
  background: var(--color-primary);
  border: none;
  border-radius: 0.25rem;
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  transition: all 0.15s ease;
  flex-shrink: 0;
  white-space: nowrap;
}

.attachment-download-btn:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.attachment-download-btn:active {
  transform: translateY(0);
}

.attachment-download-btn svg {
  opacity: 0.95;
}

/* Scrollbar styling for attachment list */
.attachments-list::-webkit-scrollbar {
  width: 8px;
}

.attachments-list::-webkit-scrollbar-track {
  background: var(--color-scrollbar-track);
  border-radius: 4px;
}

.attachments-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar-thumb);
  border-radius: 4px;
}

.attachments-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-thumb-hover);
}

/* Theme variables for attachments */
:global([data-theme="dark"]) {
  --color-attachment-bg: rgba(255, 255, 255, 0.03);
  --color-scrollbar-track: rgba(255, 255, 255, 0.05);
  --color-scrollbar-thumb: rgba(255, 255, 255, 0.2);
  --color-scrollbar-thumb-hover: rgba(255, 255, 255, 0.3);
}

:global([data-theme="light"]) {
  --color-attachment-bg: #f8f8f8;
  --color-scrollbar-track: #f0f0f0;
  --color-scrollbar-thumb: #c0c0c0;
  --color-scrollbar-thumb-hover: #a0a0a0;
}

/* Responsive: Stack download button on small screens */
@media (max-width: 640px) {
  .attachment-item {
    flex-wrap: wrap;
  }
  
  .attachment-download-btn {
    width: 100%;
    justify-content: center;
    margin-top: 0.25rem;
  }
}
```

### Step 5.5: Test Attachments Display

**Manual Test:**
1. Open email with attachments
2. Verify attachments section appears
3. Check all attachment metadata displays correctly
4. Verify icons match file types
5. Test with multiple attachments (>5)
6. Test scrolling if many attachments
7. Verify responsive layout on narrow screens

### Commit Point 5
```bash
git add src/lib/components/files/EmailPreview.svelte
git commit -m "feat: Add email attachments display with download buttons"
```

---

## Phase 6: Final Integration & Testing

**Estimated Time:** 30 minutes

### Step 6.1: Add Error Handling for Missing Data

**Location:** Update reactive declarations

```typescript
// Safe access with fallbacks
$: primarySender = getShortSender(file.from) || 'Unknown Sender';
$: emailSubject = file.subject || file.name || 'Untitled Email';
$: attachmentInfo = getAttachmentCountText(file.original_attachment_count);
$: hasMetadata = !!(file.subject || file.from || file.to);
$: hasAttachments = !!(file.attachments && file.attachments.length > 0);

// Log metadata availability for debugging
$: if (hasMetadata || hasAttachments) {
  console.log('[EmailPreview] Email with enhanced data:', {
    hasMetadata,
    hasAttachments,
    attachmentCount: file.attachments?.length || 0,
    from: file.from?.length || 0,
    to: file.to?.length || 0,
    cc: file.cc?.length || 0
  });
}
```

### Step 6.2: Verify Full Integration

```bash
# Run TypeScript check
npm run check

# Run all tests
npm test

# Build the project
npm run build
```

### Step 6.3: Manual Testing Checklist

- [ ] Email with single attachment displays correctly
- [ ] Email with multiple attachments displays correctly
- [ ] Email without attachments displays correctly (no attachments section)
- [ ] Old cached email without new fields displays correctly (fallback)
- [ ] Non-email files are unaffected
- [ ] Thumbnail shows sender, subject, attachment count
- [ ] Full preview shows From/To/CC fields
- [ ] Attachments can be downloaded successfully
- [ ] Large files show size validation error
- [ ] Executable files show security warning
- [ ] Theme switching works (light/dark)
- [ ] Responsive layout on mobile
- [ ] Keyboard navigation works
- [ ] Screen reader compatibility (test with NVDA/JAWS)

### Step 6.4: Performance Testing

```typescript
// Add performance logging (temporary, remove before final commit)
const startTime = performance.now();
// ... render logic ...
const endTime = performance.now();
console.log(`[EmailPreview] Render time: ${endTime - startTime}ms`);
```

### Commit Point 6
```bash
git add .
git commit -m "feat: Complete email attachments feature with testing"
```

---

## Code Review Checklist

Before submitting PR:

### Type Safety
- [ ] All new types are properly defined
- [ ] No `any` types without justification
- [ ] Optional fields use `?` correctly
- [ ] No TypeScript errors

### Functionality
- [ ] All user stories implemented
- [ ] Edge cases handled
- [ ] Error handling in place
- [ ] Loading states implemented

### Code Quality
- [ ] No code duplication
- [ ] Functions have single responsibility
- [ ] Meaningful variable names
- [ ] Comments for complex logic
- [ ] No console.logs in production code

### Performance
- [ ] No unnecessary re-renders
- [ ] Efficient conditional rendering
- [ ] Proper use of reactive statements
- [ ] No memory leaks

### Security
- [ ] XSS prevention (Svelte auto-escape)
- [ ] File size validation
- [ ] Dangerous file warnings
- [ ] Authenticated API calls

### Accessibility
- [ ] Keyboard navigation works
- [ ] Proper ARIA labels
- [ ] Sufficient color contrast
- [ ] Screen reader compatible

### Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] No regressions

### Documentation
- [ ] Code comments added
- [ ] README updated if needed
- [ ] API docs updated
- [ ] Changelog entry added

---

## Rollback Procedure

If issues arise after deployment:

### Quick Rollback (Git)
```bash
git revert <commit-hash>
git push
```

### Manual Rollback
1. Remove optional fields from `SlackFile` interface
2. Delete `emailHelpers.ts`
3. Restore original `EmailPreview.svelte`
4. Test existing functionality

### Data Safety
- No database changes required
- No data migrations needed
- Old cached data remains valid
- API responses backward compatible

---

## Next Steps After Implementation

1. Monitor error logs for attachment download failures
2. Gather user feedback on UI/UX
3. Consider future enhancements:
   - Attachment preview (PDF, images)
   - Bulk download all attachments
   - Email search by attachment name
   - Attachment type filtering

---

## Support and Questions

For questions or issues during implementation:
1. Check existing EmailPreview.svelte for patterns
2. Review Slack API documentation
3. Test with real email data from conversations.history
4. Consult project memory files for context
