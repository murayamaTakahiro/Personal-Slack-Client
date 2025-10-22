# Email Attachments Feature - Testing Guide

## Table of Contents
1. [Testing Strategy](#testing-strategy)
2. [Unit Tests](#unit-tests)
3. [Component Tests](#component-tests)
4. [Integration Tests](#integration-tests)
5. [Manual Testing](#manual-testing)
6. [Regression Testing](#regression-testing)
7. [Performance Testing](#performance-testing)
8. [Accessibility Testing](#accessibility-testing)

---

## Testing Strategy

### Test Pyramid

```
       /\
      /E2E\          End-to-End (5%)
     /------\
    /Integ. \        Integration (15%)
   /----------\
  / Component  \     Component (30%)
 /--------------\
/     Unit       \   Unit (50%)
------------------
```

### Coverage Goals

| Test Type | Coverage Goal | Priority |
|-----------|--------------|----------|
| Unit Tests | 90%+ | High |
| Component Tests | 80%+ | High |
| Integration Tests | 70%+ | Medium |
| Manual Tests | 100% | Critical |

### Test Data

**Location:** `src/lib/test-data/email-files.ts` (create this file)

```typescript
import type { SlackFile, EmailAddress, EmailAttachment } from '$lib/types/slack';

export const mockEmailAddress: EmailAddress = {
  name: 'John Doe',
  address: 'john@example.com',
  original: 'John Doe <john@example.com>'
};

export const mockAttachment: EmailAttachment = {
  filename: 'contract.pdf',
  size: 497976,
  mimetype: 'application/pdf',
  url: 'https://files-origin.slack.com/test/contract.pdf',
  metadata: null
};

export const mockEmailWithAttachments: SlackFile = {
  id: 'F123456',
  created: 1760084516,
  timestamp: 1760084402,
  name: 'Re: Contract Discussion',
  title: 'Re: Contract Discussion',
  mimetype: 'text/html',
  filetype: 'email',
  pretty_type: 'Email',
  user: 'U123456',
  username: 'John Doe',
  editable: true,
  size: 586708,
  mode: 'email',
  is_external: false,
  external_type: '',
  is_public: false,
  public_url_shared: false,
  display_as_bot: true,
  url_private: 'https://files.slack.com/files-pri/T024X8GPP-F123456/email',
  url_private_download: 'https://files.slack.com/files-pri/T024X8GPP-F123456/download/email',
  permalink: 'https://example.slack.com/files/U123456/F123456/email',
  subject: 'Re: Contract Discussion',
  from: [mockEmailAddress],
  to: [
    {
      name: 'Jane Smith',
      address: 'jane@example.com',
      original: 'Jane Smith <jane@example.com>'
    }
  ],
  cc: [
    {
      name: 'Bob Johnson',
      address: 'bob@example.com',
      original: 'Bob Johnson <bob@example.com>'
    }
  ],
  attachments: [mockAttachment],
  original_attachment_count: 1,
  inline_attachment_count: 0,
  plain_text: 'Email body text...'
};

export const mockEmailWithoutAttachments: SlackFile = {
  ...mockEmailWithAttachments,
  attachments: undefined,
  original_attachment_count: 0
};

export const mockEmailWithMultipleAttachments: SlackFile = {
  ...mockEmailWithAttachments,
  attachments: [
    mockAttachment,
    {
      filename: 'invoice.xlsx',
      size: 123456,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      url: 'https://files-origin.slack.com/test/invoice.xlsx',
      metadata: null
    },
    {
      filename: 'presentation.pptx',
      size: 2048000,
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      url: 'https://files-origin.slack.com/test/presentation.pptx',
      metadata: null
    }
  ],
  original_attachment_count: 3
};

export const mockOldEmailFile: SlackFile = {
  id: 'F789012',
  created: 1700000000,
  timestamp: 1700000000,
  name: 'Old Email',
  title: 'Old Email',
  mimetype: 'text/html',
  filetype: 'email',
  pretty_type: 'Email',
  user: 'U789012',
  editable: true,
  size: 50000,
  mode: 'email',
  is_external: false,
  external_type: '',
  is_public: false,
  public_url_shared: false,
  display_as_bot: true,
  url_private: 'https://files.slack.com/files-pri/T024X8GPP-F789012/old-email',
  url_private_download: 'https://files.slack.com/files-pri/T024X8GPP-F789012/download/old-email',
  permalink: 'https://example.slack.com/files/U789012/F789012/old-email'
  // No email-specific fields (old format)
};

export const mockLargeAttachment: EmailAttachment = {
  filename: 'large-file.zip',
  size: 200 * 1024 * 1024, // 200MB
  mimetype: 'application/zip',
  url: 'https://files-origin.slack.com/test/large-file.zip',
  metadata: null
};

export const mockDangerousAttachment: EmailAttachment = {
  filename: 'setup.exe',
  size: 1024 * 1024,
  mimetype: 'application/x-msdownload',
  url: 'https://files-origin.slack.com/test/setup.exe',
  metadata: null
};
```

---

## Unit Tests

### emailHelpers.test.ts

**Location:** `src/lib/utils/emailHelpers.test.ts`

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
  describe('formatEmailAddress', () => {
    it('should format single address with name', () => {
      const addresses: EmailAddress[] = [{
        name: 'John Doe',
        address: 'john@example.com',
        original: 'John Doe <john@example.com>'
      }];
      
      expect(formatEmailAddress(addresses))
        .toBe('John Doe <john@example.com>');
    });
    
    it('should format single address without name', () => {
      const addresses: EmailAddress[] = [{
        name: '',
        address: 'john@example.com',
        original: 'john@example.com'
      }];
      
      expect(formatEmailAddress(addresses))
        .toBe('john@example.com');
    });
    
    it('should format multiple addresses', () => {
      const addresses: EmailAddress[] = [
        {
          name: 'John Doe',
          address: 'john@example.com',
          original: 'John Doe <john@example.com>'
        },
        {
          name: 'Jane Smith',
          address: 'jane@example.com',
          original: 'Jane Smith <jane@example.com>'
        }
      ];
      
      expect(formatEmailAddress(addresses))
        .toBe('John Doe <john@example.com>, Jane Smith <jane@example.com>');
    });
    
    it('should handle empty array', () => {
      expect(formatEmailAddress([])).toBe('');
    });
    
    it('should handle undefined', () => {
      expect(formatEmailAddress(undefined)).toBe('');
    });
    
    it('should handle address where name equals address', () => {
      const addresses: EmailAddress[] = [{
        name: 'john@example.com',
        address: 'john@example.com',
        original: 'john@example.com'
      }];
      
      expect(formatEmailAddress(addresses))
        .toBe('john@example.com');
    });
  });
  
  describe('getPrimarySender', () => {
    it('should return sender name when available', () => {
      const addresses: EmailAddress[] = [{
        name: 'John Doe',
        address: 'john@example.com',
        original: 'John Doe <john@example.com>'
      }];
      
      expect(getPrimarySender(addresses)).toBe('John Doe');
    });
    
    it('should return email address when name is empty', () => {
      const addresses: EmailAddress[] = [{
        name: '',
        address: 'john@example.com',
        original: 'john@example.com'
      }];
      
      expect(getPrimarySender(addresses)).toBe('john@example.com');
    });
    
    it('should return "Unknown" for empty array', () => {
      expect(getPrimarySender([])).toBe('Unknown');
    });
    
    it('should return "Unknown" for undefined', () => {
      expect(getPrimarySender(undefined)).toBe('Unknown');
    });
    
    it('should return first sender when multiple exist', () => {
      const addresses: EmailAddress[] = [
        { name: 'First', address: 'first@example.com', original: '...' },
        { name: 'Second', address: 'second@example.com', original: '...' }
      ];
      
      expect(getPrimarySender(addresses)).toBe('First');
    });
  });
  
  describe('getShortSender', () => {
    it('should return name when available', () => {
      const addresses: EmailAddress[] = [{
        name: 'John Doe',
        address: 'john@example.com',
        original: 'John Doe <john@example.com>'
      }];
      
      expect(getShortSender(addresses)).toBe('John Doe');
    });
    
    it('should extract username from email when no name', () => {
      const addresses: EmailAddress[] = [{
        name: '',
        address: 'john.doe@example.com',
        original: 'john.doe@example.com'
      }];
      
      expect(getShortSender(addresses)).toBe('john.doe');
    });
    
    it('should return "Unknown" for empty array', () => {
      expect(getShortSender([])).toBe('Unknown');
    });
    
    it('should return "Unknown" for undefined', () => {
      expect(getShortSender(undefined)).toBe('Unknown');
    });
  });
  
  describe('getAttachmentCountText', () => {
    it('should return singular for 1 attachment', () => {
      expect(getAttachmentCountText(1)).toBe('1 attachment');
    });
    
    it('should return plural for 2 attachments', () => {
      expect(getAttachmentCountText(2)).toBe('2 attachments');
    });
    
    it('should return plural for many attachments', () => {
      expect(getAttachmentCountText(10)).toBe('10 attachments');
    });
    
    it('should return empty string for 0', () => {
      expect(getAttachmentCountText(0)).toBe('');
    });
    
    it('should return empty string for undefined', () => {
      expect(getAttachmentCountText(undefined)).toBe('');
    });
  });
  
  describe('getAttachmentIcon', () => {
    const testCases = [
      { mimetype: 'application/pdf', expected: '📄', description: 'PDF' },
      { mimetype: 'application/zip', expected: '📦', description: 'ZIP' },
      { mimetype: 'application/x-rar', expected: '📦', description: 'RAR' },
      { mimetype: 'image/png', expected: '🖼️', description: 'Image' },
      { mimetype: 'image/jpeg', expected: '🖼️', description: 'JPEG' },
      { mimetype: 'application/msword', expected: '📝', description: 'Word' },
      { mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expected: '📝', description: 'DOCX' },
      { mimetype: 'application/vnd.ms-excel', expected: '📊', description: 'Excel' },
      { mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', expected: '📊', description: 'XLSX' },
      { mimetype: 'application/vnd.ms-powerpoint', expected: '📽️', description: 'PowerPoint' },
      { mimetype: 'video/mp4', expected: '🎬', description: 'Video' },
      { mimetype: 'audio/mpeg', expected: '🎵', description: 'Audio' },
      { mimetype: 'text/plain', expected: '📃', description: 'Text' },
      { mimetype: 'application/octet-stream', expected: '📎', description: 'Unknown' }
    ];
    
    testCases.forEach(({ mimetype, expected, description }) => {
      it(`should return ${expected} for ${description}`, () => {
        expect(getAttachmentIcon(mimetype)).toBe(expected);
      });
    });
    
    it('should be case-insensitive', () => {
      expect(getAttachmentIcon('APPLICATION/PDF')).toBe('📄');
      expect(getAttachmentIcon('Image/PNG')).toBe('🖼️');
    });
  });
  
  describe('truncateSubject', () => {
    it('should not truncate short subjects', () => {
      expect(truncateSubject('Short subject')).toBe('Short subject');
    });
    
    it('should truncate long subjects with default length', () => {
      const longSubject = 'This is a very long email subject that exceeds fifty characters';
      const result = truncateSubject(longSubject);
      
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result.endsWith('...')).toBe(true);
    });
    
    it('should respect custom maxLength', () => {
      const subject = 'This is a test subject';
      const result = truncateSubject(subject, 10);
      
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result).toBe('This is...');
    });
    
    it('should handle empty string', () => {
      expect(truncateSubject('')).toBe('');
    });
    
    it('should handle exact length match', () => {
      const subject = 'x'.repeat(50);
      expect(truncateSubject(subject, 50)).toBe(subject);
    });
  });
  
  describe('validateAttachment', () => {
    const validAttachment: EmailAttachment = {
      filename: 'document.pdf',
      size: 1024 * 1024, // 1MB
      mimetype: 'application/pdf',
      url: 'https://files.slack.com/test.pdf',
      metadata: null
    };
    
    it('should validate normal attachment', () => {
      const result = validateAttachment(validAttachment);
      
      expect(result.valid).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });
    
    it('should reject attachment without URL', () => {
      const invalid = { ...validAttachment, url: '' };
      const result = validateAttachment(invalid);
      
      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
    });
    
    it('should reject oversized attachment', () => {
      const large = { 
        ...validAttachment, 
        size: 200 * 1024 * 1024 // 200MB
      };
      const result = validateAttachment(large);
      
      expect(result.valid).toBe(false);
      expect(result.message).toContain('100MB');
    });
    
    it('should accept exactly 100MB', () => {
      const maxSize = { 
        ...validAttachment, 
        size: 100 * 1024 * 1024 
      };
      const result = validateAttachment(maxSize);
      
      expect(result.valid).toBe(true);
    });
    
    it('should warn about .exe files', () => {
      const exe = { ...validAttachment, filename: 'setup.exe' };
      const result = validateAttachment(exe);
      
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('executable');
    });
    
    it('should warn about .bat files', () => {
      const bat = { ...validAttachment, filename: 'script.bat' };
      const result = validateAttachment(bat);
      
      expect(result.valid).toBe(true);
      expect(result.warning).toBeDefined();
    });
    
    it('should warn about .js files', () => {
      const js = { ...validAttachment, filename: 'malware.js' };
      const result = validateAttachment(js);
      
      expect(result.valid).toBe(true);
      expect(result.warning).toBeDefined();
    });
    
    it('should be case-insensitive for extensions', () => {
      const exe = { ...validAttachment, filename: 'SETUP.EXE' };
      const result = validateAttachment(exe);
      
      expect(result.warning).toBeDefined();
    });
    
    it('should not warn about safe files', () => {
      const testCases = [
        'document.pdf',
        'spreadsheet.xlsx',
        'archive.zip',
        'image.png',
        'video.mp4'
      ];
      
      testCases.forEach(filename => {
        const safe = { ...validAttachment, filename };
        const result = validateAttachment(safe);
        
        expect(result.valid).toBe(true);
        expect(result.warning).toBeUndefined();
      });
    });
  });
});
```

### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- emailHelpers.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

---

## Component Tests

### EmailPreview.test.ts

**Location:** `src/lib/components/files/EmailPreview.test.ts`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmailPreview from './EmailPreview.svelte';
import {
  mockEmailWithAttachments,
  mockEmailWithoutAttachments,
  mockOldEmailFile,
  mockEmailWithMultipleAttachments
} from '$lib/test-data/email-files';

// Mock API calls
vi.mock('$lib/api/files', () => ({
  downloadFile: vi.fn().mockResolvedValue({ success: true }),
  formatFileSize: vi.fn((size) => `${Math.round(size / 1024)} KB`),
  getFileContent: vi.fn().mockResolvedValue('<html><body>Email content</body></html>')
}));

describe('EmailPreview Component', () => {
  const defaultProps = {
    file: mockEmailWithAttachments,
    workspaceId: 'T024X8GPP',
    compact: false
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Compact Mode', () => {
    it('should render compact thumbnail with sender', () => {
      render(EmailPreview, {
        props: { ...defaultProps, compact: true }
      });
      
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    
    it('should display subject in compact mode', () => {
      render(EmailPreview, {
        props: { ...defaultProps, compact: true }
      });
      
      expect(screen.getByText(/Contract Discussion/)).toBeInTheDocument();
    });
    
    it('should show attachment count in compact mode', () => {
      render(EmailPreview, {
        props: { ...defaultProps, compact: true }
      });
      
      expect(screen.getByText(/1 attachment/)).toBeInTheDocument();
    });
    
    it('should show file size in compact mode', () => {
      render(EmailPreview, {
        props: { ...defaultProps, compact: true }
      });
      
      expect(screen.getByText(/KB/)).toBeInTheDocument();
    });
    
    it('should fall back gracefully for old email files', () => {
      render(EmailPreview, {
        props: {
          file: mockOldEmailFile,
          workspaceId: 'T024X8GPP',
          compact: true
        }
      });
      
      // Should still render without errors
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
  
  describe('Full Preview - Metadata Section', () => {
    it('should display From field', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText('From:')).toBeInTheDocument();
        expect(screen.getByText(/john@example.com/)).toBeInTheDocument();
      });
    });
    
    it('should display To field', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText('To:')).toBeInTheDocument();
        expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
      });
    });
    
    it('should display CC field when present', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText('CC:')).toBeInTheDocument();
        expect(screen.getByText(/bob@example.com/)).toBeInTheDocument();
      });
    });
    
    it('should display Subject field', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText('Subject:')).toBeInTheDocument();
        expect(screen.getByText(/Contract Discussion/)).toBeInTheDocument();
      });
    });
    
    it('should not display metadata section without email data', async () => {
      render(EmailPreview, {
        props: {
          file: mockOldEmailFile,
          workspaceId: 'T024X8GPP',
          compact: false
        }
      });
      
      await waitFor(() => {
        expect(screen.queryByText('From:')).not.toBeInTheDocument();
        expect(screen.queryByText('To:')).not.toBeInTheDocument();
      });
    });
  });
  
  describe('Full Preview - Attachments Section', () => {
    it('should display attachments section', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText(/1 Attachment/)).toBeInTheDocument();
      });
    });
    
    it('should display attachment filename', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText('contract.pdf')).toBeInTheDocument();
      });
    });
    
    it('should display attachment size', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText(/KB/)).toBeInTheDocument();
      });
    });
    
    it('should display attachment MIME type', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        expect(screen.getByText(/application\/pdf/)).toBeInTheDocument();
      });
    });
    
    it('should render download button for each attachment', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        const downloadButtons = screen.getAllByText('Download');
        expect(downloadButtons.length).toBeGreaterThan(0);
      });
    });
    
    it('should display multiple attachments', async () => {
      render(EmailPreview, {
        props: {
          file: mockEmailWithMultipleAttachments,
          workspaceId: 'T024X8GPP',
          compact: false
        }
      });
      
      await waitFor(() => {
        expect(screen.getByText(/3 Attachments/)).toBeInTheDocument();
        expect(screen.getByText('contract.pdf')).toBeInTheDocument();
        expect(screen.getByText('invoice.xlsx')).toBeInTheDocument();
        expect(screen.getByText('presentation.pptx')).toBeInTheDocument();
      });
    });
    
    it('should not display attachments section without attachments', async () => {
      render(EmailPreview, {
        props: {
          file: mockEmailWithoutAttachments,
          workspaceId: 'T024X8GPP',
          compact: false
        }
      });
      
      await waitFor(() => {
        expect(screen.queryByText(/Attachment/)).not.toBeInTheDocument();
      });
    });
  });
  
  describe('Attachment Download', () => {
    it('should call downloadFile when download button clicked', async () => {
      const { downloadFile } = await import('$lib/api/files');
      
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        const downloadButton = screen.getByText('Download');
        fireEvent.click(downloadButton);
      });
      
      await waitFor(() => {
        expect(downloadFile).toHaveBeenCalledWith(
          'T024X8GPP',
          expect.stringContaining('F123456_att_0'),
          expect.stringContaining('slack.com'),
          'contract.pdf'
        );
      });
    });
    
    it('should show success notification on successful download', async () => {
      const { downloadFile } = await import('$lib/api/files');
      downloadFile.mockResolvedValueOnce({ success: true });
      
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        const downloadButton = screen.getByText('Download');
        fireEvent.click(downloadButton);
      });
      
      await waitFor(() => {
        // Check for success toast (implementation depends on your toast system)
        expect(screen.getByText(/saved successfully/)).toBeInTheDocument();
      });
    });
    
    it('should show error notification on failed download', async () => {
      const { downloadFile } = await import('$lib/api/files');
      downloadFile.mockResolvedValueOnce({ success: false });
      
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        const downloadButton = screen.getByText('Download');
        fireEvent.click(downloadButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument();
      });
    });
  });
  
  describe('Accessibility', () => {
    it('should have accessible download buttons', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        const downloadButton = screen.getByRole('button', { name: /download/i });
        expect(downloadButton).toBeInTheDocument();
      });
    });
    
    it('should have title attribute on attachment names', async () => {
      render(EmailPreview, { props: defaultProps });
      
      await waitFor(() => {
        const attachmentName = screen.getByTitle('contract.pdf');
        expect(attachmentName).toBeInTheDocument();
      });
    });
  });
});
```

### Running Component Tests

```bash
# Run component tests
npm test -- EmailPreview.test.ts

# Run with DOM debugging
npm test -- EmailPreview.test.ts --reporter=verbose
```

---

## Integration Tests

### Email Attachment Download Flow

**Location:** `src/tests/integration/email-attachments.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import EmailPreview from '$lib/components/files/EmailPreview.svelte';
import { mockEmailWithAttachments } from '$lib/test-data/email-files';

describe('Email Attachments Integration', () => {
  beforeEach(() => {
    // Setup test environment
    vi.clearAllMocks();
  });
  
  it('should complete full email preview workflow', async () => {
    // 1. Render component
    render(EmailPreview, {
      props: {
        file: mockEmailWithAttachments,
        workspaceId: 'T024X8GPP',
        compact: false
      }
    });
    
    // 2. Verify metadata loads
    await waitFor(() => {
      expect(screen.getByText('From:')).toBeInTheDocument();
      expect(screen.getByText('To:')).toBeInTheDocument();
    });
    
    // 3. Verify attachments display
    await waitFor(() => {
      expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    });
    
    // 4. Click download
    const downloadButton = screen.getByText('Download');
    fireEvent.click(downloadButton);
    
    // 5. Verify download initiated
    await waitFor(() => {
      expect(screen.getByText(/downloading/i)).toBeInTheDocument();
    });
    
    // 6. Verify success notification
    await waitFor(() => {
      expect(screen.getByText(/saved successfully/i)).toBeInTheDocument();
    });
  });
  
  it('should handle transition from compact to full view', async () => {
    const { rerender } = render(EmailPreview, {
      props: {
        file: mockEmailWithAttachments,
        workspaceId: 'T024X8GPP',
        compact: true
      }
    });
    
    // Verify compact mode
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    
    // Switch to full mode
    rerender({
      file: mockEmailWithAttachments,
      workspaceId: 'T024X8GPP',
      compact: false
    });
    
    // Verify full mode with attachments
    await waitFor(() => {
      expect(screen.getByText('From:')).toBeInTheDocument();
      expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    });
  });
});
```

---

## Manual Testing

### Test Cases Checklist

#### TC-001: Email with Single Attachment
**Priority:** High  
**Preconditions:** Email message with 1 PDF attachment in Slack

**Steps:**
1. Search for email message
2. Verify thumbnail displays:
   - ✓ Sender name
   - ✓ Email subject
   - ✓ "1 attachment" badge
   - ✓ File size
3. Click to open full preview
4. Verify metadata section shows:
   - ✓ From field
   - ✓ To field
   - ✓ CC field (if applicable)
   - ✓ Subject field
5. Verify attachments section shows:
   - ✓ "1 Attachment" header
   - ✓ PDF icon 📄
   - ✓ Filename "contract.pdf"
   - ✓ File size
   - ✓ MIME type
   - ✓ Download button
6. Click Download button
7. Verify download notification appears
8. Verify file downloads successfully

**Expected Result:** All steps pass

---

#### TC-002: Email with Multiple Attachments
**Priority:** High  
**Preconditions:** Email message with 3+ attachments

**Steps:**
1. Open email preview
2. Verify "3 Attachments" header
3. Verify all attachments listed
4. Download each attachment individually
5. Verify each download succeeds

**Expected Result:** All attachments downloadable

---

#### TC-003: Email without Attachments
**Priority:** High  
**Preconditions:** Email message with no attachments

**Steps:**
1. View email thumbnail
2. Verify no attachment badge shown
3. Open full preview
4. Verify metadata section appears
5. Verify attachments section does NOT appear
6. Verify email body displays

**Expected Result:** Clean display without attachment UI

---

#### TC-004: Old Cached Email (Backward Compatibility)
**Priority:** Critical  
**Preconditions:** Email file without new fields

**Steps:**
1. View old email thumbnail
2. Verify basic display (no errors)
3. Open full preview
4. Verify email body renders
5. Verify no metadata/attachments sections

**Expected Result:** Graceful fallback to basic display

---

#### TC-005: Large Attachment Validation
**Priority:** Medium  
**Preconditions:** Email with 150MB attachment

**Steps:**
1. Open email preview
2. Click Download on large attachment
3. Verify error message: "File exceeds 100MB limit"
4. Verify download does NOT start

**Expected Result:** Size validation works

---

#### TC-006: Dangerous File Warning
**Priority:** Medium  
**Preconditions:** Email with .exe attachment

**Steps:**
1. Open email preview
2. Click Download on .exe file
3. Verify warning: "may contain executable code"
4. Verify download proceeds (with warning)

**Expected Result:** Security warning displayed

---

#### TC-007: Theme Switching
**Priority:** Medium  
**Preconditions:** Email with attachments open

**Steps:**
1. View email in dark theme
2. Switch to light theme
3. Verify colors update correctly
4. Switch back to dark theme
5. Verify no visual artifacts

**Expected Result:** Smooth theme transitions

---

#### TC-008: Responsive Layout (Mobile)
**Priority:** Medium  
**Preconditions:** Browser DevTools or mobile device

**Steps:**
1. Open email preview
2. Resize to 375px width
3. Verify thumbnail fits screen
4. Verify metadata wraps correctly
5. Verify attachment list readable
6. Verify download button accessible

**Expected Result:** Mobile-friendly layout

---

#### TC-009: Long Email Addresses
**Priority:** Low  
**Preconditions:** Email with very long addresses

**Steps:**
1. Open email with 50+ char email addresses
2. Verify addresses wrap correctly
3. Verify no horizontal scroll
4. Verify full addresses visible

**Expected Result:** Long addresses handled gracefully

---

#### TC-010: Many Attachments (10+)
**Priority:** Low  
**Preconditions:** Email with 10+ attachments

**Steps:**
1. Open email preview
2. Verify attachments list scrollable
3. Scroll through all attachments
4. Verify no performance issues
5. Download attachment at bottom

**Expected Result:** Performant with many attachments

---

### Manual Testing Checklist Summary

```
[ ] TC-001: Single attachment
[ ] TC-002: Multiple attachments
[ ] TC-003: No attachments
[ ] TC-004: Backward compatibility
[ ] TC-005: Large file validation
[ ] TC-006: Dangerous file warning
[ ] TC-007: Theme switching
[ ] TC-008: Responsive layout
[ ] TC-009: Long email addresses
[ ] TC-010: Many attachments
```

---

## Regression Testing

### Existing Functionality Checklist

**Email Preview (Existing Features):**
- [ ] Email body HTML rendering works
- [ ] Email sanitization prevents XSS
- [ ] Copy to clipboard works
- [ ] Download email file works
- [ ] Loading states display correctly
- [ ] Error handling works
- [ ] View mode toggle works

**File Preview (Other Types):**
- [ ] PDF preview unchanged
- [ ] Image preview unchanged
- [ ] CSV preview unchanged
- [ ] Word/Excel preview unchanged
- [ ] Generic file preview unchanged

**Search and Display:**
- [ ] Email files appear in search results
- [ ] File type detection works
- [ ] Thumbnail generation works
- [ ] File list rendering works

**Performance:**
- [ ] No slowdown in email loading
- [ ] No memory leaks
- [ ] No unnecessary re-renders

---

## Performance Testing

### Metrics to Monitor

```typescript
// Add to EmailPreview.svelte for testing
const start = performance.now();
// ... component render ...
const end = performance.now();
console.log(`Render time: ${end - start}ms`);
```

### Performance Benchmarks

| Scenario | Target | Acceptable | Unacceptable |
|----------|--------|------------|--------------|
| Initial render (no attachments) | < 100ms | < 200ms | > 300ms |
| Initial render (3 attachments) | < 150ms | < 300ms | > 500ms |
| Initial render (10 attachments) | < 200ms | < 400ms | > 600ms |
| Attachment download start | < 50ms | < 100ms | > 200ms |
| Theme switch | < 50ms | < 100ms | > 200ms |
| Compact → Full transition | < 100ms | < 200ms | > 300ms |

### Load Testing

```bash
# Test with large dataset
for i in {1..100}; do
  # Open 100 emails with attachments
  # Monitor memory usage
done
```

---

## Accessibility Testing

### WCAG 2.1 AA Compliance

**Keyboard Navigation:**
- [ ] Tab through all interactive elements
- [ ] Enter/Space activates download buttons
- [ ] Focus indicators visible
- [ ] No keyboard traps

**Screen Readers:**
- [ ] NVDA: Test on Windows
- [ ] JAWS: Test on Windows
- [ ] VoiceOver: Test on macOS

**Screen Reader Checklist:**
- [ ] Email metadata announced correctly
- [ ] Attachment count announced
- [ ] Download buttons have descriptive labels
- [ ] File sizes announced
- [ ] Loading states announced

**Color Contrast:**
```bash
# Use axe DevTools or Lighthouse
npm run lighthouse
```

**Required Contrast Ratios:**
- Normal text: 4.5:1
- Large text: 3:1
- UI components: 3:1

---

## Test Data Management

### Creating Test Data

**Generate Mock Email:**
```typescript
const createMockEmail = (
  attachmentCount: number = 1
): SlackFile => ({
  id: `F${Date.now()}`,
  name: `Test Email ${attachmentCount} Attachments`,
  filetype: 'email',
  // ... generate fields ...
  attachments: Array.from({ length: attachmentCount }, (_, i) => ({
    filename: `file-${i}.pdf`,
    size: Math.floor(Math.random() * 10000000),
    mimetype: 'application/pdf',
    url: `https://files.slack.com/test-${i}.pdf`,
    metadata: null
  })),
  original_attachment_count: attachmentCount
});
```

### Test Data Reset

```bash
# Clear test cache
rm -rf .cache/test-data/

# Reset test database
npm run test:reset-db
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Email Attachments Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm test -- --coverage
      
      - name: Run component tests
        run: npm test -- EmailPreview.test.ts
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Bug Report Template

```markdown
### Bug Description
[Clear description of the issue]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc.]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Environment
- OS: [e.g., Windows 11]
- Browser: [e.g., Chrome 120]
- Theme: [Light/Dark]

### Screenshots
[If applicable]

### Test Case Reference
[e.g., TC-001]

### Console Errors
```
[Paste console errors]
```

### Severity
[Critical/High/Medium/Low]
```

---

## Testing Sign-off

Before marking feature as complete:

- [ ] All unit tests passing (90%+ coverage)
- [ ] All component tests passing
- [ ] All integration tests passing
- [ ] All manual test cases executed
- [ ] No regressions found
- [ ] Performance benchmarks met
- [ ] Accessibility requirements met
- [ ] Cross-browser testing complete
- [ ] Mobile testing complete
- [ ] Documentation updated
