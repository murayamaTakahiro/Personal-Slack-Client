<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize, createFileDataUrl } from '$lib/api/files';
  import { downloadFile } from '$lib/api/files';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isDownloading = false;
  let downloadProgress = 0;
  let downloadError: string | null = null;
  let thumbnailDataUrl: string | null = null;
  let isLoadingThumbnail = true;
  let thumbnailError = false;

  $: formattedSize = formatFileSize(file.size);
  $: pageInfo = file.lines ? `${file.lines} page${file.lines !== 1 ? 's' : ''}` : null;
  $: thumbnailUrl = file.thumb_pdf || file.thumb_360 || file.thumb_160;

  onMount(async () => {
    console.log('[PdfPreview] Component mounted with file:', {
      id: file.id,
      name: file.name,
      mimetype: file.mimetype,
      thumb_pdf: file.thumb_pdf,
      url_private: file.url_private
    });
    
    await loadThumbnail();
  });

  async function loadThumbnail() {
    isLoadingThumbnail = true;
    thumbnailError = false;
    
    try {
      if (thumbnailUrl && thumbnailUrl.startsWith('https://files.slack.com')) {
        console.log('[PdfPreview] Loading Slack thumbnail with auth:', thumbnailUrl);
        thumbnailDataUrl = await createFileDataUrl(thumbnailUrl, 'image/png');
        console.log('[PdfPreview] Thumbnail data URL created successfully, length:', thumbnailDataUrl?.length);
      } else if (thumbnailUrl) {
        console.log('[PdfPreview] Using non-Slack thumbnail URL:', thumbnailUrl);
        thumbnailDataUrl = thumbnailUrl;
      } else {
        console.log('[PdfPreview] No thumbnail URL available');
        thumbnailError = true;
      }
    } catch (error) {
      console.error('[PdfPreview] Failed to load thumbnail:', error);
      // Retry once after a short delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        console.log('[PdfPreview] Retrying thumbnail load...');
        if (thumbnailUrl && thumbnailUrl.startsWith('https://files.slack.com')) {
          thumbnailDataUrl = await createFileDataUrl(thumbnailUrl, 'image/png');
          console.log('[PdfPreview] Retry successful!');
        }
      } catch (retryError) {
        console.error('[PdfPreview] Retry also failed:', retryError);
        thumbnailError = true;
        thumbnailDataUrl = null;
      }
    } finally {
      isLoadingThumbnail = false;
    }
  }

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    downloadError = null;
    downloadProgress = 0;

    try {
      const localPath = await downloadFile(
        workspaceId, 
        file.id, 
        file.url_private_download || file.url_private, 
        file.name
      );
      
      if (localPath.success && localPath.localPath) {
        console.log('PDF downloaded to:', localPath.localPath);
      } else {
        downloadError = localPath.error || 'Failed to download PDF';
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Download failed';
    } finally {
      isDownloading = false;
      downloadProgress = 0;
    }
  }

  async function handlePreviewClick() {
    console.log('[PdfPreview] Preview clicked, opening PDF...');
    if (file.url_private) {
      try {
        // First try to download and open as blob URL for better compatibility
        console.log('[PdfPreview] Fetching PDF data...');
        const dataUrl = await createFileDataUrl(file.url_private, file.mimetype || 'application/pdf');
        
        // Convert data URL to blob for better browser compatibility
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        console.log('[PdfPreview] Opening PDF in new window');
        const newWindow = window.open(blobUrl, '_blank');
        
        // Clean up blob URL after a delay
        if (newWindow) {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        } else {
          // Fallback: try direct download
          console.log('[PdfPreview] Popup blocked, triggering download');
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = file.name || 'document.pdf';
          a.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }
      } catch (error) {
        console.error('[PdfPreview] Failed to open PDF:', error);
        // Fallback to download
        await handleDownload();
      }
    }
  }
</script>

<div class="pdf-preview" class:compact>
  <div class="pdf-container">
    {#if !compact}
      <button 
        class="pdf-thumbnail clickable"
        on:click={handlePreviewClick}
        aria-label="Open PDF"
        title="Click to open PDF"
      >
        {#if isLoadingThumbnail}
          <div class="preview-loading">
            <div class="spinner"></div>
            <span>Loading...</span>
          </div>
        {:else if thumbnailDataUrl}
          <img 
            src={thumbnailDataUrl} 
            alt="{file.name} preview"
            class="thumbnail-image"
            on:error={() => {
              console.error('[PdfPreview] Image failed to load');
              thumbnailError = true;
            }}
          />
        {:else}
          <div class="pdf-icon-wrapper">
            <svg class="pdf-icon" width="64" height="64" viewBox="0 0 64 64">
              <path fill="#dc2626" d="M16 8h24l12 12v36c0 2.2-1.8 4-4 4H16c-2.2 0-4-1.8-4-4V12c0-2.2 1.8-4 4-4z"/>
              <path fill="white" d="M39 9v11c0 1.1.9 2 2 2h11l-13-13z"/>
              <text x="32" y="44" text-anchor="middle" fill="white" font-size="14" font-weight="bold">PDF</text>
            </svg>
          </div>
        {/if}
      </button>
    {:else}
      <div class="pdf-icon-container compact">
        <svg class="pdf-file-icon" width="32" height="32" viewBox="0 0 32 32">
          <path fill="#dc2626" d="M8 4h12l6 6v18c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <path fill="white" d="M19 5v5c0 .55.45 1 1 1h5l-6-6z"/>
          <text x="16" y="22" text-anchor="middle" fill="white" font-size="7" font-weight="bold">PDF</text>
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
    width: 200px;
    height: 260px;
    flex-shrink: 0;
    border-radius: 0.25rem;
    overflow: hidden;
    background: var(--color-pdf-bg);
    border: 1px solid var(--color-border);
    padding: 0;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pdf-thumbnail.clickable:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .pdf-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .pdf-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    flex-shrink: 0;
  }

  .pdf-icon-container.compact {
    width: 40px;
  }

  .pdf-file-icon {
    width: 100%;
    height: auto;
  }

  .preview-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-icon {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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

  .download-icon {
    flex-shrink: 0;
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