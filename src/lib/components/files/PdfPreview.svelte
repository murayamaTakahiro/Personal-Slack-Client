<script lang="ts">
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize } from '$lib/api/files';
  import { downloadFileWithProgress } from '$lib/stores/filePreview';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isDownloading = false;
  let downloadProgress = 0;
  let downloadError: string | null = null;

  $: formattedSize = formatFileSize(file.size);
  $: pageInfo = file.lines ? `${file.lines} page${file.lines !== 1 ? 's' : ''}` : null;
  $: thumbnailUrl = file.thumb_pdf || file.thumb_360 || file.thumb_160;

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    downloadError = null;
    downloadProgress = 0;

    try {
      const localPath = await downloadFileWithProgress(workspaceId, file);
      
      if (localPath) {
        // For now, just log success - we can add open functionality later
        console.log('PDF downloaded to:', localPath);
      } else {
        downloadError = 'Failed to download PDF';
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Download failed';
    } finally {
      isDownloading = false;
      downloadProgress = 0;
    }
  }
</script>

<div class="pdf-preview" class:compact>
  <div class="pdf-container">
    {#if thumbnailUrl && !compact}
      <div class="pdf-thumbnail">
        <img 
          src={thumbnailUrl} 
          alt="{file.name} thumbnail"
          class="thumbnail-image"
        />
        <div class="pdf-overlay">
          <svg class="pdf-icon" width="32" height="32" viewBox="0 0 32 32">
            <path fill="currentColor" d="M8 2h12l6 6v20c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2z"/>
            <path fill="white" d="M19 3v5c0 .55.45 1 1 1h5l-6-6z"/>
            <text x="16" y="22" text-anchor="middle" fill="white" font-size="8" font-weight="bold">PDF</text>
          </svg>
        </div>
      </div>
    {:else}
      <div class="pdf-icon-container">
        <svg class="pdf-file-icon" width="48" height="48" viewBox="0 0 48 48">
          <path fill="currentColor" d="M12 4h18l8 8v28c0 1.1-.9 2-2 2H12c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <path fill="white" d="M29 5v7c0 .55.45 1 1 1h7l-8-8z"/>
          <text x="24" y="32" text-anchor="middle" fill="white" font-size="10" font-weight="bold">PDF</text>
        </svg>
      </div>
    {/if}

    <div class="pdf-info">
      <div class="file-name" title={file.name}>
        {file.name || file.title}
      </div>
      
      <div class="file-details">
        <span class="file-size">{formattedSize}</span>
        {#if pageInfo}
          <span class="separator">•</span>
          <span class="page-count">{pageInfo}</span>
        {/if}
      </div>

      {#if !compact}
        <button 
          class="download-button"
          on:click={handleDownload}
          disabled={isDownloading}
          aria-label="Download {file.name}"
        >
          {#if isDownloading}
            <span class="button-content">
              <svg class="spinner-icon" width="14" height="14" viewBox="0 0 14 14">
                <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="38" stroke-dashoffset={38 - (38 * downloadProgress / 100)} />
              </svg>
              Downloading...
            </span>
          {:else}
            <span class="button-content">
              <svg class="download-icon" width="14" height="14" viewBox="0 0 14 14">
                <path fill="currentColor" d="M7 9.5L3.5 6h2V2h3v4h2L7 9.5zm-5 2v1h10v-1H2z"/>
              </svg>
              Download PDF
            </span>
          {/if}
        </button>
      {/if}

      {#if downloadError}
        <div class="error-message">
          {downloadError}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .pdf-preview {
    width: 100%;
  }

  .pdf-preview.compact {
    display: inline-flex;
  }

  .pdf-container {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    transition: all 0.2s ease;
  }

  .compact .pdf-container {
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .pdf-container:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .pdf-thumbnail {
    position: relative;
    width: 80px;
    height: 100px;
    flex-shrink: 0;
    border-radius: 0.25rem;
    overflow: hidden;
    background: var(--color-pdf-bg);
  }

  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pdf-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .pdf-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    flex-shrink: 0;
  }

  .compact .pdf-icon-container {
    width: 40px;
  }

  .pdf-file-icon {
    width: 100%;
    height: auto;
  }

  .compact .pdf-file-icon {
    width: 32px;
    height: 32px;
  }

  .pdf-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .compact .file-name {
    font-size: 0.75rem;
  }

  .file-details {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .compact .file-details {
    font-size: 0.6875rem;
  }

  .separator {
    opacity: 0.5;
  }

  .download-button {
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    align-self: flex-start;
  }

  .download-button:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .download-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .button-content {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .download-icon,
  .spinner-icon {
    flex-shrink: 0;
  }

  .spinner-icon {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-message {
    margin-top: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-error-bg);
    color: var(--color-error);
    font-size: 0.75rem;
    border-radius: 0.25rem;
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-pdf-bg: #2c2d2e;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-pdf-bg: #f0f0f0;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
  }
</style>