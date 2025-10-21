/**
 * Lazy-loaded PDF.js wrapper
 *
 * This module provides lazy loading for pdfjs-dist, which is a large library (~2MB).
 * PDF.js is only loaded when the user actually views a PDF file.
 */

import type * as PDFJSTypes from 'pdfjs-dist';

// Cache for lazy-loaded module
let pdfjsLib: typeof PDFJSTypes | null = null;
let isLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Lazy load PDF.js library
 */
async function loadPdfJs(): Promise<typeof PDFJSTypes> {
  // Return existing promise if already loading
  if (isLoading && loadPromise) {
    await loadPromise;
    if (!pdfjsLib) {
      throw new Error('PDF.js module failed to load');
    }
    return pdfjsLib;
  }

  // Return immediately if already loaded
  if (pdfjsLib) {
    return pdfjsLib;
  }

  isLoading = true;
  loadPromise = (async () => {
    try {
      console.log('[LazyPdfJs] Loading PDF.js library...');
      const start = performance.now();

      // Dynamic import - only loads when first PDF is previewed
      pdfjsLib = await import('pdfjs-dist');

      // Configure worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const duration = Math.round(performance.now() - start);
      console.log(`[LazyPdfJs] PDF.js loaded successfully in ${duration}ms`);
      console.log('[LazyPdfJs] PDF.js version:', pdfjsLib.version);
      console.log('[LazyPdfJs] Worker src set to:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    } catch (error) {
      console.error('[LazyPdfJs] Failed to load PDF.js:', error);
      pdfjsLib = null;
      throw error;
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();

  await loadPromise;

  if (!pdfjsLib) {
    throw new Error('PDF.js module failed to load');
  }

  return pdfjsLib;
}

/**
 * Get PDF.js library instance (loads on first call)
 *
 * @returns PDF.js library object
 * @throws Error if PDF.js fails to load
 */
export async function getPdfJs(): Promise<typeof PDFJSTypes> {
  return await loadPdfJs();
}

/**
 * Check if PDF.js is already loaded
 *
 * @returns true if PDF.js is loaded and ready
 */
export function isPdfJsLoaded(): boolean {
  return pdfjsLib !== null;
}

/**
 * Get PDF.js library synchronously (returns null if not loaded yet)
 *
 * Use this only if you need to check the loaded state without triggering a load.
 * Prefer using getPdfJs() for actual PDF rendering.
 *
 * @returns PDF.js library or null if not loaded
 */
export function getPdfJsSync(): typeof PDFJSTypes | null {
  return pdfjsLib;
}
