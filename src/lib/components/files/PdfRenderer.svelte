<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
  import { createFileDataUrl } from '$lib/api/files';
  
  export let url: string;
  export let pageNumber: number = 1;
  export let scale: number = 1.0;
  export let maxWidth: number | undefined = undefined;
  export let maxHeight: number | undefined = undefined;
  export let renderText: boolean = false;
  export let mimeType: string = 'application/pdf';
  
  let canvas: HTMLCanvasElement;
  let textLayer: HTMLDivElement;
  let containerDiv: HTMLDivElement;
  let pdfDoc: PDFDocumentProxy | null = null;
  let pageRendering = false;
  let pageNumPending: number | null = null;
  let currentRenderTask: any = null;
  let isLoading = true;
  let error: string | null = null;
  
  $: totalPages = pdfDoc?.numPages || 0;
  $: if (pageNumber && pdfDoc) {
    queueRenderPage(pageNumber);
  }
  $: if (scale && pdfDoc) {
    queueRenderPage(pageNumber);
  }
  
  onMount(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    loadPdf();
  });
  
  onDestroy(() => {
    if (currentRenderTask) {
      currentRenderTask.cancel();
    }
    if (pdfDoc) {
      pdfDoc.destroy();
    }
  });
  
  async function loadPdf() {
    isLoading = true;
    error = null;
    
    try {
      let pdfData: string | ArrayBuffer;
      
      if (url.startsWith('data:')) {
        // Data URL - can be loaded directly
        console.log('[PdfRenderer] Loading PDF from data URL');
        pdfData = url;
      } else if (url.startsWith('https://files.slack.com')) {
        // Slack URL - fetch through backend with authentication
        console.log('[PdfRenderer] Loading Slack PDF, fetching with auth...');
        try {
          // Convert to data URL through backend
          const dataUrl = await createFileDataUrl(url, mimeType);
          console.log('[PdfRenderer] Got data URL from backend');
          pdfData = dataUrl;
        } catch (fetchError) {
          console.error('[PdfRenderer] Failed to fetch PDF through backend:', fetchError);
          throw new Error('Failed to fetch PDF with authentication');
        }
      } else {
        // Other URLs - try to load directly
        console.log('[PdfRenderer] Loading PDF from URL:', url);
        pdfData = url;
      }
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument(pdfData);
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      console.log('[PdfRenderer] PDF loaded, pages:', totalPages);
      
      await renderPage(pageNumber);
    } catch (err) {
      console.error('[PdfRenderer] Error loading PDF:', err);
      error = err instanceof Error ? err.message : 'Failed to load PDF';
    } finally {
      isLoading = false;
    }
  }
  
  
  async function renderPage(num: number) {
    if (!pdfDoc || !canvas) return;
    
    pageRendering = true;
    
    try {
      const page: PDFPageProxy = await pdfDoc.getPage(num);
      
      let viewport = page.getViewport({ scale });
      
      // Apply max width/height constraints if specified
      if (maxWidth || maxHeight) {
        const currentWidth = viewport.width;
        const currentHeight = viewport.height;
        let newScale = scale;
        
        if (maxWidth && currentWidth > maxWidth) {
          newScale = Math.min(newScale, (maxWidth / currentWidth) * scale);
        }
        if (maxHeight && currentHeight > maxHeight) {
          newScale = Math.min(newScale, (maxHeight / currentHeight) * scale);
        }
        
        viewport = page.getViewport({ scale: newScale });
      }
      
      const context = canvas.getContext('2d');
      if (!context) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Cancel any existing render task
      if (currentRenderTask) {
        currentRenderTask.cancel();
      }
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      currentRenderTask = page.render(renderContext);
      await currentRenderTask.promise;
      
      // Render text layer if requested
      if (renderText && textLayer) {
        textLayer.innerHTML = '';
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        
        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({
          textContent,
          container: textLayer,
          viewport,
          textDivs: []
        });
      }
      
      currentRenderTask = null;
    } catch (err) {
      if (err instanceof Error && err.message !== 'Rendering cancelled') {
        console.error('Error rendering page:', err);
        error = 'Failed to render page';
      }
    } finally {
      pageRendering = false;
      
      if (pageNumPending !== null) {
        const pending = pageNumPending;
        pageNumPending = null;
        await renderPage(pending);
      }
    }
  }
  
  function queueRenderPage(num: number) {
    if (pageRendering) {
      pageNumPending = num;
    } else {
      renderPage(num);
    }
  }
  
  export function nextPage() {
    if (pageNumber < totalPages) {
      pageNumber++;
    }
  }
  
  export function prevPage() {
    if (pageNumber > 1) {
      pageNumber--;
    }
  }
  
  export function zoomIn() {
    scale = Math.min(scale * 1.2, 3);
  }
  
  export function zoomOut() {
    scale = Math.max(scale * 0.8, 0.5);
  }
  
  export function resetZoom() {
    scale = 1.0;
  }
</script>

<div class="pdf-renderer" bind:this={containerDiv}>
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
  {:else}
    <div class="canvas-container">
      <canvas bind:this={canvas}></canvas>
      {#if renderText}
        <div class="text-layer" bind:this={textLayer}></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pdf-renderer {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-pdf-bg, #f5f5f5);
    overflow: auto;
  }
  
  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--color-text-secondary);
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .canvas-container {
    position: relative;
    display: inline-block;
  }
  
  canvas {
    display: block;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .text-layer {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    opacity: 0;
    line-height: 1;
  }
  
  .text-layer :global(span) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }
  
  .text-layer :global(::selection) {
    background: rgba(0, 0, 255, 0.3);
  }
  
  :global([data-theme="dark"]) {
    --color-pdf-bg: #1a1d21;
    --color-border: #565856;
    --color-primary: #1264a3;
    --color-text-secondary: #ababad;
  }
  
  :global([data-theme="light"]) {
    --color-pdf-bg: #f5f5f5;
    --color-border: #dddddd;
    --color-primary: #1264a3;
    --color-text-secondary: #616061;
  }
</style>