<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize, getBestThumbnailUrl, getFileIcon } from '$lib/api/files';
  import { getFileType } from '$lib/services/fileService';
  import { downloadFile } from '$lib/api/files';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isDownloading = false;
  let downloadError: string | null = null;
  let thumbnailUrl: string | undefined;
  let thumbnailError = false;

  $: fileType = getFileType(file);
  $: fileIcon = getFileIcon(file);
  $: formattedSize = formatFileSize(file.size);
  $: fileName = file.name || file.title || 'Untitled';
  $: fileExtension = file.name?.split('.').pop()?.toUpperCase() || file.filetype?.toUpperCase() || 'FILE';

  // Get file type specific info
  $: isExcel = fileType === 'excel';
  $: isWord = fileType === 'word';
  $: isPowerPoint = fileType === 'powerpoint';
  $: fileTypeLabel = isExcel ? 'Excel Spreadsheet' : isWord ? 'Word Document' : isPowerPoint ? 'PowerPoint Presentation' : 'Office Document';
  $: fileTypeColor = isExcel ? '#22863a' : isWord ? '#0366d6' : isPowerPoint ? '#d24726' : '#586069';

  onMount(() => {
    // Try to get thumbnail from Slack
    thumbnailUrl = getBestThumbnailUrl(file, 360);

    // For Office files, Slack sometimes provides thumb_360 or thumb_480
    if (!thumbnailUrl && file.thumb_360) {
      thumbnailUrl = file.thumb_360;
    } else if (!thumbnailUrl && file.thumb_480) {
      thumbnailUrl = file.thumb_480;
    }
  });

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    downloadError = null;

    showInfo('Download started', `Downloading ${fileName}...`, 3000);

    try {
      const localPath = await downloadFile(
        workspaceId,
        file.id,
        file.url_private_download || file.url_private,
        file.name
      );

      if (localPath.success) {
        showSuccess(
          'Download complete',
          `${fileName} saved successfully`,
          3000
        );
      } else {
        downloadError = 'Failed to download file';
        showError(
          'Download failed',
          `Failed to download ${fileName}`,
          5000
        );
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Download failed';
      showError(
        'Download failed',
        `Failed to download ${fileName}: ${downloadError}`,
        5000
      );
    } finally {
      isDownloading = false;
    }
  }

  function handleThumbnailError() {
    thumbnailError = true;
    thumbnailUrl = undefined;
  }
</script>

<div class="office-preview" class:compact>
  <div class="preview-container">
    {#if thumbnailUrl && !thumbnailError}
      <div class="thumbnail-container">
        <img
          src={thumbnailUrl}
          alt={fileName}
          class="thumbnail"
          on:error={handleThumbnailError}
        />
      </div>
    {:else}
      <div class="file-icon-container">
        <div class="file-icon" style="--file-color: {fileTypeColor}">
          <span class="icon-emoji">{fileIcon}</span>
          <span class="file-ext">{fileExtension}</span>
        </div>
      </div>
    {/if}

    <div class="file-info">
      <div class="file-name" title={fileName}>
        {fileName}
      </div>

      <div class="file-details">
        <span class="file-type">{fileTypeLabel}</span>
        <span class="separator">•</span>
        <span class="file-size">{formattedSize}</span>
      </div>

      {#if !compact}
        <div class="preview-notice">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7zm0 13c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6zm-.75-3.5h1.5V6h-1.5v4.5zm0-5.5h1.5v-1.5h-1.5V5z"/>
          </svg>
          <span>Full preview not available. Download to open in Office application.</span>
        </div>

        <div class="file-actions">
          <button
            class="action-button download"
            on:click={handleDownload}
            disabled={isDownloading}
            aria-label="Download {fileName}"
            title="Download file"
          >
            {#if isDownloading}
              <svg class="icon spinner" width="16" height="16" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none"
                  stroke-dasharray="44" stroke-dashoffset="33" stroke-linecap="round"/>
              </svg>
            {:else}
              <svg class="icon" width="16" height="16" viewBox="0 0 16 16">
                <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
              </svg>
            {/if}
            <span class="button-text">
              {isDownloading ? 'Downloading...' : `Download ${isExcel ? 'Excel' : isWord ? 'Word' : isPowerPoint ? 'PowerPoint' : 'Office'} File`}
            </span>
          </button>

          {#if file.url_private}
            <a
              href={file.url_private}
              target="_blank"
              rel="noopener noreferrer"
              class="action-button view"
              title="Open in Slack"
            >
              <svg class="icon" width="16" height="16" viewBox="0 0 16 16">
                <path fill="currentColor" d="M12 10v3H3V4h3V2H3c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2v-3h-2z"/>
                <path fill="currentColor" d="M9 2v2h2.59L6.29 9.29l1.42 1.42L13 5.41V8h2V2H9z"/>
              </svg>
              <span class="button-text">Open in Slack</span>
            </a>
          {/if}
        </div>
      {:else}
        <button
          class="compact-download-btn"
          on:click={handleDownload}
          disabled={isDownloading}
          title="Download {fileName}"
        >
          {#if isDownloading}
            <div class="spinner small"></div>
          {:else}
            <svg width="14" height="14" viewBox="0 0 16 16">
              <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
            </svg>
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
  .office-preview {
    width: 100%;
  }

  .office-preview.compact {
    display: inline-flex;
  }

  .preview-container {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    transition: all 0.2s ease;
  }

  .compact .preview-container {
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .preview-container:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .thumbnail-container {
    width: 100px;
    height: 100px;
    flex-shrink: 0;
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--color-thumbnail-bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .compact .thumbnail-container {
    width: 60px;
    height: 60px;
  }

  .thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon-container {
    width: 100px;
    height: 100px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .compact .file-icon-container {
    width: 60px;
    height: 60px;
  }

  .file-icon {
    width: 80px;
    height: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--color-icon-bg);
    border: 2px solid var(--file-color);
    border-radius: 0.375rem;
    position: relative;
  }

  .compact .file-icon {
    width: 50px;
    height: 50px;
  }

  .icon-emoji {
    font-size: 2rem;
    line-height: 1;
  }

  .compact .icon-emoji {
    font-size: 1.25rem;
  }

  .file-ext {
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    padding: 1px 4px;
    background: var(--file-color);
    color: white;
    font-size: 0.5rem;
    font-weight: 600;
    border-radius: 2px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .file-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .compact .file-info {
    gap: 0.25rem;
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

  .file-type {
    text-transform: capitalize;
  }

  .separator {
    opacity: 0.5;
  }

  .preview-notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--color-notice-bg);
    color: var(--color-notice-text);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .file-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-button-bg);
    color: var(--color-button-text);
    border: 1px solid var(--color-button-border);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
  }

  .action-button:hover:not(:disabled) {
    background: var(--color-button-hover-bg);
    border-color: var(--color-button-hover-border);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button.download {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .action-button.download:hover:not(:disabled) {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .compact-download-btn {
    padding: 0.25rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    margin-top: auto;
  }

  .compact-download-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .compact-download-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }

  .icon.spinner {
    animation: spin 1s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .button-text {
    white-space: nowrap;
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
    --color-icon-bg: rgba(255, 255, 255, 0.05);
    --color-thumbnail-bg: #0d0e0f;
    --color-notice-bg: rgba(18, 100, 163, 0.1);
    --color-notice-text: #a3c9e1;
    --color-button-bg: transparent;
    --color-button-text: #d1d2d3;
    --color-button-border: #565856;
    --color-button-hover-bg: rgba(255, 255, 255, 0.08);
    --color-button-hover-border: #707070;
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
    --color-icon-bg: rgba(0, 0, 0, 0.03);
    --color-thumbnail-bg: #f6f6f6;
    --color-notice-bg: rgba(18, 100, 163, 0.05);
    --color-notice-text: #0d4f8b;
    --color-button-bg: transparent;
    --color-button-text: #1d1c1d;
    --color-button-border: #dddddd;
    --color-button-hover-bg: rgba(0, 0, 0, 0.05);
    --color-button-hover-border: #bbbbbb;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
  }
</style>