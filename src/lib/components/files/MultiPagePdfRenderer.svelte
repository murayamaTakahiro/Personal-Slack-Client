<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { getPdfJs } from '$lib/utils/lazyPdfJs';
  import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
  import { createFileDataUrl } from '$lib/api/files';

  let pdfjsLib: typeof import('pdfjs-dist') | null = null;

  export let url: string;
  export let scale: number = 1.0;
  export let maxWidth: number | undefined = undefined;
  export let mimeType: string = 'application/pdf';
  export let fitToViewport: boolean = true;

  const dispatch = createEventDispatcher();

  let containerDiv: HTMLDivElement;
  let pdfDoc: PDFDocumentProxy | null = null;
  let canvases: HTMLCanvasElement[] = [];
  let renderTasks: (RenderTask | null)[] = [];
  let isLoading = true;
  let error: string | null = null;
  let isMounted = false;
  let initialScaleCalculated = false;
  let initialScale: number = 1.0;

  $: totalPages = pdfDoc?.numPages || 0;

  // Watch for URL changes
  let currentUrl = '';
  $: if (url && url !== currentUrl && isMounted) {
    currentUrl = url;
    handleUrlChange();
  }

  // Watch for scale changes and re-render all pages
  $: if (isMounted && !isLoading && pdfDoc && scale) {
    renderAllPages();
  }

  onMount(async () => {
    isMounted = true;

    try {
      // Lazy load PDF.js library
      console.log('[MultiPagePdfRenderer] Component mounted, loading PDF.js...');
      pdfjsLib = await getPdfJs();
      console.log('[MultiPagePdfRenderer] PDF.js loaded successfully');

      // Set current URL and load PDF
      currentUrl = url;
      await loadPdf();
    } catch (err) {
      console.error('[MultiPagePdfRenderer] Failed to load PDF.js:', err);
      error = 'Failed to load PDF viewer. Please refresh the page.';
      isLoading = false;
    }
  });

  async function handleUrlChange() {
    // Cancel all render tasks
    renderTasks.forEach(task => {
      if (task) {
        try {
          task.cancel();
        } catch (e) {
          // Ignore
        }
      }
    });
    renderTasks = [];

    // Destroy existing PDF document
    if (pdfDoc) {
      try {
        pdfDoc.destroy();
      } catch (e) {
        console.error('[MultiPagePdfRenderer] Error destroying PDF:', e);
      }
      pdfDoc = null;
    }

    // Clear canvases
    canvases = [];

    // Reset scale calculation
    initialScaleCalculated = false;

    // Load new PDF
    await loadPdf();
  }

  onDestroy(() => {
    isMounted = false;

    // Cancel all render tasks
    renderTasks.forEach(task => {
      if (task) {
        try {
          task.cancel();
        } catch (e) {
          // Ignore
        }
      }
    });
    renderTasks = [];

    // Destroy PDF document
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }
  });

  async function calculateInitialScale(): Promise<number | null> {
    if (!pdfDoc || !maxWidth) return null;

    try {
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });

      // Calculate scale to fit width (with 95% to leave some padding)
      const scaleToFitWidth = (maxWidth * 0.95) / viewport.width;

      // Ensure minimum scale for readability
      const optimalScale = Math.max(0.8, Math.min(3, scaleToFitWidth));

      console.log('[MultiPagePdfRenderer] Calculated initial scale:', {
        pageWidth: viewport.width,
        maxWidth,
        scaleToFitWidth,
        optimalScale
      });

      return optimalScale;
    } catch (err) {
      console.error('[MultiPagePdfRenderer] Error calculating scale:', err);
      return null;
    }
  }

  async function loadPdf() {
    // Check if PDF.js is loaded
    if (!pdfjsLib) {
      console.error('[MultiPagePdfRenderer] PDF.js not loaded yet');
      error = 'PDF viewer not ready. Please wait...';
      return;
    }

    if (isLoading && pdfDoc) {
      return;
    }

    isLoading = true;
    error = null;

    // Destroy existing PDF
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }

    try {
      let pdfData: string | ArrayBuffer | { url: string };

      if (url.startsWith('data:')) {
        pdfData = url;
      } else if (url.startsWith('https://files.slack.com')) {
        try {
          const dataUrl = await createFileDataUrl(url, mimeType);
          pdfData = dataUrl;
        } catch (fetchError) {
          console.error('[MultiPagePdfRenderer] Failed to fetch PDF:', fetchError);
          throw new Error('Failed to fetch PDF with authentication');
        }
      } else {
        pdfData = { url };
      }

      // Load PDF with CMap configuration
      const documentInitParameters = typeof pdfData === 'string' ?
        {
          url: pdfData,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          enableXfa: true
        } :
        typeof pdfData === 'object' && 'url' in pdfData ?
        {
          ...pdfData,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          enableXfa: true
        } :
        {
          data: pdfData,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          enableXfa: true
        };

      const loadingTask = pdfjsLib.getDocument(documentInitParameters);

      try {
        pdfDoc = await loadingTask.promise;
        console.log('[MultiPagePdfRenderer] PDF loaded, pages:', pdfDoc.numPages);
      } catch (documentError: any) {
        // Fallback without CMap
        if (documentError?.message?.includes('cMap') || documentError?.message?.includes('CMap')) {
          console.warn('[MultiPagePdfRenderer] CMap error, retrying without CMaps...');
          const fallbackParameters = typeof pdfData === 'string' ?
            { url: pdfData } :
            typeof pdfData === 'object' && 'url' in pdfData ?
            { ...pdfData } :
            { data: pdfData };

          const fallbackTask = pdfjsLib.getDocument(fallbackParameters);
          pdfDoc = await fallbackTask.promise;
          console.log('[MultiPagePdfRenderer] PDF loaded with fallback');
        } else {
          throw documentError;
        }
      }

      // Calculate initial scale
      if (fitToViewport && !initialScaleCalculated && maxWidth) {
        const calculatedScale = await calculateInitialScale();
        if (calculatedScale) {
          initialScale = calculatedScale;
          scale = calculatedScale;
          initialScaleCalculated = true;
        }
      }

      // Dispatch total pages
      dispatch('totalPages', pdfDoc.numPages);

      isLoading = false;

      // Wait for DOM to update
      await tick();

      // Render all pages
      await renderAllPages();

    } catch (err) {
      console.error('[MultiPagePdfRenderer] Error loading PDF:', err);
      error = err instanceof Error ? err.message : 'Failed to load PDF';
      isLoading = false;
    }
  }

  async function renderAllPages() {
    if (!pdfDoc || !isMounted || isLoading) {
      return;
    }

    console.log('[MultiPagePdfRenderer] Rendering all pages, total:', pdfDoc.numPages);

    // Cancel existing render tasks
    renderTasks.forEach(task => {
      if (task) {
        try {
          task.cancel();
        } catch (e) {
          // Ignore
        }
      }
    });
    renderTasks = [];

    // Wait for DOM to update with canvas elements
    await tick();

    // Render each page
    const renderPromises: Promise<void>[] = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      renderPromises.push(renderPage(pageNum));
    }

    try {
      await Promise.all(renderPromises);
      console.log('[MultiPagePdfRenderer] All pages rendered successfully');
    } catch (err) {
      console.error('[MultiPagePdfRenderer] Error rendering pages:', err);
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfDoc || !isMounted) {
      return;
    }

    const canvas = canvases[pageNum - 1];
    if (!canvas) {
      console.error('[MultiPagePdfRenderer] Canvas not found for page', pageNum);
      return;
    }

    try {
      const page: PDFPageProxy = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const context = canvas.getContext('2d');
      if (!context) {
        console.error('[MultiPagePdfRenderer] Failed to get canvas context for page', pageNum);
        return;
      }

      // Account for device pixel ratio
      const devicePixelRatio = window.devicePixelRatio || 1;

      // Set canvas dimensions
      canvas.height = Math.floor(viewport.height * devicePixelRatio);
      canvas.width = Math.floor(viewport.width * devicePixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // Clear and scale context
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.scale(devicePixelRatio, devicePixelRatio);

      // Render
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        enableWebGL: false,
        renderInteractiveForms: false,
        optionalContentConfigPromise: null
      };

      const renderTask = page.render(renderContext);
      renderTasks[pageNum - 1] = renderTask;

      await renderTask.promise;

      context.restore();
      renderTasks[pageNum - 1] = null;

    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error(`[MultiPagePdfRenderer] Error rendering page ${pageNum}:`, err);
      }
    }
  }

  export function zoomIn() {
    scale = Math.min(scale * 1.2, 5);
  }

  export function zoomOut() {
    scale = Math.max(scale * 0.8, 0.5);
  }

  export function resetZoom() {
    scale = initialScaleCalculated ? initialScale : 1.0;
  }

  export function fitToView() {
    if (!pdfDoc || !maxWidth) return;
    calculateInitialScale().then(newScale => {
      if (newScale) {
        initialScale = newScale;
        scale = newScale;
      }
    });
  }
</script>

<div class="multi-page-pdf-renderer" bind:this={containerDiv}>
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
  {:else if pdfDoc}
    <div class="pages-container">
      {#each Array(totalPages) as _, i}
        <div class="page-wrapper" data-page={i + 1}>
          <canvas
            bind:this={canvases[i]}
            class="pdf-page"
          ></canvas>
          {#if totalPages > 1}
            <div class="page-number">Page {i + 1} of {totalPages}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .multi-page-pdf-renderer {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: #525252;
    /* Scrollbar styling */
    scrollbar-width: thin;
    scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
  }

  .multi-page-pdf-renderer::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .multi-page-pdf-renderer::-webkit-scrollbar-track {
    background: transparent;
  }

  .multi-page-pdf-renderer::-webkit-scrollbar-thumb {
    background: rgba(155, 155, 155, 0.5);
    border-radius: 5px;
  }

  .multi-page-pdf-renderer::-webkit-scrollbar-thumb:hover {
    background: rgba(155, 155, 155, 0.7);
  }

  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: white;
    height: 100%;
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

  .pages-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    gap: 20px;
    min-height: 100%;
  }

  .page-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .pdf-page {
    display: block;
    background: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    max-width: 100%;
    height: auto;
  }

  .page-number {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
    padding: 4px 12px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 12px;
    backdrop-filter: blur(4px);
  }
</style>
