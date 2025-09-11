<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
  import { createFileDataUrl } from '$lib/api/files';
  
  export let url: string;
  export let pageNumber: number = 1;
  export let scale: number = 1.0;
  export let maxWidth: number | undefined = undefined;
  export let maxHeight: number | undefined = undefined;
  export let renderText: boolean = false;
  export let mimeType: string = 'application/pdf';
  export let fitToViewport: boolean = true; // New prop to enable auto-fit
  
  const dispatch = createEventDispatcher();
  
  let canvas: HTMLCanvasElement;
  let textLayer: HTMLDivElement;
  let containerDiv: HTMLDivElement;
  let pdfDoc: PDFDocumentProxy | null = null;
  let currentRenderTask: RenderTask | null = null;
  let isLoading = true;
  let error: string | null = null;
  let isMounted = false;
  let initialScaleCalculated = false;
  
  // Render queue management
  let renderQueue: { pageNum: number; scale: number } | null = null;
  let isRendering = false;
  let renderDebounceTimer: NodeJS.Timeout | null = null;
  let lastRenderedPage: number = 0;
  let lastRenderedScale: number = 0;
  
  $: totalPages = pdfDoc?.numPages || 0;
  
  // Watch for URL changes and reload PDF when URL changes
  let currentUrl = '';
  $: if (url && url !== currentUrl && isMounted) {
    console.log('[PdfRenderer] URL changed from', currentUrl, 'to', url);
    currentUrl = url;
    handleUrlChange();
  }
  
  // Use a single reactive statement with proper debouncing
  $: if (isMounted && !isLoading && pdfDoc && canvas && (pageNumber !== lastRenderedPage || scale !== lastRenderedScale)) {
    scheduleRender(pageNumber, scale);
  }
  
  onMount(async () => {
    isMounted = true;
    
    // Set PDF.js worker with proper configuration for v5
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    console.log('[PdfRenderer] Component mounted, worker src set to:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    
    // Verify PDF.js is loaded
    console.log('[PdfRenderer] PDF.js version:', pdfjsLib.version);
    
    // Set current URL and load PDF
    currentUrl = url;
    await loadPdf();
  });
  
  async function handleUrlChange() {
    console.log('[PdfRenderer] Handling URL change, cleaning up current PDF');
    
    // Clear any pending render timers
    if (renderDebounceTimer) {
      clearTimeout(renderDebounceTimer);
      renderDebounceTimer = null;
    }
    
    // Cancel current render task
    if (currentRenderTask) {
      try {
        currentRenderTask.cancel();
        console.log('[PdfRenderer] Cancelled render task for URL change');
      } catch (e) {
        // Ignore cancellation errors
      }
      currentRenderTask = null;
    }
    
    // Clear render queue
    renderQueue = null;
    isRendering = false;
    
    // Reset last rendered values to force re-render after loading
    lastRenderedPage = 0;
    lastRenderedScale = 0;
    
    // Reset initial scale calculation flag
    initialScaleCalculated = false;
    
    // Destroy existing PDF document
    if (pdfDoc) {
      try {
        pdfDoc.destroy();
        console.log('[PdfRenderer] Destroyed previous PDF document');
      } catch (e) {
        console.error('[PdfRenderer] Error destroying PDF document:', e);
      }
      pdfDoc = null;
    }
    
    // Clear canvas
    if (canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    
    // Load the new PDF
    await loadPdf();
  }
  
  onDestroy(() => {
    isMounted = false;
    
    // Clear any pending render timers
    if (renderDebounceTimer) {
      clearTimeout(renderDebounceTimer);
      renderDebounceTimer = null;
    }
    
    // Cancel current render task
    if (currentRenderTask) {
      try {
        currentRenderTask.cancel();
        console.log('[PdfRenderer] Cancelled render task on destroy');
      } catch (e) {
        // Ignore cancellation errors
      }
      currentRenderTask = null;
    }
    
    // Destroy PDF document
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }
  });
  
  async function calculateInitialScale(): Promise<number | null> {
    if (!pdfDoc || !maxWidth || !maxHeight) return null;
    
    try {
      // Get the first page to calculate dimensions
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Calculate scale to fit width and height
      const scaleToFitWidth = maxWidth / viewport.width;
      const scaleToFitHeight = maxHeight / viewport.height;
      
      // Use the smaller scale to ensure the PDF fits both dimensions
      let optimalScale = Math.min(scaleToFitWidth, scaleToFitHeight);
      
      // For better readability, use more of the available space
      // Instead of 95%, use 98% to maximize viewport usage while keeping minimal padding
      optimalScale = optimalScale * 0.98;
      
      // Increase the minimum scale for better readability
      // Ensure scale is within reasonable bounds (0.8 minimum for readability)
      optimalScale = Math.max(0.8, Math.min(3, optimalScale));
      
      console.log('[PdfRenderer] Calculated initial scale:', {
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        maxWidth,
        maxHeight,
        scaleToFitWidth,
        scaleToFitHeight,
        optimalScale
      });
      
      return optimalScale;
    } catch (err) {
      console.error('[PdfRenderer] Error calculating initial scale:', err);
      return null;
    }
  }
  
  async function loadPdf() {
    // Prevent multiple simultaneous loads
    if (isLoading && pdfDoc) {
      console.log('[PdfRenderer] Already loading PDF, skipping duplicate load');
      return;
    }
    
    isLoading = true;
    error = null;
    
    // Cancel any existing render task before loading new PDF
    if (currentRenderTask) {
      try {
        currentRenderTask.cancel();
        console.log('[PdfRenderer] Cancelled existing render task before loading new PDF');
      } catch (e) {
        // Ignore
      }
      currentRenderTask = null;
    }
    
    // Destroy existing PDF document if any
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }
    
    try {
      let pdfData: string | ArrayBuffer | { url: string };
      
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
          console.log('[PdfRenderer] Got data URL from backend, length:', dataUrl.length);
          pdfData = dataUrl;
        } catch (fetchError) {
          console.error('[PdfRenderer] Failed to fetch PDF through backend:', fetchError);
          throw new Error('Failed to fetch PDF with authentication');
        }
      } else {
        // Other URLs - try to load directly
        console.log('[PdfRenderer] Loading PDF from URL:', url);
        pdfData = { url };
      }
      
      // Load the PDF document
      console.log('[PdfRenderer] Creating PDF document...');
      const loadingTask = pdfjsLib.getDocument(pdfData);
      
      loadingTask.onProgress = (progress: any) => {
        console.log(`[PdfRenderer] Loading progress: ${progress.loaded}/${progress.total}`);
      };
      
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      console.log('[PdfRenderer] PDF document created successfully, pages:', totalPages);
      
      // Calculate initial scale to fit viewport if enabled
      if (fitToViewport && !initialScaleCalculated && (maxWidth || maxHeight)) {
        const initialScale = await calculateInitialScale();
        if (initialScale) {
          scale = initialScale;
          initialScaleCalculated = true;
          console.log('[PdfRenderer] Set initial scale to:', scale);
        }
      }
      
      // Dispatch totalPages event
      dispatch('totalPages', totalPages);
      
      // Set isLoading to false to render the canvas element
      isLoading = false;
      
      // Wait for Svelte to update the DOM with the canvas element
      await tick();
      
      // Schedule initial render after DOM update
      if (isMounted) {
        console.log('[PdfRenderer] Scheduling initial render');
        // The reactive statement will trigger the render
        lastRenderedPage = 0;  // Force render by resetting last rendered values
        lastRenderedScale = 0;
      }
    } catch (err) {
      console.error('[PdfRenderer] Error loading PDF:', err);
      error = err instanceof Error ? err.message : 'Failed to load PDF';
      isLoading = false;
    }
  }
  
  // Debounced render scheduling to prevent multiple simultaneous renders
  function scheduleRender(pageNum: number, newScale: number) {
    console.log(`[PdfRenderer] Scheduling render for page ${pageNum}, scale ${newScale}`);
    
    // Clear any existing debounce timer
    if (renderDebounceTimer) {
      clearTimeout(renderDebounceTimer);
    }
    
    // Update the render queue
    renderQueue = { pageNum, scale: newScale };
    
    // Debounce render calls to prevent rapid re-renders
    renderDebounceTimer = setTimeout(() => {
      renderDebounceTimer = null;
      if (renderQueue && isMounted) {
        processRenderQueue();
      }
    }, 50);  // 50ms debounce
  }
  
  async function processRenderQueue() {
    if (!renderQueue || isRendering || !isMounted) {
      return;
    }
    
    const { pageNum, scale: renderScale } = renderQueue;
    renderQueue = null;
    
    // Check if we actually need to render
    if (pageNum === lastRenderedPage && renderScale === lastRenderedScale) {
      console.log(`[PdfRenderer] Skipping render - already rendered page ${pageNum} at scale ${renderScale}`);
      return;
    }
    
    await performRender(pageNum, renderScale);
  }
  
  
  async function performRender(pageNum: number, renderScale: number) {
    if (!isMounted) {
      console.log('[PdfRenderer] Component unmounted, skipping render');
      return;
    }
    
    if (!pdfDoc) {
      console.error('[PdfRenderer] No PDF document loaded');
      return;
    }
    
    if (!canvas) {
      console.error('[PdfRenderer] Canvas element not ready');
      return;
    }
    
    // Prevent concurrent renders
    if (isRendering) {
      console.log('[PdfRenderer] Already rendering, queueing request');
      scheduleRender(pageNum, renderScale);
      return;
    }
    
    isRendering = true;
    
    try {
      console.log(`[PdfRenderer] Starting to render page ${pageNum} at scale ${renderScale}`);
      
      // Cancel any existing render task before starting new one
      if (currentRenderTask) {
        try {
          console.log('[PdfRenderer] Cancelling previous render task...');
          await currentRenderTask.cancel();
        } catch (e) {
          // Ignore cancellation errors
          console.log('[PdfRenderer] Previous render task cancellation completed');
        }
        currentRenderTask = null;
      }
      
      // Check if still mounted after cancellation
      if (!isMounted) {
        console.log('[PdfRenderer] Component unmounted during render setup');
        return;
      }
      
      // Get the page
      console.log('[PdfRenderer] Getting page from PDF document...');
      const page: PDFPageProxy = await pdfDoc.getPage(pageNum);
      console.log(`[PdfRenderer] Got page ${pageNum}, creating viewport...`);
      
      // Create viewport
      let viewport = page.getViewport({ scale: renderScale });
      console.log(`[PdfRenderer] Initial viewport: ${viewport.width}x${viewport.height}, scale: ${renderScale}`);
      
      // Apply max width/height constraints if specified
      if (maxWidth || maxHeight) {
        const currentWidth = viewport.width;
        const currentHeight = viewport.height;
        let newScale = renderScale;
        
        if (maxWidth && currentWidth > maxWidth) {
          newScale = Math.min(newScale, (maxWidth / currentWidth) * renderScale);
          console.log(`[PdfRenderer] Adjusting scale for maxWidth: ${renderScale} -> ${newScale}`);
        }
        if (maxHeight && currentHeight > maxHeight) {
          newScale = Math.min(newScale, (maxHeight / currentHeight) * renderScale);
          console.log(`[PdfRenderer] Adjusting scale for maxHeight: ${renderScale} -> ${newScale}`);
        }
        
        viewport = page.getViewport({ scale: newScale });
        console.log(`[PdfRenderer] Adjusted viewport: ${viewport.width}x${viewport.height}`);
      }
      
      // Check if still mounted and canvas exists before proceeding
      if (!isMounted || !canvas) {
        console.log('[PdfRenderer] Component unmounted or canvas lost during render');
        return;
      }
      
      // Get canvas context
      console.log('[PdfRenderer] Getting canvas 2D context...');
      const context = canvas.getContext('2d');
      if (!context) {
        console.error('[PdfRenderer] Failed to get canvas 2D context');
        error = 'Failed to get canvas context';
        return;
      }
      console.log('[PdfRenderer] Got canvas context successfully');
      
      // Account for high DPI displays
      const devicePixelRatio = window.devicePixelRatio || 1;
      console.log(`[PdfRenderer] Device pixel ratio: ${devicePixelRatio}`);
      
      // Set canvas dimensions
      console.log(`[PdfRenderer] Setting canvas dimensions to ${viewport.width}x${viewport.height}...`);
      
      // Ensure viewport has valid dimensions
      if (!viewport.width || !viewport.height || viewport.width <= 0 || viewport.height <= 0) {
        console.error('[PdfRenderer] Invalid viewport dimensions:', { width: viewport.width, height: viewport.height });
        error = 'Invalid viewport dimensions';
        return;
      }
      
      // Set actual canvas size accounting for device pixel ratio
      canvas.height = Math.floor(viewport.height * devicePixelRatio);
      canvas.width = Math.floor(viewport.width * devicePixelRatio);
      
      // Set CSS size to maintain correct display size
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      
      // Scale the context to account for device pixel ratio
      context.scale(devicePixelRatio, devicePixelRatio);
      
      console.log(`[PdfRenderer] Canvas dimensions set: actual=${canvas.width}x${canvas.height}, display=${viewport.width}x${viewport.height}, dpr=${devicePixelRatio}`);
      
      // Verify canvas dimensions were actually set
      if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
        console.error('[PdfRenderer] Canvas dimensions mismatch!', {
          expected: { width: viewport.width, height: viewport.height },
          actual: { width: canvas.width, height: canvas.height }
        });
      }
      
      // Clear canvas and add test rectangle to verify canvas is working
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw a test rectangle to verify canvas is working
      context.fillStyle = '#f0f0f0';
      context.fillRect(0, 0, canvas.width, canvas.height);
      console.log('[PdfRenderer] Canvas cleared and test background drawn');
      
      // Create render context with high DPI support
      console.log('[PdfRenderer] Creating render context...');
      
      // Use the original viewport for rendering - the context scaling handles high DPI
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      console.log('[PdfRenderer] Render context created:', {
        viewport: { width: viewport.width, height: viewport.height },
        devicePixelRatio,
        hasContext: !!context
      });
      
      // Check again before starting render
      if (!isMounted || !canvas) {
        console.log('[PdfRenderer] Component unmounted or canvas lost before render');
        return;
      }
      
      // Start rendering
      console.log('[PdfRenderer] Starting page.render()...');
      
      try {
        // Create render task
        const renderTask = page.render(renderContext);
        console.log('[PdfRenderer] Render task created');
        
        // Store as current task
        currentRenderTask = renderTask;
        
        // Wait for rendering to complete
        console.log('[PdfRenderer] Awaiting render promise...');
        await renderTask.promise;
        
        // Clear the current task reference
        currentRenderTask = null;
        
        // Check if still mounted after render completes
        if (!isMounted) {
          console.log('[PdfRenderer] Component unmounted after render');
          return;
        }
        
        console.log(`[PdfRenderer] Page ${pageNum} rendered successfully!`);
        
        // Update last rendered values
        lastRenderedPage = pageNum;
        lastRenderedScale = renderScale;
        
        // Verify canvas has content (only if canvas still exists)
        if (canvas && context) {
          try {
            const imageData = context.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
            const hasContent = imageData.data.some(pixel => pixel !== 0);
            console.log('[PdfRenderer] Canvas has content:', hasContent);
          } catch (e) {
            console.log('[PdfRenderer] Could not verify canvas content:', e);
          }
        }
        
      } catch (renderError: any) {
        // Check if this is a cancellation error
        if (renderError?.name === 'RenderingCancelledException') {
          console.log('[PdfRenderer] Render was cancelled, this is expected behavior');
          currentRenderTask = null;
          return;
        }
        
        console.error('[PdfRenderer] Render error:', renderError);
        console.error('[PdfRenderer] Error name:', renderError?.name);
        console.error('[PdfRenderer] Error message:', renderError?.message);
        throw renderError;
      }
      
      // Render text layer if requested
      // Note: Text layer rendering is currently disabled due to API changes in PDF.js v5
      // The renderTextLayer function is no longer directly available on pdfjsLib
      // PDF rendering works perfectly without the text layer - it's only needed for text selection
      if (renderText && textLayer && isMounted) {
        console.log('[PdfRenderer] Text layer rendering is currently disabled (PDF.js v5 API change)');
        // To re-enable text selection in the future, we would need to:
        // 1. Import the text layer builder from 'pdfjs-dist/web/pdf_viewer'
        // 2. Use the new TextLayerBuilder class
        // For now, PDFs display correctly without text selection capability
      }
    } catch (err: any) {
      // Don't log cancellation as an error
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[PdfRenderer] Error in performRender:', err);
        console.error('[PdfRenderer] Error details:', {
          message: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : undefined,
          name: err instanceof Error ? err.name : undefined
        });
        
        if (err instanceof Error && err.message !== 'Rendering cancelled') {
          error = `Failed to render page: ${err.message}`;
        }
      }
    } finally {
      isRendering = false;
      
      // Process any queued renders
      if (renderQueue && isMounted) {
        console.log('[PdfRenderer] Processing queued render request');
        processRenderQueue();
      }
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
    scale = Math.min(scale * 1.2, 5);
  }
  
  export function zoomOut() {
    scale = Math.max(scale * 0.8, 0.5);
  }
  
  export function resetZoom() {
    scale = 1.0;
  }
  
  export function fitToView() {
    if (!pdfDoc || !maxWidth || !maxHeight) return;
    calculateInitialScale().then(newScale => {
      if (newScale) {
        scale = newScale;
      }
    });
  }
  
  // Force a re-render (useful for testing)
  export async function forceRender() {
    if (pdfDoc && canvas && !isLoading) {
      lastRenderedPage = 0;
      lastRenderedScale = 0;
      await tick();
    }
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
    <div class="canvas-container" style="width: 100%; height: 100%;">
      <canvas bind:this={canvas} class="pdf-canvas"></canvas>
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
    background: transparent;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: transparent;
  }
  
  .pdf-canvas,
  canvas {
    display: block !important;
    background: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
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