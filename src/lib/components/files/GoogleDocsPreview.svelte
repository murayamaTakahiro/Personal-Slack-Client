<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { getBestThumbnailUrl, formatFileSize } from '$lib/api/files';
  import { filePreviewStore } from '$lib/stores/filePreview';
  import { processFileMetadata } from '$lib/services/fileService';
  import { replaceExternalPlaceholder, generateErrorPlaceholder } from '$lib/utils/placeholder';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;
  export let maxWidth: number = 360;
  export let maxHeight: number = 240;

  let imageElement: HTMLImageElement;
  let isLoading = true;
  let hasError = false;
  let displayUrl: string | undefined;

  $: isGoogleSheets = file.url_private?.includes('spreadsheets') ||
                      file.external_type === 'gsheet' ||
                      file.external_type === 'google_spreadsheet';
  $: isGoogleDocs = file.url_private?.includes('document') ||
                    file.external_type === 'gdoc' ||
                    file.external_type === 'google_document';
  $: googleAppName = isGoogleSheets ? 'Google Sheets' : 'Google Docs';
  $: googleIcon = isGoogleSheets ? '📊' : '📄';
  $: googleType = isGoogleSheets ? 'Spreadsheet' : 'Document';
  $: thumbnailUrl = getBestThumbnailUrl(file, maxWidth);
  $: formattedSize = formatFileSize(file.size);

  onMount(() => {
    loadThumbnail();
  });

  async function loadThumbnail() {
    isLoading = true;
    hasError = false;

    try {
      if (thumbnailUrl && thumbnailUrl.startsWith('https://files.slack.com')) {
        try {
          const { createFileDataUrl } = await import('$lib/api/files');
          const dataUrl = await createFileDataUrl(thumbnailUrl, file.mimetype || 'image/jpeg');
          displayUrl = dataUrl;
          await preloadImage(dataUrl);
        } catch (error) {
          console.error('[GoogleDocsPreview] Failed to fetch Slack thumbnail:', error);
          displayUrl = replaceExternalPlaceholder(thumbnailUrl, file.pretty_type || file.mimetype);
        }
      } else if (thumbnailUrl) {
        const safeUrl = replaceExternalPlaceholder(thumbnailUrl, file.pretty_type || file.mimetype);
        displayUrl = safeUrl;
        await preloadImage(safeUrl);
      }

      if (!displayUrl) {
        displayUrl = generateErrorPlaceholder(maxWidth);
        hasError = true;
      }
    } catch (error) {
      console.error('[GoogleDocsPreview] Failed to load thumbnail:', error);
      hasError = true;
      displayUrl = generateErrorPlaceholder(maxWidth);
    } finally {
      isLoading = false;
    }
  }

  async function preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (url.startsWith('data:')) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => resolve();
      img.onerror = (error) => {
        console.error('Image preload failed:', url, error);
        hasError = true;
        reject(error);
      };
      img.src = url;
    });
  }

  async function handleClick() {
    const metadata = processFileMetadata(file);
    filePreviewStore.openLightbox(metadata, [metadata]);
  }

  function handleImageError(event: Event) {
    console.warn('Thumbnail loading error:', {
      file: file.name,
      url: displayUrl,
      event
    });

    if (displayUrl && !displayUrl.startsWith('data:')) {
      displayUrl = replaceExternalPlaceholder(displayUrl, file.pretty_type || file.mimetype);
      if (!displayUrl.startsWith('data:')) {
        displayUrl = generateErrorPlaceholder(maxWidth);
      }
    } else {
      displayUrl = generateErrorPlaceholder(maxWidth);
    }

    hasError = true;
    isLoading = false;
  }
</script>

<div class="google-docs-preview" style="max-width: {maxWidth}px">
  <button
    class="preview-container"
    on:click={handleClick}
    disabled={hasError}
    aria-label="View {file.name || file.title} in {googleAppName}"
  >
    <div class="google-icon" title={googleAppName}>
      {googleIcon}
    </div>

    {#if isLoading}
      <div class="loading-placeholder" style="padding-bottom: 75%">
        <div class="spinner"></div>
      </div>
    {:else if hasError}
      <div class="error-placeholder">
        <svg class="error-icon" width="48" height="48" viewBox="0 0 48 48">
          <path fill="currentColor" d="M38 10v28H10V10h28zm0-2H10c-1.1 0-2 .9-2 2v28c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/>
          <path fill="currentColor" d="M27.5 19.5l-5 6.5-3.5-4.5-5 6.5h20z"/>
        </svg>
        <span class="error-text">Preview unavailable</span>
      </div>
    {:else}
      <img
        bind:this={imageElement}
        src={displayUrl || generateErrorPlaceholder(maxWidth)}
        alt="{file.name || file.title} - {googleType}"
        class="thumbnail-image"
        on:error={handleImageError}
        loading="lazy"
      />
    {/if}
  </button>

  {#if !compact && !hasError}
    <div class="metadata">
      <div class="file-name" title={file.name}>
        {file.name || file.title}
      </div>
      <div class="file-info">
        <span class="file-type">{googleType} in {googleAppName}</span>
        <span class="separator">•</span>
        <span class="file-size">{formattedSize}</span>
        <span class="separator">•</span>
        <span class="page-indicator">Page 1 preview</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .google-docs-preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-container {
    position: relative;
    display: block;
    width: 100%;
    background: var(--color-image-bg);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    overflow: hidden;
    cursor: pointer;
    padding: 0;
    transition: all 0.2s ease;
  }

  .preview-container:hover:not(:disabled) {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .preview-container:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .google-icon {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 32px;
    height: 32px;
    background: white;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    z-index: 10;
  }

  .loading-placeholder {
    position: relative;
    width: 100%;
    background: linear-gradient(
      135deg,
      var(--color-skeleton-base) 25%,
      var(--color-skeleton-shine) 50%,
      var(--color-skeleton-base) 75%
    );
    background-size: 400% 400%;
    animation: gradient-shift 2s ease infinite;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes gradient-shift {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--color-spinner);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    position: absolute;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-placeholder {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
    background: var(--color-error-bg);
  }

  .error-icon {
    opacity: 0.5;
  }

  .error-text {
    font-size: 0.75rem;
  }

  .thumbnail-image {
    display: block;
    width: 100%;
    height: auto;
  }

  .metadata {
    padding: 0.25rem;
  }

  .file-name {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6875rem;
    color: var(--color-text-secondary);
    margin-top: 0.125rem;
  }

  .file-type {
    color: var(--color-text-secondary);
  }

  .separator {
    opacity: 0.5;
  }

  .page-indicator {
    color: var(--color-accent);
    font-weight: 500;
  }

  :global([data-theme="dark"]) {
    --color-image-bg: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error-bg: rgba(255, 255, 255, 0.05);
    --color-skeleton-base: #2c2d2e;
    --color-skeleton-shine: #3a3b3c;
    --color-spinner: #ffffff;
    --color-accent: #58a6ff;
  }

  :global([data-theme="light"]) {
    --color-image-bg: #f8f8f8;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error-bg: rgba(0, 0, 0, 0.03);
    --color-skeleton-base: #f0f0f0;
    --color-skeleton-shine: #e0e0e0;
    --color-spinner: #1d1c1d;
    --color-accent: #0969da;
  }
</style>
