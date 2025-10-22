<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize, getFileContent } from '$lib/api/files';
  import { downloadFile } from '$lib/api/files';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  // Extract sender from username or user field
  $: sender = file.username || file.user || 'Unknown';

  type ViewMode = 'html';
  let viewMode: ViewMode = 'html';  // HTML-only view
  let isLoading = true;
  let isDownloading = false;
  let rawContent: string = '';
  let decodedText: string = '';
  let sanitizedHtml: string = '';
  let error: string | null = null;
  let iframeContent: string = '';

  const MAX_PREVIEW_SIZE = 1024 * 1024; // 1MB

  $: formattedSize = formatFileSize(file.size);
  $: fileName = file.name || file.title || 'Untitled Email';

  // Debug logging
  console.log('[EmailPreview] Component mounted', { file, workspaceId, compact });

  onMount(() => {
    console.log('[EmailPreview] onMount called, loading file content...');
    loadFileContent();
  });

  /**
   * Decode HTML entities using browser's DOMParser
   * Safe for XSS because we only extract textContent
   */
  function decodeHtmlEntities(html: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return doc.documentElement.textContent || '';
    } catch (err) {
      console.error('[EmailPreview] Failed to decode HTML entities:', err);
      return html;
    }
  }

  /**
   * Sanitize HTML for safe rendering
   * Remove script tags, event handlers, and potentially dangerous elements
   * HTML entities are automatically decoded by the browser's DOMParser
   */
  function sanitizeHtml(html: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Remove script tags
      const scripts = doc.querySelectorAll('script');
      scripts.forEach(script => script.remove());

      // Remove potentially dangerous tags
      const dangerousTags = ['iframe', 'object', 'embed', 'link', 'style'];
      dangerousTags.forEach(tag => {
        const elements = doc.querySelectorAll(tag);
        elements.forEach(el => el.remove());
      });

      // Remove event handlers and javascript: links
      const allElements = doc.querySelectorAll('*');
      allElements.forEach(el => {
        // Remove event handler attributes
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith('on')) {
            el.removeAttribute(attr.name);
          }
        });

        // Sanitize href attributes
        if (el.hasAttribute('href')) {
          const href = el.getAttribute('href') || '';
          if (href.toLowerCase().startsWith('javascript:')) {
            el.setAttribute('href', '#');
          }
        }

        // Sanitize src attributes
        if (el.hasAttribute('src')) {
          const src = el.getAttribute('src') || '';
          if (src.toLowerCase().startsWith('javascript:')) {
            el.removeAttribute('src');
          }
        }
      });

      // Return the body's innerHTML to get properly decoded HTML
      // The DOMParser automatically decodes HTML entities
      return doc.body.innerHTML;
    } catch (err) {
      console.error('[EmailPreview] Failed to sanitize HTML:', err);
      return '';
    }
  }

  async function loadFileContent() {
    console.log('[EmailPreview] loadFileContent started', {
      fileName,
      size: file.size,
      url: file.url_private_download || file.url_private
    });

    isLoading = true;
    error = null;

    try {
      // Check file size
      if (file.size > MAX_PREVIEW_SIZE) {
        showInfo(
          'Large file',
          'File is too large for preview. Download to view full content.',
          5000
        );
        error = 'File too large for preview';
        return;
      }

      // Fetch file content from Slack
      const url = file.url_private_download || file.url_private;

      try {
        // Try to fetch content via backend
        const content = await getFileContent(url, MAX_PREVIEW_SIZE, 'utf-8');

        rawContent = content;

        // Decode HTML entities for text view
        decodedText = decodeHtmlEntities(content);

        // Sanitize HTML for formatted view
        sanitizedHtml = sanitizeHtml(content);

        // Create iframe content with Gmail-like styling
        iframeContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Yu Gothic", "Meiryo", sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #e8eaed !important;
      padding: 20px 24px;
      margin: 0;
      background: #1f1f1f !important;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    /* Override any inline styles from email HTML */
    body * {
      color: inherit !important;
      background-color: transparent !important;
    }
    /* Exception for links to keep them visible */
    a, a * {
      color: #1a73e8 !important;
    }
    a:visited, a:visited * {
      color: #9334e6 !important;
    }
    p {
      margin: 0 0 1em 0;
      line-height: 1.6;
    }
    p:last-child {
      margin-bottom: 0;
    }
    br {
      line-height: 1.6;
    }
    div {
      line-height: 1.6;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 1.5em 0 0.75em 0;
      line-height: 1.3;
      font-weight: 600;
      color: #e8eaed !important;
    }
    h1:first-child,
    h2:first-child,
    h3:first-child {
      margin-top: 0;
    }
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.3em; }
    h3 { font-size: 1.15em; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      border: 1px solid #3a3a3a;
      font-size: 14px;
    }
    td, th {
      border: 1px solid #3a3a3a !important;
      padding: 8px 12px;
      text-align: left;
      vertical-align: top;
      line-height: 1.5;
      background-color: transparent !important;
    }
    th {
      background: #2a2a2a !important;
      font-weight: 600;
      color: #e8eaed !important;
    }
    img {
      max-width: 100%;
      height: auto;
      display: inline-block;
      vertical-align: middle;
    }
    a {
      color: #1a73e8;
      text-decoration: none;
      word-break: break-word;
    }
    a:hover {
      text-decoration: underline;
    }
    a:visited {
      color: #9334e6;
    }
    ul, ol {
      margin: 1em 0;
      padding-left: 40px;
      line-height: 1.6;
    }
    li {
      margin: 0.25em 0;
    }
    blockquote {
      margin: 1em 0;
      padding: 0.5em 0 0.5em 1em;
      border-left: 4px solid #565856;
      color: #ababad;
    }
    code {
      background: #0d0e0f;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Roboto Mono', 'Courier New', monospace;
      font-size: 13px;
      color: #e8eaed;
    }
    pre {
      background: #0d0e0f;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 1em 0;
      border: 1px solid #3a3a3a;
      color: #e8eaed;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    hr {
      border: none;
      border-top: 1px solid #565856;
      margin: 1.5em 0;
    }
    /* Ensure proper spacing for text blocks */
    body > :first-child {
      margin-top: 0;
    }
    body > :last-child {
      margin-bottom: 0;
    }
  </style>
</head>
<body>
${sanitizedHtml}
</body>
</html>`;

      } catch (backendError) {
        console.warn('[EmailPreview] Backend error:', backendError);
        const errorMessage = backendError instanceof Error ? backendError.message : String(backendError);

        if (errorMessage.includes('UTF-8') || errorMessage.includes('utf-8')) {
          error = 'Encoding error - unable to preview this email file';
          rawContent = `[Binary file or non-UTF-8 encoded file]\n\nFile: ${fileName}\nSize: ${formattedSize}\n\nThis file cannot be previewed.\nDownload the file to view its contents.`;
        } else {
          error = 'Preview temporarily unavailable';
          rawContent = `[Preview not available]\n\nFile: ${fileName}\nSize: ${formattedSize}\n\nDownload the file to view its contents.`;
        }
      }
    } catch (err) {
      console.error('[EmailPreview] Error loading file content:', err);
      error = err instanceof Error ? err.message : 'Failed to load email content';
      rawContent = '';
    } finally {
      isLoading = false;
    }
  }

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    showInfo('Download started', `Downloading ${fileName}...`, 3000);

    try {
      const localPath = await downloadFile(
        workspaceId,
        file.id,
        file.url_private_download || file.url_private,
        file.name
      );

      if (localPath.success) {
        showSuccess('Download complete', `${fileName} saved successfully`, 3000);
      } else {
        showError('Download failed', `Failed to download ${fileName}`, 5000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      showError('Download failed', errorMessage, 5000);
    } finally {
      isDownloading = false;
    }
  }

  export function copyToClipboard() {
    const contentToCopy = decodedText;

    if (!contentToCopy || contentToCopy.includes('[Preview not available')) {
      showError('Copy failed', 'No content available to copy', 3000);
      return;
    }

    navigator.clipboard.writeText(contentToCopy).then(() => {
      showSuccess('Copied', 'Email content copied to clipboard', 2000);
    }).catch((err) => {
      showError('Copy failed', 'Failed to copy content', 3000);
    });
  }
</script>

<div class="email-preview" class:compact>
  {#if isLoading}
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading email...</span>
    </div>
  {:else if error && !rawContent}
    <div class="error-container">
      <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13a6 6 0 110-12 6 6 0 010 12zm1-6V4H7v4h2zm0 3V9H7v2h2z"/>
      </svg>
      <span>{error}</span>
    </div>
  {:else if compact}
    <button class="compact-preview" on:click={() => {}} title={fileName}>
      <div class="compact-thumbnail">
        <div class="email-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="currentColor"/>
          </svg>
        </div>
      </div>
      <div class="compact-info">
        <div class="email-subject">{fileName}</div>
        <div class="file-size">{formattedSize}</div>
      </div>
    </button>
  {:else}
    <div class="preview-container">
      <div class="preview-header">
        <div class="file-info">
          <span class="file-name">{fileName}</span>
          <span class="file-meta">{formattedSize}</span>
        </div>


        <div class="preview-actions">
          <button
            class="action-btn"
            on:click={copyToClipboard}
            title="Copy to clipboard"
            disabled={!rawContent || rawContent.includes('[Preview not available')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path fill="currentColor" d="M10 3H6C4.9 3 4 3.9 4 5v9c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V8l-5-5zm4 11c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h3v3c0 .55.45 1 1 1h3v6zm-4-8V3.5L13.5 7H10z"/>
            </svg>
          </button>
          <button
            class="action-btn primary"
            on:click={handleDownload}
            disabled={isDownloading}
            title="Download file"
          >
            {#if isDownloading}
              <div class="spinner small"></div>
            {:else}
              <svg width="14" height="14" viewBox="0 0 16 16">
                <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <div class="email-content">
        <div class="email-body">
          {@html sanitizedHtml}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .email-preview {
    width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    /* Remove overflow - let parent wrapper handle scrolling */
    overflow: visible;
    display: flex;
    flex-direction: column;
    /* Fill available space to enable scrolling */
    flex: 1;
    min-height: 0;
  }

  .email-preview.compact {
    border-radius: 0.375rem;
    width: 100%;
    max-width: none;
    background: transparent;
    border: none;
    height: auto;
  }

  .compact-preview {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    width: fit-content;
    max-width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 52px;
  }

  .compact-preview:hover {
    border-color: var(--color-primary);
    background: var(--color-hover-bg);
  }

  .compact-thumbnail {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-email-bg);
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    overflow: hidden;
    position: relative;
  }

  .email-icon {
    color: var(--color-primary);
    opacity: 0.8;
  }

  .compact-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .email-subject {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: normal;
    overflow: hidden;
    line-height: 1.4;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    max-height: 2.8rem; /* 1.4 line-height * 2 lines */
  }

  .compact-info .file-size {
    font-size: 0.6875rem;
    color: var(--color-text-secondary);
  }

  .loading-container {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-container {
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-error);
    background: var(--color-error-bg);
  }

  .error-icon {
    flex-shrink: 0;
  }

  .preview-container {
    display: flex;
    flex-direction: column;
    /* Fill available space and allow content to overflow */
    flex: 1;
    min-height: 0;
  }

  .preview-header {
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-header-bg);
    flex-shrink: 0;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    flex: 1;
  }

  .file-name {
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }


  .preview-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.375rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-hover-bg);
    border-color: var(--color-border-hover);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .email-content {
    position: relative;
    /* Fill remaining space after header, allowing natural height */
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .email-body {
    /* Gmail-like styling for email content */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 14px;
    line-height: 1.7;
    color: var(--color-email-text);
    padding: 20px 24px;
    background: var(--color-email-bg);
    word-wrap: break-word;
    overflow-wrap: break-word;
    min-height: 100%;
  }

  /* Email content styles */
  .email-body :global(p) {
    margin: 0 0 1em 0;
    line-height: 1.6;
  }

  .email-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .email-body :global(div) {
    line-height: 1.6;
  }

  .email-body :global(h1),
  .email-body :global(h2),
  .email-body :global(h3),
  .email-body :global(h4),
  .email-body :global(h5),
  .email-body :global(h6) {
    margin: 1.5em 0 0.75em 0;
    line-height: 1.3;
    font-weight: 600;
    color: var(--color-email-text);
  }

  .email-body :global(h1:first-child),
  .email-body :global(h2:first-child),
  .email-body :global(h3:first-child) {
    margin-top: 0;
  }

  .email-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    border: 1px solid var(--color-border);
    font-size: 14px;
  }

  .email-body :global(td),
  .email-body :global(th) {
    border: 1px solid var(--color-border);
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
    line-height: 1.5;
  }

  .email-body :global(th) {
    background: var(--color-header-bg);
    font-weight: 600;
  }

  .email-body :global(a) {
    color: var(--color-primary);
    text-decoration: none;
    word-break: break-word;
  }

  .email-body :global(a:hover) {
    text-decoration: underline;
  }

  .email-body :global(ul),
  .email-body :global(ol) {
    margin: 1em 0;
    padding-left: 40px;
    line-height: 1.6;
  }

  .email-body :global(blockquote) {
    margin: 1em 0;
    padding: 0.75em 1em;
    border-left: 3px solid var(--color-email-quote-border);
    background: var(--color-email-quote-bg);
    color: var(--color-email-quote-text);
    border-radius: 0 4px 4px 0;
  }

  .email-body :global(code) {
    background: var(--color-code-bg);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Roboto Mono', 'Courier New', monospace;
    font-size: 13px;
    color: var(--color-email-text);
  }

  .email-body :global(pre) {
    background: var(--color-code-bg);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 1em 0;
    border: 1px solid var(--color-border);
  }

  .email-body :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .email-body :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 1.5em 0;
  }

  .email-body :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 0.5em 0;
  }

  /* Better spacing for nested elements */
  .email-body :global(blockquote p:last-child) {
    margin-bottom: 0;
  }

  .email-body :global(li) {
    margin: 0.25em 0;
  }

  /* Email signature separator */
  .email-body :global(div[style*="border"]) {
    border-color: var(--color-border) !important;
  }

  /* Override inline styles from email HTML for better readability */
  .email-body :global(*[style*="background-color"]) {
    background-color: transparent !important;
  }

  .email-body :global(*[style*="background:"]) {
    background: transparent !important;
  }

  /* Force readable text colors - override any inline styles */
  .email-body :global(*[style*="color"]:not(a)) {
    color: var(--color-email-text) !important;
  }

  .email-body :global(div),
  .email-body :global(p),
  .email-body :global(span),
  .email-body :global(td),
  .email-body :global(th),
  .email-body :global(li) {
    color: inherit !important;
  }


  /* Theme variables */
  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-header-bg: rgba(255, 255, 255, 0.03);
    --color-code-bg: #0d0e0f;
    --color-hover-bg: rgba(255, 255, 255, 0.08);
    --color-border-hover: #707070;
    --color-primary: #1a73e8;
    --color-primary-hover: #1557b0;
    --color-email-bg: #1a1d21;
    --color-email-text: #e8eaed;
    --color-email-quote-border: #565856;
    --color-email-quote-bg: rgba(255, 255, 255, 0.02);
    --color-email-quote-text: #c1c2c3;
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-header-bg: #f8f8f8;
    --color-code-bg: #f6f6f6;
    --color-hover-bg: rgba(0, 0, 0, 0.05);
    --color-border-hover: #bbbbbb;
    --color-primary: #1a73e8;
    --color-primary-hover: #1557b0;
    --color-email-bg: #ffffff;
    --color-email-text: #1d1c1d;
    --color-email-quote-border: #c6c6c6;
    --color-email-quote-bg: rgba(0, 0, 0, 0.02);
    --color-email-quote-text: #616061;
  }
</style>
