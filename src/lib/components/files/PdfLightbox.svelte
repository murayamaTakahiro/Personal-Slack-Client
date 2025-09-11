<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize } from '$lib/api/files';
  import { createFileDataUrl } from '$lib/api/files';
  import PdfRenderer from './PdfRenderer.svelte';
  
  export let file: SlackFile;
  export let onClose: () => void;
  
  let pdfRenderer: PdfRenderer;
  let currentPage = 1;
  let totalPages = 0;
  let scale = 1.0;
  let pdfUrl: string | null = null;
  let isLoading = true;
  let error: string | null = null;
  
  $: formattedSize = formatFileSize(file.size);
  $: pageInfo = totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : '';
  
  // Watch for file changes and reload PDF URL
  $: if (file && file.url_private) {
    loadPdfUrl();
  }
  
  onMount(async () => {
    // Use capture phase to intercept events before they reach other handlers
    document.addEventListener('keydown', handleKeydown, true);
  });
  
  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown, true);
  });
  
  async function loadPdfUrl() {
    isLoading = true;
    error = null;
    
    // Reset page number when loading a new PDF
    currentPage = 1;
    totalPages = 0;
    
    try {
      if (file.url_private) {
        // For PDF.js, we pass the original URL, not a data URL
        // The PdfRenderer component will handle authentication
        pdfUrl = file.url_private;
        console.log('[PdfLightbox] Loading new PDF URL:', pdfUrl, 'for file:', file.name);
      } else {
        throw new Error('No PDF URL available');
      }
    } catch (err) {
      console.error('Failed to load PDF URL:', err);
      error = err instanceof Error ? err.message : 'Failed to load PDF';
    } finally {
      isLoading = false;
    }
  }
  
  function handleKeydown(event: KeyboardEvent) {
    // Stop propagation for all handled keys to prevent message list navigation
    const handledKeys = ['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'k', 'h', 'l', '0', '+', '=', '-'];
    
    if (handledKeys.includes(event.key) || 
        (event.key === 'j' || event.key === 'k' || event.key === 'h' || event.key === 'l')) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
      case 'h':
        prevPage();
        break;
      case 'ArrowRight':
      case 'l':
        nextPage();
        break;
      case 'ArrowUp':
      case 'k':
        zoomIn();
        break;
      case 'ArrowDown':
      case 'j':
        zoomOut();
        break;
      case '0':
        if (event.ctrlKey || event.metaKey) {
          resetZoom();
        }
        break;
      case '+':
      case '=':
        if (event.ctrlKey || event.metaKey) {
          zoomIn();
        }
        break;
      case '-':
        if (event.ctrlKey || event.metaKey) {
          zoomOut();
        }
        break;
    }
  }
  
  function nextPage() {
    if (pdfRenderer && currentPage < totalPages) {
      currentPage++;
      pdfRenderer.nextPage();
    }
  }
  
  function prevPage() {
    if (pdfRenderer && currentPage > 1) {
      currentPage--;
      pdfRenderer.prevPage();
    }
  }
  
  function zoomIn() {
    if (pdfRenderer) {
      scale = Math.min(scale * 1.2, 3);
      pdfRenderer.zoomIn();
    }
  }
  
  function zoomOut() {
    if (pdfRenderer) {
      scale = Math.max(scale * 0.8, 0.5);
      pdfRenderer.zoomOut();
    }
  }
  
  function resetZoom() {
    if (pdfRenderer) {
      scale = 1.0;
      pdfRenderer.resetZoom();
    }
  }
  
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
  
  function updateTotalPages(event: CustomEvent) {
    totalPages = event.detail;
  }
</script>

<div class="pdf-lightbox" transition:fade={{ duration: 200 }} on:click={handleBackdropClick}>
  <div class="lightbox-header">
    <div class="header-info">
      <h3>{file.name || file.title}</h3>
      <span class="file-size">{formattedSize}</span>
      {#if pageInfo}
        <span class="page-info">{pageInfo}</span>
      {/if}
    </div>
    
    <div class="header-controls">
      <div class="zoom-controls">
        <button
          class="control-button"
          on:click={zoomOut}
          title="Zoom Out (Ctrl+-)"
          aria-label="Zoom Out"
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none"/>
            <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="2"/>
            <line x1="13" y1="13" x2="17" y2="17" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <span class="zoom-level">{Math.round(scale * 100)}%</span>
        <button
          class="control-button"
          on:click={zoomIn}
          title="Zoom In (Ctrl++)"
          aria-label="Zoom In"
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none"/>
            <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="2"/>
            <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" stroke-width="2"/>
            <line x1="13" y1="13" x2="17" y2="17" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button
          class="control-button"
          on:click={resetZoom}
          title="Reset Zoom (Ctrl+0)"
          aria-label="Reset Zoom"
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <text x="10" y="14" text-anchor="middle" font-size="12" fill="currentColor">100%</text>
          </svg>
        </button>
      </div>
      
      <button
        class="close-button"
        on:click={onClose}
        title="Close (Esc)"
        aria-label="Close"
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  </div>
  
  <div class="lightbox-content">
    {#if isLoading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading PDF...</p>
      </div>
    {:else if error}
      <div class="error">
        <svg width="48" height="48" viewBox="0 0 48 48">
          <path fill="currentColor" d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm2 30h-4v-4h4v4zm0-8h-4V14h4v12z"/>
        </svg>
        <p>{error}</p>
      </div>
    {:else if pdfUrl}
      <PdfRenderer
        bind:this={pdfRenderer}
        url={pdfUrl}
        bind:pageNumber={currentPage}
        bind:scale
        mimeType={file.mimetype || 'application/pdf'}
        on:totalPages={updateTotalPages}
        renderText={true}
        maxWidth={window.innerWidth * 0.9}
        maxHeight={window.innerHeight * 0.8}
        fitToViewport={true}
      />
    {/if}
  </div>
  
  {#if totalPages > 1 && !isLoading && !error}
    <div class="page-navigation">
      <button
        class="nav-button"
        on:click={prevPage}
        disabled={currentPage <= 1}
        title="Previous Page (←)"
        aria-label="Previous Page"
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
      
      <div class="page-input">
        <input
          type="number"
          bind:value={currentPage}
          min="1"
          max={totalPages}
          on:change={() => {
            currentPage = Math.max(1, Math.min(currentPage, totalPages));
          }}
        />
        <span>/ {totalPages}</span>
      </div>
      
      <button
        class="nav-button"
        on:click={nextPage}
        disabled={currentPage >= totalPages}
        title="Next Page (→)"
        aria-label="Next Page"
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .pdf-lightbox {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }
  
  .lightbox-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .header-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: white;
  }
  
  .header-info h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
  }
  
  .file-size,
  .page-info {
    font-size: 0.875rem;
    opacity: 0.8;
  }
  
  .header-controls {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  
  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .zoom-level {
    color: white;
    font-size: 0.875rem;
    min-width: 3rem;
    text-align: center;
  }
  
  .control-button,
  .close-button,
  .nav-button {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.25rem;
    transition: background 0.2s;
  }
  
  .control-button:hover,
  .close-button:hover,
  .nav-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .lightbox-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 2rem;
    min-height: 0; /* Fix for flex container */
    position: relative;
  }
  
  /* Ensure PdfRenderer takes available space */
  .lightbox-content :global(.pdf-renderer) {
    width: 100%;
    height: 100%;
    max-width: 90vw;
    max-height: 80vh;
  }
  
  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: white;
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .page-navigation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .page-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: white;
  }
  
  .page-input input {
    width: 4rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.25rem;
    color: white;
    text-align: center;
    font-size: 0.875rem;
  }
  
  .page-input input:focus {
    outline: none;
    border-color: var(--color-primary);
  }
  
  .page-input span {
    font-size: 0.875rem;
  }
</style>