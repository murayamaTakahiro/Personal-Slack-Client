<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { getBestThumbnailUrl, formatFileSize } from '$lib/api/files';
  import { filePreviewStore } from '$lib/stores/filePreview';
  import { processFileMetadata } from '$lib/services/fileService';

  export let file: SlackFile;
  export let workspaceId: string;
  export let showMetadata: boolean = true;
  export let maxWidth: number = 360;
  export let maxHeight: number = 240;

  let imageElement: HTMLImageElement;
  let isLoading = true;
  let hasError = false;
  let imageUrl: string | undefined;
  let displayUrl: string | undefined;
  let isDownloading = false;
  let progress = 0;

  $: thumbnailUrl = getBestThumbnailUrl(file, maxWidth);
  $: formattedSize = formatFileSize(file.size);
  $: dimensions = file.original_w && file.original_h 
    ? `${file.original_w}×${file.original_h}` 
    : null;

  onMount(() => {
    loadImage();
  });

  async function loadImage() {
    isLoading = true;
    hasError = false;

    // First try to use thumbnail
    if (thumbnailUrl) {
      displayUrl = thumbnailUrl;
      await preloadImage(thumbnailUrl);
    }

    // For small images, load full size immediately
    if (file.size < 500000 && file.url_private) { // < 500KB
      imageUrl = file.url_private;
      displayUrl = file.url_private;
      await preloadImage(file.url_private);
    }

    isLoading = false;
  }

  async function preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => {
        hasError = true;
        reject();
      };
      img.src = url;
    });
  }

  async function handleClick() {
    // Open in lightbox
    const metadata = processFileMetadata(file);
    filePreviewStore.openLightbox(metadata, [metadata]);
  }

  function handleImageError() {
    hasError = true;
    isLoading = false;
  }
</script>

<div class="image-preview" style="max-width: {maxWidth}px">
  <button 
    class="image-container"
    on:click={handleClick}
    disabled={hasError}
    aria-label="View {file.name || file.title}"
  >
    {#if isLoading}
      <div class="loading-placeholder" style="padding-bottom: {getAspectRatio()}%">
        <div class="spinner"></div>
      </div>
    {:else if hasError}
      <div class="error-placeholder">
        <svg class="error-icon" width="48" height="48" viewBox="0 0 48 48">
          <path fill="currentColor" d="M38 10v28H10V10h28zm0-2H10c-1.1 0-2 .9-2 2v28c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/>
          <path fill="currentColor" d="M27.5 19.5l-5 6.5-3.5-4.5-5 6.5h20z"/>
        </svg>
        <span class="error-text">Failed to load image</span>
      </div>
    {:else}
      <img
        bind:this={imageElement}
        src={displayUrl}
        alt={file.name || file.title}
        class="preview-image"
        class:blur={isDownloading}
        on:error={handleImageError}
        loading="lazy"
      />
      {#if isDownloading}
        <div class="download-overlay">
          <div class="progress-bar" style="width: {progress}%"></div>
        </div>
      {/if}
    {/if}
  </button>

  {#if showMetadata && !hasError}
    <div class="image-metadata">
      <div class="file-name" title={file.name}>
        {file.name || file.title}
      </div>
      <div class="file-info">
        <span class="file-size">{formattedSize}</span>
        {#if dimensions}
          <span class="separator">•</span>
          <span class="file-dimensions">{dimensions}</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<script lang="ts" context="module">
  function getAspectRatio(): number {
    // Default aspect ratio for loading placeholder
    return 75; // 4:3 aspect ratio
  }
</script>

<style>
  .image-preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .image-container {
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

  .image-container:hover:not(:disabled) {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .image-container:disabled {
    cursor: not-allowed;
    opacity: 0.7;
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

  .preview-image {
    display: block;
    width: 100%;
    height: auto;
    transition: filter 0.3s ease;
  }

  .preview-image.blur {
    filter: blur(2px);
  }

  .download-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.2);
  }

  .progress-bar {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.3s ease;
  }

  .image-metadata {
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

  .separator {
    opacity: 0.5;
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
    --color-primary: #1264a3;
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
    --color-primary: #1264a3;
  }
</style>