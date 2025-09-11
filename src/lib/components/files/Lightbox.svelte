<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { FileMetadata } from '$lib/services/fileService';
  import { downloadFile } from '$lib/api/files';
  import { formatFileSize } from '$lib/api/files';
  import { activeWorkspace } from '$lib/stores/workspaces';
  import LightboxHelp from './LightboxHelp.svelte';
  import PdfRenderer from './PdfRenderer.svelte';

  export let file: FileMetadata;
  export let allFiles: FileMetadata[] = [];
  export let currentIndex: number = 0;
  export let onClose: () => void;
  export let onNext: () => void;
  export let onPrevious: () => void;

  let imageElement: HTMLImageElement;
  let containerElement: HTMLDivElement;
  let containerDiv: HTMLDivElement;
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
  
  // PDF-specific state
  let pdfRenderer: PdfRenderer;
  let pdfCurrentPage = 1;
  let pdfTotalPages = 0;
  let pdfScale = 1.0;
  let pdfUrl: string | null = null;
  let isPdfLoading = false;
  let pdfError: string | null = null;

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
  
  // Load PDF when file changes
  $: if (file && isPdf) {
    loadPdf();
  }

  function handleKeydown(event: KeyboardEvent) {
    // Prevent default behavior for navigation keys and stop propagation to prevent message list from capturing them
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'j', 'k', 'h', 'l'];
    if (navigationKeys.includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    
    // Handle PDF-specific navigation
    if (isPdf && pdfTotalPages > 1) {
      switch (event.key) {
        case 'ArrowLeft':
        case 'h':
          if (pdfCurrentPage > 1) {
            pdfPreviousPage();
            return;
          } else if (hasPrevious) {
            onPrevious();
            return;
          }
          break;
        case 'ArrowRight':
        case 'l':
          if (pdfCurrentPage < pdfTotalPages) {
            pdfNextPage();
            return;
          } else if (hasNext) {
            onNext();
            return;
          }
          break;
      }
    }
    
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
      case 'h':
        if (hasPrevious && !isPdf) onPrevious();
        break;
      case 'ArrowRight': 
      case 'l':
        if (hasNext && !isPdf) onNext();
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
        // Both PDF and images should scroll, not zoom
        scrollUp();
        break;
      case 'ArrowDown':
      case 'j':
        // Both PDF and images should scroll, not zoom
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
        if (isPdf) {
          pdfZoomIn();
        } else {
          zoomIn();
        }
        break;
      case '-':
        if (isPdf) {
          pdfZoomOut();
        } else {
          zoomOut();
        }
        break;
      case '0':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (isPdf) {
            pdfResetZoom();
          } else {
            resetZoom();
          }
        }
        break;
      case 'f':
      case 'F':
        // Fit to viewport (mainly for PDFs, but also resets zoom for images)
        if (isPdf && pdfRenderer) {
          pdfRenderer.fitToView();
        } else if (isImage) {
          resetZoom();
        }
        break;
      case '?':
        // Show help (optional - could trigger a help overlay)
        showKeyboardHelp();
        break;
    }
  }
  
  function scrollUp() {
    if (isPdf) {
      // For PDF, scroll the PDF container
      const pdfContainer = containerDiv?.querySelector('.pdf-content');
      if (pdfContainer) {
        pdfContainer.scrollTop = Math.max(0, pdfContainer.scrollTop - scrollSpeed);
      }
    } else if (isImage && imageElement) {
      // For images, scroll the image container
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
      }
    }
  }
  
  function scrollDown() {
    if (isPdf) {
      // For PDF, scroll the PDF container
      const pdfContainer = containerDiv?.querySelector('.pdf-content');
      if (pdfContainer) {
        pdfContainer.scrollTop = Math.min(
          pdfContainer.scrollHeight - pdfContainer.clientHeight,
          pdfContainer.scrollTop + scrollSpeed
        );
      }
    } else if (isImage && imageElement) {
      // For images, scroll the image container
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop + scrollSpeed
        );
      }
    }
  }
  
  function scrollPageUp() {
    if (isPdf) {
      // For PDF, try to go to previous page first, then scroll
      if (pdfCurrentPage > 1) {
        pdfPreviousPage();
      } else {
        const pdfContainer = containerDiv?.querySelector('.pdf-content');
        if (pdfContainer) {
          pdfContainer.scrollTop = Math.max(0, pdfContainer.scrollTop - pdfContainer.clientHeight);
        }
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight);
      }
    }
  }
  
  function scrollPageDown() {
    if (isPdf) {
      // For PDF, try to go to next page first, then scroll
      if (pdfCurrentPage < pdfTotalPages) {
        pdfNextPage();
      } else {
        const pdfContainer = containerDiv?.querySelector('.pdf-content');
        if (pdfContainer) {
          pdfContainer.scrollTop = Math.min(
            pdfContainer.scrollHeight - pdfContainer.clientHeight,
            pdfContainer.scrollTop + pdfContainer.clientHeight
          );
        }
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop + container.clientHeight
        );
      }
    }
  }
  
  function scrollToTop() {
    if (isPdf) {
      // For PDF, go to first page and scroll to top
      if (pdfCurrentPage !== 1) {
        pdfCurrentPage = 1;
        if (pdfRenderer) {
          pdfRenderer.forceRender();
        }
      }
      const pdfContainer = containerDiv?.querySelector('.pdf-content');
      if (pdfContainer) {
        pdfContainer.scrollTop = 0;
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = 0;
      }
    }
  }
  
  function scrollToBottom() {
    if (isPdf) {
      // For PDF, go to last page and scroll to bottom
      if (pdfCurrentPage !== pdfTotalPages) {
        pdfCurrentPage = pdfTotalPages;
        if (pdfRenderer) {
          pdfRenderer.forceRender();
        }
      }
      const pdfContainer = containerDiv?.querySelector('.pdf-content');
      if (pdfContainer) {
        pdfContainer.scrollTop = pdfContainer.scrollHeight - pdfContainer.clientHeight;
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight - container.clientHeight;
      }
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
  
  // PDF-specific functions
  async function loadPdf() {
    isPdfLoading = true;
    pdfError = null;
    pdfCurrentPage = 1;
    
    try {
      if (file.file.url_private) {
        pdfUrl = file.file.url_private;
        console.log('[Lightbox] Loading PDF:', pdfUrl);
      } else {
        throw new Error('No PDF URL available');
      }
    } catch (err) {
      console.error('[Lightbox] Failed to load PDF:', err);
      pdfError = err instanceof Error ? err.message : 'Failed to load PDF';
    } finally {
      isPdfLoading = false;
    }
  }
  
  function pdfNextPage() {
    if (pdfRenderer && pdfCurrentPage < pdfTotalPages) {
      pdfCurrentPage++;
      pdfRenderer.nextPage();
    }
  }
  
  function pdfPreviousPage() {
    if (pdfRenderer && pdfCurrentPage > 1) {
      pdfCurrentPage--;
      pdfRenderer.prevPage();
    }
  }
  
  function pdfZoomIn() {
    if (pdfRenderer) {
      pdfScale = Math.min(pdfScale * 1.2, 3);
      pdfRenderer.zoomIn();
    }
  }
  
  function pdfZoomOut() {
    if (pdfRenderer) {
      pdfScale = Math.max(pdfScale * 0.8, 0.5);
      pdfRenderer.zoomOut();
    }
  }
  
  function pdfResetZoom() {
    if (pdfRenderer) {
      pdfScale = 1.0;
      pdfRenderer.resetZoom();
    }
  }
  
  function updatePdfTotalPages(event: CustomEvent) {
    pdfTotalPages = event.detail;
  }

  onMount(async () => {
    // Use capture phase to intercept keyboard events before they reach message list
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.overflow = 'hidden';
    
    // Load full image if it's an image file
    if (isImage) {
      await loadFullImage();
    }
    // Load PDF if it's a PDF file
    if (isPdf) {
      await loadPdf();
    }
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown, true);
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
  <div class="lightbox-container" bind:this={containerDiv} transition:scale={{ duration: 200, start: 0.9 }}>
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
        {#if isPdf && pdfTotalPages > 0}
          <div class="page-info">
            Page {pdfCurrentPage} of {pdfTotalPages}
          </div>
          
          <div class="separator-vertical"></div>
          
          <button 
            class="action-btn"
            on:click={pdfZoomOut}
            title="Zoom out (Ctrl/-)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/>
              <line x1="14" y1="14" x2="17" y2="17" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          
          <span class="zoom-level">{Math.round(pdfScale * 100)}%</span>
          
          <button 
            class="action-btn"
            on:click={pdfZoomIn}
            title="Zoom in (Ctrl/+)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.5"/>
              <line x1="9" y1="5" x2="9" y2="13" stroke="currentColor" stroke-width="1.5"/>
              <line x1="14" y1="14" x2="17" y2="17" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
          
          <button 
            class="action-btn"
            on:click={pdfResetZoom}
            title="Reset zoom (Ctrl+0)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <text x="10" y="14" text-anchor="middle" font-size="12" fill="currentColor">100%</text>
            </svg>
          </button>
          
          <div class="separator-vertical"></div>
        {:else if isImage}
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
        <div class="pdf-content">
          {#if isPdfLoading}
            <div class="loading-indicator">
              <div class="spinner"></div>
              <p>Loading PDF...</p>
            </div>
          {:else if pdfError}
            <div class="error-overlay">
              <svg class="error-icon" width="48" height="48" viewBox="0 0 48 48">
                <path fill="currentColor" d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm2 30h-4v-4h4v4zm0-8h-4V14h4v12z"/>
              </svg>
              <p>{pdfError}</p>
            </div>
          {:else if pdfUrl}
            <PdfRenderer
              bind:this={pdfRenderer}
              url={pdfUrl}
              bind:pageNumber={pdfCurrentPage}
              bind:scale={pdfScale}
              mimeType={file.file.mimetype || 'application/pdf'}
              on:totalPages={updatePdfTotalPages}
              renderText={true}
              maxWidth={window.innerWidth * 0.95}
              maxHeight={window.innerHeight * 0.85}
              fitToViewport={true}
            />
          {/if}
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
    {#if isPdf && pdfTotalPages > 1}
      <div class="lightbox-navigation">
        <button 
          class="nav-btn prev"
          on:click={pdfPreviousPage}
          disabled={pdfCurrentPage <= 1}
          title="Previous Page (←)">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
        
        <div class="page-input-container">
          <input
            type="number"
            bind:value={pdfCurrentPage}
            min="1"
            max={pdfTotalPages}
            on:change={() => {
              pdfCurrentPage = Math.max(1, Math.min(pdfCurrentPage, pdfTotalPages));
            }}
            class="page-input"
          />
          <span class="page-separator">/ {pdfTotalPages}</span>
        </div>
        
        <button 
          class="nav-btn next"
          on:click={pdfNextPage}
          disabled={pdfCurrentPage >= pdfTotalPages}
          title="Next Page (→)">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
          </svg>
        </button>
        
        {#if allFiles.length > 1}
          <div class="separator-vertical"></div>
          
          <button 
            class="nav-btn prev"
            on:click={onPrevious}
            disabled={!hasPrevious}
            title="Previous File">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path fill="currentColor" d="M12.41 5.41L11 4l-5 5 5 5 1.41-1.41L7.83 9z"/>
            </svg>
          </button>
          
          <div class="nav-indicator">
            File {currentIndex + 1} / {allFiles.length}
          </div>
          
          <button 
            class="nav-btn next"
            on:click={onNext}
            disabled={!hasNext}
            title="Next File">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path fill="currentColor" d="M7.59 14.59L9 16l5-5-5-5-1.41 1.41L12.17 11z"/>
            </svg>
          </button>
        {/if}
      </div>
    {:else if allFiles.length > 1}
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

  .pdf-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    position: relative;
    background: #525252;
  }
  
  /* Ensure PdfRenderer fills the available space */
  .pdf-content :global(.pdf-renderer) {
    width: 100%;
    height: 100%;
  }
  
  .page-info {
    padding: 0 0.75rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
  }
  
  .page-input-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .page-input {
    width: 4rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    text-align: center;
    font-size: 0.875rem;
  }
  
  .page-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }
  
  .page-separator {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
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
    white-space: nowrap;
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