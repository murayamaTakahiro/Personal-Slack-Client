<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { FileMetadata } from '$lib/services/fileService';
  import { downloadFile } from '$lib/api/files';
  import { formatFileSize } from '$lib/api/files';
  import { activeWorkspace } from '$lib/stores/workspaces';
  import LightboxHelp from './LightboxHelp.svelte';

  export let file: FileMetadata;
  export let allFiles: FileMetadata[] = [];
  export let currentIndex: number = 0;
  export let onClose: () => void;
  export let onNext: () => void;
  export let onPrevious: () => void;

  let imageElement: HTMLImageElement;
  let containerElement: HTMLDivElement;
  let isZoomed = false;
  let zoomLevel = 1;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let translateX = 0;
  let translateY = 0;
  let isDownloading = false;
  let downloadError: string | null = null;
  let isLoadingFullImage = false;
  let fullImageUrl: string | null = null;
  let imageLoadError = false;
  let scrollPosition = 0;
  let maxScroll = 0;
  let scrollSpeed = 50; // pixels per key press
  let showHelp = false;

  $: hasNext = currentIndex < allFiles.length - 1;
  $: hasPrevious = currentIndex > 0;
  $: isImage = file.type === 'image';
  $: isPdf = file.type === 'pdf';
  // For lightbox, prioritize full size image (downloadUrl) over thumbnail
  $: displayUrl = fullImageUrl || file.downloadUrl || file.thumbnailUrl;
  
  // Reload full image when file changes
  $: if (file && isImage) {
    fullImageUrl = null;
    loadFullImage();
  }

  function handleKeydown(event: KeyboardEvent) {
    // Prevent default behavior for navigation keys
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'j', 'k', 'h', 'l'];
    if (navigationKeys.includes(event.key)) {
      event.preventDefault();
    }
    
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
      case 'h':
        if (hasPrevious) onPrevious();
        break;
      case 'ArrowRight': 
      case 'l':
        if (hasNext) onNext();
        break;
      case 'Tab':
        if (event.shiftKey) {
          // Shift+Tab - previous image
          if (hasPrevious) onPrevious();
        } else {
          // Tab - next image
          if (hasNext) onNext();
        }
        break;
      case 'ArrowUp':
      case 'k':
        scrollUp();
        break;
      case 'ArrowDown':
      case 'j':
        scrollDown();
        break;
      case 'Home':
        scrollToTop();
        break;
      case 'End':
        scrollToBottom();
        break;
      case 'PageUp':
        scrollPageUp();
        break;
      case 'PageDown':
        scrollPageDown();
        break;
      case '+':
      case '=':
        zoomIn();
        break;
      case '-':
        zoomOut();
        break;
      case '0':
        resetZoom();
        break;
      case '?':
        // Show help (optional - could trigger a help overlay)
        showKeyboardHelp();
        break;
    }
  }
  
  function scrollUp() {
    if (!isImage || !imageElement) return;
    
    const container = imageElement.parentElement;
    if (container) {
      container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
    }
  }
  
  function scrollDown() {
    if (!isImage || !imageElement) return;
    
    const container = imageElement.parentElement;
    if (container) {
      container.scrollTop = Math.min(
        container.scrollHeight - container.clientHeight,
        container.scrollTop + scrollSpeed
      );
    }
  }
  
  function scrollPageUp() {
    if (!isImage || !imageElement) return;
    
    const container = imageElement.parentElement;
    if (container) {
      container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight);
    }
  }
  
  function scrollPageDown() {
    if (!isImage || !imageElement) return;
    
    const container = imageElement.parentElement;
    if (container) {
      container.scrollTop = Math.min(
        container.scrollHeight - container.clientHeight,
        container.scrollTop + container.clientHeight
      );
    }
  }
  
  function scrollToTop() {
    if (!isImage || !imageElement) return;
    
    const container = imageElement.parentElement;
    if (container) {
      container.scrollTop = 0;
    }
  }
  
  function scrollToBottom() {
    if (!isImage || !imageElement) return;
    
    const container = imageElement.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight - container.clientHeight;
    }
  }
  
  function showKeyboardHelp() {
    showHelp = !showHelp;
  }

  function handleWheel(event: WheelEvent) {
    if (!isImage) return;
    
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.5, Math.min(5, zoomLevel + delta));
    setZoom(newZoom);
  }

  function setZoom(level: number) {
    zoomLevel = level;
    isZoomed = level > 1;
    
    if (level === 1) {
      translateX = 0;
      translateY = 0;
    }
  }

  function zoomIn() {
    setZoom(Math.min(5, zoomLevel + 0.5));
  }

  function zoomOut() {
    setZoom(Math.max(0.5, zoomLevel - 0.5));
  }

  function resetZoom() {
    setZoom(1);
  }

  function toggleZoom() {
    if (isZoomed) {
      resetZoom();
    } else {
      setZoom(2);
    }
  }

  function handleMouseDown(event: MouseEvent) {
    if (!isZoomed || !isImage) return;
    
    isDragging = true;
    dragStartX = event.clientX - translateX;
    dragStartY = event.clientY - translateY;
    event.preventDefault();
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDragging) return;
    
    translateX = event.clientX - dragStartX;
    translateY = event.clientY - dragStartY;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  async function downloadFullFile() {
    if (!$activeWorkspace || isDownloading) return;
    
    isDownloading = true;
    downloadError = null;
    
    try {
      const localPath = await downloadFile($activeWorkspace.id, file.file);
      
      if (localPath) {
        // Create a download link
        const link = document.createElement('a');
        link.href = `file://${localPath}`;
        link.download = file.file.name;
        link.click();
      } else {
        downloadError = 'Failed to download file';
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Download failed';
    } finally {
      isDownloading = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === containerElement) {
      onClose();
    }
  }

  async function loadFullImage() {
    if (!isImage || !file.file.url_private) return;
    
    isLoadingFullImage = true;
    imageLoadError = false;
    
    console.log('[Lightbox] Loading full image:', {
      name: file.file.name,
      url_private: file.file.url_private,
      size: file.file.size
    });
    
    try {
      // For Slack images, fetch with authentication and convert to data URL
      if (file.file.url_private.startsWith('https://files.slack.com')) {
        const { createFileDataUrl } = await import('$lib/api/files');
        const dataUrl = await createFileDataUrl(
          file.file.url_private, 
          file.file.mimetype || 'image/jpeg'
        );
        fullImageUrl = dataUrl;
        console.log('[Lightbox] Successfully loaded full image as data URL');
      } else {
        // Non-Slack URL or local file
        fullImageUrl = file.file.url_private;
      }
    } catch (error) {
      console.error('[Lightbox] Failed to load full image:', error);
      imageLoadError = true;
      // Fall back to thumbnail if available
      fullImageUrl = null;
    } finally {
      isLoadingFullImage = false;
    }
  }

  function handleImageLoad() {
    console.log('[Lightbox] Image loaded successfully');
    imageLoadError = false;
  }

  function handleImageError() {
    console.error('[Lightbox] Image failed to load');
    imageLoadError = true;
    // Try to fall back to thumbnail
    if (fullImageUrl && file.thumbnailUrl) {
      fullImageUrl = null; // This will trigger reactive update to use thumbnailUrl
    }
  }

  onMount(async () => {
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.overflow = 'hidden';
    
    // Load full image if it's an image file
    if (isImage) {
      await loadFullImage();
    }
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.overflow = '';
  });
</script>

<div 
  class="lightbox-backdrop"
  bind:this={containerElement}
  on:click={handleBackdropClick}
  on:wheel={handleWheel}
  transition:fade={{ duration: 200 }}
>
  <div class="lightbox-container" transition:scale={{ duration: 200, start: 0.9 }}>
    <!-- Header -->
    <div class="lightbox-header">
      <div class="file-info">
        <h3 class="file-name">{file.file.name || file.file.title}</h3>
        <div class="file-meta">
          <span>{file.displaySize}</span>
          {#if file.file.original_w && file.file.original_h}
            <span class="separator">•</span>
            <span>{file.file.original_w}×{file.file.original_h}</span>
          {/if}
          <span class="separator">•</span>
          <span>{file.file.pretty_type}</span>
        </div>
      </div>
      
      <div class="lightbox-actions">
        {#if isImage}
          <button 
            class="action-btn"
            on:click={zoomOut}
            title="Zoom out (-)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/>
              <line x1="14" y1="14" x2="17" y2="17" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          
          <span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
          
          <button 
            class="action-btn"
            on:click={zoomIn}
            title="Zoom in (+)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/>
              <line x1="9" y1="5" x2="9" y2="13" stroke="currentColor" stroke-width="1.5"/>
              <line x1="14" y1="14" x2="17" y2="17" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          
          <button 
            class="action-btn"
            on:click={resetZoom}
            title="Reset zoom (0)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <text x="10" y="14" text-anchor="middle" font-size="12" fill="currentColor">1:1</text>
            </svg>
          </button>
          
          <div class="separator-vertical"></div>
        {/if}
        
        <button 
          class="action-btn"
          on:click={downloadFullFile}
          disabled={isDownloading}
          title="Download">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path fill="currentColor" d="M10 14L6 10h2.5V4h3v6H14l-4 4zm-7 3v1h14v-1H3z"/>
          </svg>
        </button>
        
        <button 
          class="action-btn close-btn"
          on:click={onClose}
          title="Close (Esc)">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path fill="currentColor" d="M14.95 5.05a.75.75 0 00-1.06 0L10 8.94 6.11 5.05a.75.75 0 00-1.06 1.06L8.94 10l-3.89 3.89a.75.75 0 101.06 1.06L10 11.06l3.89 3.89a.75.75 0 001.06-1.06L11.06 10l3.89-3.89a.75.75 0 000-1.06z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="lightbox-content">
      {#if isImage}
        <div 
          class="image-wrapper"
          class:zoomed={isZoomed}
          class:dragging={isDragging}
          on:mousedown={handleMouseDown}
          on:dblclick={toggleZoom}
        >
          {#if isLoadingFullImage}
            <div class="loading-indicator">
              <div class="spinner"></div>
              <p>Loading full resolution image...</p>
            </div>
          {/if}
          <img
            bind:this={imageElement}
            src={displayUrl}
            alt={file.file.name}
            class="lightbox-image"
            class:loading={isLoadingFullImage}
            style="transform: scale({zoomLevel}) translate({translateX / zoomLevel}px, {translateY / zoomLevel}px)"
            on:load={handleImageLoad}
            on:error={handleImageError}
          />
          {#if imageLoadError && !isLoadingFullImage}
            <div class="error-overlay">
              <svg class="error-icon" width="48" height="48" viewBox="0 0 48 48">
                <path fill="currentColor" d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm2 30h-4v-4h4v4zm0-8h-4V14h4v12z"/>
              </svg>
              <p>Failed to load full resolution image</p>
              <p class="error-hint">Showing thumbnail instead</p>
            </div>
          {/if}
        </div>
      {:else if isPdf}
        <div class="pdf-preview">
          {#if file.file.thumb_pdf}
            <img src={file.file.thumb_pdf} alt={file.file.name} class="pdf-thumbnail" />
          {/if}
          <div class="pdf-info">
            <svg class="pdf-icon" width="64" height="64" viewBox="0 0 64 64">
              <path fill="currentColor" d="M16 8h24l12 12v36c0 2.2-1.8 4-4 4H16c-2.2 0-4-1.8-4-4V12c0-2.2 1.8-4 4-4z"/>
              <path fill="white" d="M39 9v11c0 1.1.9 2 2 2h11l-13-13z"/>
              <text x="32" y="42" text-anchor="middle" fill="white" font-size="14" font-weight="bold">PDF</text>
            </svg>
            <p class="pdf-message">PDF preview not available. Click download to view the full document.</p>
          </div>
        </div>
      {:else}
        <div class="generic-preview">
          <div class="file-icon">{file.icon}</div>
          <h3>{file.file.name}</h3>
          <p class="file-type">{file.file.pretty_type}</p>
          <p class="file-size">{file.displaySize}</p>
        </div>
      {/if}
      
      {#if downloadError}
        <div class="error-message">
          {downloadError}
        </div>
      {/if}
    </div>

    <!-- Navigation -->
    {#if allFiles.length > 1}
      <div class="lightbox-navigation">
        <button 
          class="nav-btn prev"
          on:click={onPrevious}
          disabled={!hasPrevious}
          title="Previous (←)">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
        
        <div class="nav-indicator">
          {currentIndex + 1} / {allFiles.length}
        </div>
        
        <button 
          class="nav-btn next"
          on:click={onNext}
          disabled={!hasNext}
          title="Next (→)">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>
</div>

<LightboxHelp isOpen={showHelp} onClose={() => showHelp = false} />

<style>
  .lightbox-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lightbox-container {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    background: var(--color-surface);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .lightbox-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .file-info {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .separator {
    opacity: 0.5;
  }

  .lightbox-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-hover);
    color: var(--color-text-primary);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .close-btn:hover {
    background: var(--color-error-bg);
    color: var(--color-error);
  }

  .zoom-level {
    padding: 0 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    min-width: 3.5rem;
    text-align: center;
  }

  .separator-vertical {
    width: 1px;
    height: 24px;
    background: var(--color-border);
    margin: 0 0.5rem;
  }

  .lightbox-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    min-height: 400px;
  }

  .image-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    cursor: zoom-in;
    position: relative;
  }

  .image-wrapper.zoomed {
    cursor: move;
  }

  .image-wrapper.dragging {
    cursor: grabbing;
  }

  .lightbox-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease, opacity 0.3s ease;
    user-select: none;
  }
  
  .lightbox-image.loading {
    opacity: 0.5;
  }
  
  .loading-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: var(--color-text-secondary);
    z-index: 10;
  }
  
  .loading-indicator .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .error-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: var(--color-text-secondary);
    background: rgba(0, 0, 0, 0.8);
    padding: 2rem;
    border-radius: 8px;
    z-index: 10;
  }
  
  .error-overlay .error-icon {
    margin-bottom: 1rem;
    opacity: 0.7;
  }
  
  .error-overlay p {
    margin: 0.5rem 0;
  }
  
  .error-overlay .error-hint {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .pdf-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    padding: 2rem;
  }

  .pdf-thumbnail {
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .pdf-info {
    text-align: center;
  }

  .pdf-icon {
    margin-bottom: 1rem;
  }

  .pdf-message {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .generic-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    text-align: center;
  }

  .file-icon {
    font-size: 4rem;
  }

  .file-type {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
  }

  .file-size {
    color: var(--color-text-secondary);
    font-size: 0.75rem;
  }

  .error-message {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.5rem 1rem;
    background: var(--color-error-bg);
    color: var(--color-error);
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .lightbox-navigation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .nav-btn {
    padding: 0.5rem;
    background: var(--color-button-bg);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--color-hover);
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-indicator {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-hover: rgba(255, 255, 255, 0.08);
    --color-button-bg: transparent;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-primary: #1264a3;
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-hover: rgba(0, 0, 0, 0.05);
    --color-button-bg: transparent;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-primary: #1264a3;
  }
</style>