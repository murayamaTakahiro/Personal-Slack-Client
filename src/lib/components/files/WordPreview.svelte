<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize } from '$lib/api/files';
  import { downloadFile } from '$lib/api/files';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';
  import { invoke } from '@tauri-apps/api/core';
  import mammoth from 'mammoth';
  import DOMPurify from 'dompurify';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isLoading = true;
  let isDownloading = false;
  let error: string | null = null;
  let htmlContent: string = '';

  const MAX_PREVIEW_SIZE = 10 * 1024 * 1024; // 10MB

  $: formattedSize = formatFileSize(file.size);
  $: fileName = file.name || file.title || 'Untitled';

  // Reload content when file changes
  $: if (file && file.id) {
    loadWordContent();
  }

  onMount(() => {
    loadWordContent();
  });

  async function loadWordContent() {
    isLoading = true;
    error = null;

    try {
      if (file.size > MAX_PREVIEW_SIZE) {
        showInfo(
          'Large file',
          `File is large (${formattedSize}). Preview may be slow.`,
          5000
        );
      }

      const url = file.url_private_download || file.url_private;

      // Download file as binary via Tauri backend
      const numberArray = await invoke<number[]>('download_file_binary', {
        workspaceId,
        url
      });

      // Convert number array to ArrayBuffer for Mammoth
      const uint8Array = new Uint8Array(numberArray);
      const arrayBuffer = uint8Array.buffer;

      // Convert to HTML using Mammoth with options to filter hidden content
      const result = await mammoth.convertToHtml({
        arrayBuffer: arrayBuffer
      }, {
        // Ignore empty paragraphs (default: true)
        ignoreEmptyParagraphs: true,
        // Custom style map to ignore common hidden content patterns
        styleMap: [
          // Ignore comment references (Word comments/annotations)
          "comment-reference => !",
          // Ignore common placeholder/instruction styles
          "p[style-name='Comment'] => !",
          "p[style-name='Balloon Text'] => !",
          "p[style-name='Instruction'] => !",
          "p[style-name='Placeholder'] => !",
          "p[style-name='Form Field Help Text'] => !"
        ]
      });

      // Debug: Log conversion messages and HTML output
      console.log('[WordPreview] Mammoth conversion messages:', result.messages);
      console.log('[WordPreview] HTML preview (first 500 chars):', result.value.substring(0, 500));

      // Check for potential hidden content patterns in the output
      const suspiciousPatterns = [
        '記入してください',
        '押印してください',
        'してください。'
      ];
      suspiciousPatterns.forEach(pattern => {
        if (result.value.includes(pattern)) {
          console.warn(`[WordPreview] Found suspicious pattern: "${pattern}"`);
        }
      });

      // Sanitize HTML to prevent XSS
      htmlContent = DOMPurify.sanitize(result.value, {
        ALLOWED_TAGS: [
          'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'strong', 'em', 'u', 's', 'ul', 'ol', 'li',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'a', 'img', 'span', 'div'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id']
      });

      // Log warnings if any
      if (result.messages.length > 0) {
        console.warn('[WordPreview] Conversion warnings:', result.messages);
      }

    } catch (err) {
      console.error('[WordPreview] Error loading Word content:', err);
      error = err instanceof Error ? err.message : 'Failed to load Word file';
      showError('Preview error', error, 5000);
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
      showError('Download failed', `Failed to download ${fileName}: ${errorMessage}`, 5000);
    } finally {
      isDownloading = false;
    }
  }
</script>

<div class="word-preview" class:compact>
  {#if isLoading}
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading Word document...</span>
    </div>
  {:else if error}
    <div class="error-container">
      <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13a6 6 0 110-12 6 6 0 010 12zm1-6V4H7v4h2zm0 3V9H7v2h2z"/>
      </svg>
      <span>{error}</span>
    </div>
  {:else}
    <div class="preview-container">
      <div class="file-info">
        <div class="file-name-row">
          <span class="file-name" title={fileName}>{fileName}</span>
          <span class="file-size">{formattedSize}</span>
        </div>
      </div>

      <div class="content-container">
        {@html htmlContent}
      </div>

      {#if !compact}
        <div class="actions">
          <button
            class="download-button"
            on:click={handleDownload}
            disabled={isDownloading}
          >
            {#if isDownloading}
              <div class="spinner small"></div>
            {:else}
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
              </svg>
            {/if}
            <span>{isDownloading ? 'Downloading...' : 'Download Word File'}</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .word-preview {
    width: 100%;
    border-radius: 0.375rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .word-preview.compact {
    background: transparent;
    border: none;
  }

  .loading-container,
  .error-container {
    padding: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--color-text-secondary);
  }

  .error-container {
    color: var(--color-error);
    background: var(--color-error-bg);
    border-radius: 0.375rem;
  }

  .spinner {
    width: 20px;
    height: 20px;
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
    to {
      transform: rotate(360deg);
    }
  }

  .preview-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-name-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .file-name {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .content-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem;
    background: white;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-family: 'Calibri', 'Arial', sans-serif;
    line-height: 1.6;
    color: #000;
    overflow-x: auto;
  }

  /* Style converted HTML content */
  .content-container :global(p) {
    margin-bottom: 1em;
  }

  .content-container :global(h1) {
    font-size: 2em;
    font-weight: bold;
    margin-bottom: 0.5em;
    margin-top: 0.5em;
  }

  .content-container :global(h2) {
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 0.5em;
    margin-top: 0.5em;
  }

  .content-container :global(h3) {
    font-size: 1.25em;
    font-weight: bold;
    margin-bottom: 0.5em;
    margin-top: 0.5em;
  }

  .content-container :global(h4),
  .content-container :global(h5),
  .content-container :global(h6) {
    font-size: 1.1em;
    font-weight: bold;
    margin-bottom: 0.5em;
    margin-top: 0.5em;
  }

  .content-container :global(strong) {
    font-weight: bold;
  }

  .content-container :global(em) {
    font-style: italic;
  }

  .content-container :global(u) {
    text-decoration: underline;
  }

  .content-container :global(s) {
    text-decoration: line-through;
  }

  .content-container :global(ul),
  .content-container :global(ol) {
    margin-bottom: 1em;
    padding-left: 2em;
  }

  .content-container :global(li) {
    margin-bottom: 0.25em;
  }

  .content-container :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1em;
  }

  .content-container :global(th),
  .content-container :global(td) {
    border: 1px solid #ddd;
    padding: 0.5em;
    text-align: left;
  }

  .content-container :global(th) {
    background-color: #f0f0f0;
    font-weight: bold;
  }

  .content-container :global(a) {
    color: #1264a3;
    text-decoration: underline;
  }

  .content-container :global(img) {
    max-width: 100%;
    height: auto;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .download-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .download-button:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .download-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
  }

  /* Dark theme: Keep content area white for better readability */
  :global([data-theme="dark"]) .content-container {
    background: white;
    color: #000;
  }
</style>
