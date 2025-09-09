<script lang="ts">
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize, getFileIcon } from '$lib/api/files';
  import { getFileType } from '$lib/services/fileService';
  import { downloadFileWithProgress } from '$lib/stores/filePreview';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isDownloading = false;
  let downloadError: string | null = null;

  $: fileType = getFileType(file);
  $: fileIcon = getFileIcon(file);
  $: formattedSize = formatFileSize(file.size);
  $: fileExtension = file.name?.split('.').pop()?.toUpperCase() || file.filetype?.toUpperCase() || 'FILE';

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    downloadError = null;

    try {
      const localPath = await downloadFileWithProgress(workspaceId, file);
      
      if (localPath) {
        // For now, just log success - we can add open functionality later
        console.log('File downloaded to:', localPath);
      } else {
        downloadError = 'Failed to download file';
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Download failed';
    } finally {
      isDownloading = false;
    }
  }

  function getFileTypeColor(type: string): string {
    const colors: Record<string, string> = {
      code: '#4a90e2',
      text: '#50a14f',
      archive: '#986801',
      document: '#0366d6',
      spreadsheet: '#22863a',
      presentation: '#e36209',
      audio: '#6f42c1',
      video: '#d73a49',
      unknown: '#586069'
    };
    return colors[type] || colors.unknown;
  }
</script>

<div class="file-preview" class:compact>
  <div class="file-container">
    <div class="file-icon-wrapper" style="--file-color: {getFileTypeColor(fileType)}">
      <div class="file-icon">
        <span class="icon-emoji">{fileIcon}</span>
        <span class="file-ext">{fileExtension}</span>
      </div>
    </div>

    <div class="file-info">
      <div class="file-name" title={file.name}>
        {file.name || file.title}
      </div>
      
      <div class="file-details">
        <span class="file-type">{file.pretty_type || fileType}</span>
        <span class="separator">•</span>
        <span class="file-size">{formattedSize}</span>
      </div>

      {#if !compact}
        <div class="file-actions">
          <button 
            class="action-button download"
            on:click={handleDownload}
            disabled={isDownloading}
            aria-label="Download {file.name}"
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
              {isDownloading ? 'Downloading...' : 'Download'}
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
  .file-preview {
    width: 100%;
  }

  .file-preview.compact {
    display: inline-flex;
  }

  .file-container {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    transition: all 0.2s ease;
  }

  .compact .file-container {
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .file-container:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .file-icon-wrapper {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }

  .compact .file-icon-wrapper {
    width: 40px;
    height: 40px;
  }

  .file-icon {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--color-icon-bg);
    border: 2px solid var(--file-color);
    border-radius: 0.375rem;
    position: relative;
  }

  .icon-emoji {
    font-size: 1.5rem;
    line-height: 1;
  }

  .compact .icon-emoji {
    font-size: 1rem;
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

  .file-type {
    text-transform: capitalize;
  }

  .separator {
    opacity: 0.5;
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
    padding: 0.25rem 0.625rem;
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

  .icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }

  .icon.spinner {
    animation: spin 1s linear infinite;
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