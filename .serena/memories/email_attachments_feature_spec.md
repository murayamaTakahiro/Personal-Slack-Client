# Email Attachments Feature - Specification Document

## Overview

This feature enhances the email preview functionality to display and download email attachments from forwarded email messages in Slack.

## Current State

### What Works
- Email files are detected and displayed with basic preview
- Email body (HTML) is rendered with sanitization
- Basic file download for the email itself
- Thumbnail view for email files

### Limitations
- No display of email metadata (from/to/cc/subject) in thumbnails
- Email attachments are not visible to users
- Cannot download email attachments
- Limited sender information (only username)

## Requirements

### Functional Requirements

#### FR-1: Email Metadata Display in Thumbnails
**Priority:** High  
**Description:** Display sender and subject in compact thumbnail view

**Acceptance Criteria:**
- Show sender name/email in thumbnail
- Show email subject
- Show attachment count if attachments exist
- Maintain current thumbnail size constraints
- Handle long sender names and subjects with truncation

#### FR-2: Email Metadata Display in Full Preview
**Priority:** High  
**Description:** Show complete email headers in full preview mode

**Acceptance Criteria:**
- Display From field with all senders
- Display To field with all recipients
- Display CC field if present
- Display Subject field
- Format email addresses as "Name <email@domain.com>"
- Handle multiple recipients properly

#### FR-3: Email Attachments List
**Priority:** High  
**Description:** Display list of email attachments with metadata

**Acceptance Criteria:**
- Show attachment filename
- Show attachment file size
- Show attachment MIME type
- Display appropriate icon for file type
- Show total attachment count
- Handle emails with no attachments gracefully

#### FR-4: Attachment Download
**Priority:** High  
**Description:** Enable downloading individual email attachments

**Acceptance Criteria:**
- Download button for each attachment
- Progress indication during download
- Success/failure notifications
- Save file with original filename
- Handle large attachments (up to 100MB)
- Authenticate requests properly

### Non-Functional Requirements

#### NFR-1: Backward Compatibility
**Priority:** Critical  
**Description:** No breaking changes to existing functionality

**Acceptance Criteria:**
- Old cached email files display correctly
- Non-email files unaffected
- Existing download functionality preserved
- No database migrations required

#### NFR-2: Performance
**Priority:** High  
**Description:** No performance degradation

**Acceptance Criteria:**
- No additional API calls required
- Metadata parsing < 10ms
- Thumbnail rendering time unchanged
- Attachment list rendering < 50ms for 10 attachments

#### NFR-3: Security
**Priority:** Critical  
**Description:** Secure handling of attachments

**Acceptance Criteria:**
- All downloads use authenticated Slack URLs
- XSS prevention for email addresses and filenames
- File size validation before download
- Warning for potentially dangerous file types

#### NFR-4: Accessibility
**Priority:** Medium  
**Description:** Accessible UI for all users

**Acceptance Criteria:**
- Keyboard navigation for attachments
- Screen reader compatible
- Proper ARIA labels
- Sufficient color contrast

## Data Model

### Slack API Response Structure

From `conversations.history` API, email files include:

```json
{
  "id": "F09KTMZHTHQ",
  "name": "Re: Email Subject",
  "filetype": "email",
  "mimetype": "text/html",
  "size": 586708,
  
  "subject": "Re: Email Subject",
  "from": [
    {
      "address": "sender@example.com",
      "name": "Sender Name",
      "original": "Sender Name <sender@example.com>"
    }
  ],
  "to": [
    {
      "address": "recipient@example.com",
      "name": "Recipient Name",
      "original": "Recipient Name <recipient@example.com>"
    }
  ],
  "cc": [
    {
      "address": "cc@example.com",
      "name": "CC Name",
      "original": "CC Name <cc@example.com>"
    }
  ],
  "attachments": [
    {
      "filename": "document.pdf",
      "size": 497976,
      "mimetype": "application/pdf",
      "url": "https://files-origin.slack.com/...",
      "metadata": null
    }
  ],
  "original_attachment_count": 1,
  "inline_attachment_count": 0,
  "plain_text": "Email body text..."
}
```

### TypeScript Type Extensions

New interfaces to be added to `src/lib/types/slack.ts`:

```typescript
export interface EmailAddress {
  address: string;      // Email address
  name: string;         // Display name
  original: string;     // Original format "Name <email>"
}

export interface EmailAttachment {
  filename: string;     // File name
  size: number;         // File size in bytes
  mimetype: string;     // MIME type
  url: string;          // Download URL (authenticated)
  metadata: any | null; // Additional metadata
}
```

Extended `SlackFile` interface (optional fields):

```typescript
export interface SlackFile {
  // ... existing fields ...
  
  // Email-specific fields
  subject?: string;
  from?: EmailAddress[];
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  attachments?: EmailAttachment[];
  original_attachment_count?: number;
  inline_attachment_count?: number;
  plain_text?: string;
}
```

## UI/UX Design

### Compact Thumbnail View

**Before:**
```
┌────────────────────────────────┐
│  📧  Email Subject             │
│      573 KB                    │
└────────────────────────────────┘
```

**After:**
```
┌────────────────────────────────┐
│  📧  Sender Name                │
│      Email Subject             │
│      📎 1 attachment · 573 KB  │
└────────────────────────────────┘
```

### Full Preview Layout

```
┌─────────────────────────────────────────────────────┐
│ Email Subject                          573 KB  [⬇]  │
├─────────────────────────────────────────────────────┤
│ From:    Sender Name <sender@example.com>           │
│ To:      Recipient Name <recipient@example.com>     │
│ CC:      CC Name <cc@example.com>                   │
│ Subject: Re: Email Subject                          │
├─────────────────────────────────────────────────────┤
│ 📎 1 Attachment                                     │
│                                                       │
│ 📄 document.pdf              486 KB    [Download]   │
├─────────────────────────────────────────────────────┤
│ [Email body content]                                │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## User Flows

### Flow 1: View Email with Attachments

1. User searches/browses messages
2. Email message appears in results with enhanced thumbnail
   - Shows sender, subject, attachment count
3. User clicks to open email preview
4. Full preview shows:
   - Complete email headers (From/To/CC/Subject)
   - Attachments section with file list
   - Email body
5. User can download attachments individually

### Flow 2: Download Attachment

1. User opens email preview
2. User clicks "Download" button on attachment
3. System shows "Download started" notification
4. File downloads using Slack authenticated URL
5. System shows "Download complete" notification
6. File saved to user's download folder

### Flow 3: Email without Attachments

1. User opens email preview
2. System shows email metadata
3. No attachments section displayed
4. Email body rendered normally

## Success Metrics

- **Usability:** Users can identify email senders without opening preview
- **Functionality:** 100% of email attachments are downloadable
- **Compatibility:** 0 breaking changes to existing features
- **Performance:** < 100ms additional rendering time for attachments
- **Reliability:** 99%+ download success rate

## Out of Scope

The following are explicitly NOT included in this feature:

- Inline image preview for email attachments
- Direct viewing of email attachments (only download)
- Email reply functionality
- Email forwarding
- Attachment preview before download
- Bulk download of all attachments
- Email search by attachment name
- BCC field display (rarely provided by Slack API)

## Dependencies

### Existing Code
- `src/lib/types/slack.ts` - Type definitions
- `src/lib/components/files/EmailPreview.svelte` - Email preview component
- `src/lib/api/files.ts` - File download API
- `src/lib/services/fileService.ts` - File type detection

### External APIs
- Slack Web API (`conversations.history`)
- Slack Files API (authenticated downloads)

### Libraries
- None (uses existing dependencies)

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Slack API changes email format | High | Low | Optional fields, graceful fallback |
| Large attachment download failures | Medium | Low | Size validation, error handling |
| XSS in email addresses/filenames | High | Low | Svelte auto-escaping, validation |
| Performance impact on large emails | Low | Low | Lazy rendering, pagination |
| Backward compatibility issues | High | Very Low | Comprehensive testing, optional fields |

## Testing Strategy

See separate testing guide for detailed test cases.

**Test Coverage Required:**
- Unit tests for email helper functions
- Component tests for EmailPreview enhancements
- Integration tests for attachment downloads
- Regression tests for existing functionality
- Visual tests for UI changes

## Implementation Timeline

- **Phase 1:** Type definitions and utilities (30 min)
- **Phase 2:** Thumbnail enhancements (30 min)
- **Phase 3:** Full preview metadata (30 min)
- **Phase 4:** Attachments display and download (60 min)
- **Phase 5:** Testing and bug fixes (45 min)
- **Phase 6:** Documentation and code review (30 min)

**Total Estimated Time:** 3.5 hours

## Approval and Sign-off

- [ ] Product requirements reviewed
- [ ] Technical design approved
- [ ] Security review completed
- [ ] UI/UX design approved
- [ ] Ready for implementation
