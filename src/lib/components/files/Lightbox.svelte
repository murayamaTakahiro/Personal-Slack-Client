<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { FileMetadata } from '$lib/services/fileService';
  import { downloadFile, downloadFileWithOptions, downloadFilesInBatch } from '$lib/api/files';
  import { formatFileSize } from '$lib/api/files';
  import { activeWorkspace } from '$lib/stores/workspaces';
  import { settings, getDownloadFolder } from '$lib/stores/settings';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';
  import LightboxHelp from './LightboxHelp.svelte';
  import PdfRenderer from './PdfRenderer.svelte';
  import TextPreview from './TextPreview.svelte';
  import CsvPreview from './CsvPreview.svelte';
  import ExcelPreview from './ExcelPreview.svelte';
  import WordPreview from './WordPreview.svelte';
  import OfficePreview from './OfficePreview.svelte';

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

  // Excel-specific state
  let excelPreviewRef: any;

  // Text-specific state
  let textPreviewRef: any;

  // CSV-specific state
  let csvPreviewRef: any;

  $: hasNext = currentIndex < allFiles.length - 1;
  $: hasPrevious = currentIndex > 0;
  $: isImage = file.type === 'image';
  $: isPdf = file.type === 'pdf';
  $: isText = file.type === 'text' || file.type === 'code';
  $: isCsv = file.type === 'csv';
  $: isExcel = file.type === 'excel';
  // Only .docx files can be previewed with Mammoth.js (.doc files need to fall back to OfficePreview)
  $: isWord = file.type === 'word' && (file.file.name?.toLowerCase().endsWith('.docx') || file.file.mimetype?.includes('openxmlformats'));
  $: isOffice = file.type === 'powerpoint' || (file.type === 'word' && !isWord);
  $: isGoogleSheets = file.type === 'google-sheets';
  $: isGoogleDocs = file.type === 'google-docs';
  $: isGoogleFile = isGoogleSheets || isGoogleDocs;
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

  // Load large thumbnail for Google Docs/Sheets when file changes
  $: if (file && isGoogleFile) {
    fullImageUrl = null;
    loadGoogleThumbnail();
  }

  function handleKeydown(event: KeyboardEvent) {
    // Prevent default behavior for navigation keys FIRST
    // This ensures the App.svelte handler sees defaultPrevented = true
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'j', 'k', 'h', 'l', 'J', 'K', 'H', 'L', 'PageUp', 'PageDown', 'Home', 'End', 'd', 'D', '+', '-', '=', '0', '?', 'Escape', 'f', 'F', 'c', 'C'];
    if (navigationKeys.includes(event.key) || (event.key === '0' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
    }

    // Block ALL keyboard events from propagating to background components
    // when lightbox is open - we handle everything here
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    // Handle PDF-specific navigation for arrow keys only (not h/l)
    if (isPdf) {
      switch (event.key) {
        case 'ArrowLeft':
          // Multi-page PDF: navigate pages first
          if (pdfTotalPages > 1 && pdfCurrentPage > 1) {
            pdfPreviousPage();
            return;
          } 
          // At first page or single-page PDF: navigate to previous file
          else if (hasPrevious) {
            onPrevious();
            return;
          }
          break;
        case 'ArrowRight':
          // Multi-page PDF: navigate pages first
          if (pdfTotalPages > 1 && pdfCurrentPage < pdfTotalPages) {
            pdfNextPage();
            return;
          } 
          // At last page or single-page PDF: navigate to next file
          else if (hasNext) {
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
        // For non-PDF files, navigate between files
        if (hasPrevious && !isPdf) onPrevious();
        break;
      case 'ArrowRight': 
        // For non-PDF files, navigate between files
        if (hasNext && !isPdf) onNext();
        break;
      case 'h':
        // Scroll left horizontally
        scrollLeft();
        break;
      case 'l':
        // Scroll right horizontally
        scrollRight();
        break;
      case 'Tab':
        // Ctrl+Tab for Excel sheet navigation
        if (event.ctrlKey && isExcel && excelPreviewRef) {
          if (event.shiftKey) {
            // Ctrl+Shift+Tab - previous sheet
            excelPreviewRef.previousSheet();
          } else {
            // Ctrl+Tab - next sheet
            excelPreviewRef.nextSheet();
          }
        } else if (event.shiftKey) {
          // Shift+Tab - previous image
          if (hasPrevious) onPrevious();
        } else {
          // Tab - next image
          if (hasNext) onNext();
        }
        break;
      case 'ArrowUp':
      case 'k':
        // Always scroll, never zoom
        scrollUp();
        break;
      case 'ArrowDown':
      case 'j':
        // Always scroll, never zoom
        scrollDown();
        break;
      case 'Home':
        scrollToTop();
        break;
      case 'End':
        scrollToBottom();
        break;
      case 'PageUp':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        scrollPageUp();
        break;
      case 'PageDown':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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
      case 'd':
        if (event.shiftKey) {
          // Shift+d - Download all files from current message
          downloadAllFiles();
        } else {
          // d - Download current file
          downloadFullFile(false);
        }
        break;
      case 'D':
        // Capital D (Shift+d) - Download all files
        downloadAllFiles();
        break;
      case 'c':
        // c - Copy content to clipboard (for text/CSV files)
        if (isText && textPreviewRef) {
          textPreviewRef.copyToClipboard();
        } else if (isCsv && csvPreviewRef) {
          csvPreviewRef.exportToClipboard();
        }
        break;
      case 'C':
        // C (Shift+c) - Copy content to clipboard (for text/CSV files)
        if (isText && textPreviewRef) {
          textPreviewRef.copyToClipboard();
        } else if (isCsv && csvPreviewRef) {
          csvPreviewRef.exportToClipboard();
        }
        break;
    }
  }
  
  function scrollUp() {
    if (isPdf) {
      // For PDF, scroll the PDF renderer container (which has overflow: auto)
      const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
      if (pdfContainer) {
        pdfContainer.scrollTop = Math.max(0, pdfContainer.scrollTop - scrollSpeed);
      }
    } else if (isImage && imageElement) {
      // For images, scroll the image container
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
      }
    } else if (isText) {
      // For text files, scroll the .text-preview element inside the wrapper
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollTop = Math.max(0, textPreview.scrollTop - scrollSpeed);
      }
    } else if (isCsv) {
      // For CSV files, scroll the body container
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        bodyContainer.scrollTop = Math.max(0, bodyContainer.scrollTop - scrollSpeed);
      }
    } else if (isExcel) {
      // For Excel files, scroll the wrapper (due to transform: scale() affecting inner scroll)
      const wrapper = containerDiv?.querySelector('.excel-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - scrollSpeed);
      }
    } else if (isWord) {
      // For Word files, scroll the wrapper (due to transform: scale() affecting inner scroll)
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - scrollSpeed);
      }
    } else if (isOffice) {
      // For Office files, scroll the wrapper itself
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - scrollSpeed);
      }
    } else if (isGoogleFile) {
      // For Google Docs/Sheets, scroll the thumbnail wrapper
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - scrollSpeed);
      }
    }
  }
  
  function scrollDown() {
    if (isPdf) {
      // For PDF, scroll the PDF renderer container (which has overflow: auto)
      const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
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
    } else if (isText) {
      // For text files, scroll the .text-preview element inside the wrapper
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollTop = Math.min(
          textPreview.scrollHeight - textPreview.clientHeight,
          textPreview.scrollTop + scrollSpeed
        );
      }
    } else if (isCsv) {
      // For CSV files, scroll the body container
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        bodyContainer.scrollTop = Math.min(
          bodyContainer.scrollHeight - bodyContainer.clientHeight,
          bodyContainer.scrollTop + scrollSpeed
        );
      }
    } else if (isExcel) {
      // For Excel files, scroll the wrapper (due to transform: scale() affecting inner scroll)
      const wrapper = containerDiv?.querySelector('.excel-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + scrollSpeed
        );
      }
    } else if (isWord) {
      // For Word files, scroll the wrapper (due to transform: scale() affecting inner scroll)
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + scrollSpeed
        );
      }
    } else if (isOffice) {
      // For Office files, scroll the wrapper itself
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + scrollSpeed
        );
      }
    } else if (isGoogleFile) {
      // For Google Docs/Sheets, scroll the thumbnail wrapper
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + scrollSpeed
        );
      }
    }
  }
  
  function scrollLeft() {
    if (isPdf) {
      // For PDF, scroll the PDF renderer container horizontally
      const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
      if (pdfContainer) {
        pdfContainer.scrollLeft = Math.max(0, pdfContainer.scrollLeft - scrollSpeed);
      }
    } else if (isImage && imageElement) {
      // For images, scroll the image container horizontally
      const container = imageElement.parentElement;
      if (container) {
        container.scrollLeft = Math.max(0, container.scrollLeft - scrollSpeed);
      }
    } else if (isText) {
      // For text files, scroll the .text-preview element horizontally
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollLeft = Math.max(0, textPreview.scrollLeft - scrollSpeed);
      }
    } else if (isCsv) {
      // For CSV files, scroll both header and body containers horizontally in sync
      const headerContainer = containerDiv?.querySelector('.csv-preview-wrapper .header-container');
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        const newScrollLeft = Math.max(0, bodyContainer.scrollLeft - scrollSpeed);
        bodyContainer.scrollLeft = newScrollLeft;
        if (headerContainer) {
          headerContainer.scrollLeft = newScrollLeft;
        }
      }
    } else if (isExcel) {
      // For Excel files, scroll both header and body containers horizontally in sync
      const headerContainer = containerDiv?.querySelector('.excel-preview-wrapper .table-header-wrapper');
      const bodyContainer = containerDiv?.querySelector('.excel-preview-wrapper .table-body-wrapper');
      if (bodyContainer) {
        const newScrollLeft = Math.max(0, bodyContainer.scrollLeft - scrollSpeed);
        bodyContainer.scrollLeft = newScrollLeft;
        if (headerContainer) {
          headerContainer.scrollLeft = newScrollLeft;
        }
      }
    } else if (isWord) {
      // For Word files, scroll the wrapper horizontally
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - scrollSpeed);
      }
    } else if (isOffice) {
      // For Office files, scroll the wrapper itself horizontally
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - scrollSpeed);
      }
    } else if (isGoogleFile) {
      // For Google Docs/Sheets, scroll the thumbnail wrapper horizontally
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - scrollSpeed);
      }
    }
  }
  
  function scrollRight() {
    if (isPdf) {
      // For PDF, scroll the PDF renderer container horizontally
      const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
      if (pdfContainer) {
        pdfContainer.scrollLeft = Math.min(
          pdfContainer.scrollWidth - pdfContainer.clientWidth,
          pdfContainer.scrollLeft + scrollSpeed
        );
      }
    } else if (isImage && imageElement) {
      // For images, scroll the image container horizontally
      const container = imageElement.parentElement;
      if (container) {
        container.scrollLeft = Math.min(
          container.scrollWidth - container.clientWidth,
          container.scrollLeft + scrollSpeed
        );
      }
    } else if (isText) {
      // For text files, scroll the .text-preview element horizontally
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollLeft = Math.min(
          textPreview.scrollWidth - textPreview.clientWidth,
          textPreview.scrollLeft + scrollSpeed
        );
      }
    } else if (isCsv) {
      // For CSV files, scroll both header and body containers horizontally in sync
      const headerContainer = containerDiv?.querySelector('.csv-preview-wrapper .header-container');
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        const newScrollLeft = Math.min(
          bodyContainer.scrollWidth - bodyContainer.clientWidth,
          bodyContainer.scrollLeft + scrollSpeed
        );
        bodyContainer.scrollLeft = newScrollLeft;
        if (headerContainer) {
          headerContainer.scrollLeft = newScrollLeft;
        }
      }
    } else if (isExcel) {
      // For Excel files, scroll both header and body containers horizontally in sync
      const headerContainer = containerDiv?.querySelector('.excel-preview-wrapper .table-header-wrapper');
      const bodyContainer = containerDiv?.querySelector('.excel-preview-wrapper .table-body-wrapper');
      if (bodyContainer) {
        const newScrollLeft = Math.min(
          bodyContainer.scrollWidth - bodyContainer.clientWidth,
          bodyContainer.scrollLeft + scrollSpeed
        );
        bodyContainer.scrollLeft = newScrollLeft;
        if (headerContainer) {
          headerContainer.scrollLeft = newScrollLeft;
        }
      }
    } else if (isWord) {
      // For Word files, scroll the wrapper horizontally
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = Math.min(
          wrapper.scrollWidth - wrapper.clientWidth,
          wrapper.scrollLeft + scrollSpeed
        );
      }
    } else if (isOffice) {
      // For Office files, scroll the wrapper itself horizontally
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = Math.min(
          wrapper.scrollWidth - wrapper.clientWidth,
          wrapper.scrollLeft + scrollSpeed
        );
      }
    } else if (isGoogleFile) {
      // For Google Docs/Sheets, scroll the thumbnail wrapper horizontally
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = Math.min(
          wrapper.scrollWidth - wrapper.clientWidth,
          wrapper.scrollLeft + scrollSpeed
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
        const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
        if (pdfContainer) {
          pdfContainer.scrollTop = Math.max(0, pdfContainer.scrollTop - pdfContainer.clientHeight);
        }
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight);
      }
    } else if (isText) {
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollTop = Math.max(0, textPreview.scrollTop - textPreview.clientHeight);
      }
    } else if (isCsv) {
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        bodyContainer.scrollTop = Math.max(0, bodyContainer.scrollTop - bodyContainer.clientHeight);
      }
    } else if (isExcel) {
      const wrapper = containerDiv?.querySelector('.excel-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - wrapper.clientHeight);
      }
    } else if (isWord) {
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - wrapper.clientHeight);
      }
    } else if (isOffice) {
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - wrapper.clientHeight);
      }
    } else if (isGoogleFile) {
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.max(0, wrapper.scrollTop - wrapper.clientHeight);
      }
    }
  }
  
  function scrollPageDown() {
    if (isPdf) {
      // For PDF, try to go to next page first, then scroll
      if (pdfCurrentPage < pdfTotalPages) {
        pdfNextPage();
      } else {
        const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
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
    } else if (isText) {
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollTop = Math.min(
          textPreview.scrollHeight - textPreview.clientHeight,
          textPreview.scrollTop + textPreview.clientHeight
        );
      }
    } else if (isCsv) {
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        bodyContainer.scrollTop = Math.min(
          bodyContainer.scrollHeight - bodyContainer.clientHeight,
          bodyContainer.scrollTop + bodyContainer.clientHeight
        );
      }
    } else if (isExcel) {
      const wrapper = containerDiv?.querySelector('.excel-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + wrapper.clientHeight
        );
      }
    } else if (isWord) {
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + wrapper.clientHeight
        );
      }
    } else if (isOffice) {
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + wrapper.clientHeight
        );
      }
    } else if (isGoogleFile) {
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollTop = Math.min(
          wrapper.scrollHeight - wrapper.clientHeight,
          wrapper.scrollTop + wrapper.clientHeight
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
      const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
      if (pdfContainer) {
        pdfContainer.scrollTop = 0;
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = 0;
      }
    } else if (isText) {
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollTop = 0;
      }
    } else if (isCsv) {
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        bodyContainer.scrollTop = 0;
      }
    } else if (isExcel) {
      const wrapper = containerDiv?.querySelector('.excel-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = 0;
      }
    } else if (isWord) {
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = 0;
      }
    } else if (isOffice) {
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = 0;
      }
    } else if (isGoogleFile) {
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollTop = 0;
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
      const pdfContainer = containerDiv?.querySelector('.pdf-renderer');
      if (pdfContainer) {
        pdfContainer.scrollTop = pdfContainer.scrollHeight - pdfContainer.clientHeight;
      }
    } else if (isImage && imageElement) {
      const container = imageElement.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight - container.clientHeight;
      }
    } else if (isText) {
      const textPreview = containerDiv?.querySelector('.text-preview-wrapper .text-preview');
      if (textPreview) {
        textPreview.scrollTop = textPreview.scrollHeight - textPreview.clientHeight;
      }
    } else if (isCsv) {
      const bodyContainer = containerDiv?.querySelector('.csv-preview-wrapper .body-container');
      if (bodyContainer) {
        bodyContainer.scrollTop = bodyContainer.scrollHeight - bodyContainer.clientHeight;
      }
    } else if (isExcel) {
      const wrapper = containerDiv?.querySelector('.excel-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight - wrapper.clientHeight;
      }
    } else if (isWord) {
      const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight - wrapper.clientHeight;
      }
    } else if (isOffice) {
      const wrapper = containerDiv?.querySelector('.office-preview-wrapper');
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight - wrapper.clientHeight;
      }
    } else if (isGoogleFile) {
      const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight - wrapper.clientHeight;
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
  }

  function zoomIn() {
    setZoom(Math.min(5, zoomLevel + 0.15));
  }

  function zoomOut() {
    setZoom(Math.max(0.5, zoomLevel - 0.15));
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


  async function downloadFullFile(showDialog = false) {
    if (isDownloading) return;
    
    isDownloading = true;
    downloadError = null;
    
    // Show download started notification
    showInfo('Download started', `Downloading ${file.file.name}...`, 3000);
    
    try {
      const downloadFolder = getDownloadFolder();
      const result = await downloadFileWithOptions(
        file.file.url_private_download || file.file.url_private,
        file.file.name,
        {
          savePath: showDialog ? null : downloadFolder,
          showDialog: showDialog || (!downloadFolder && !showDialog)
        }
      );
      
      if (result.success) {
        // Show success with file location
        const location = result.localPath || downloadFolder || 'Downloads folder';
        showSuccess(
          'Download complete',
          `${file.file.name} saved to ${location}`,
          3000
        );
      } else if (result.error && !result.error.includes('cancelled')) {
        downloadError = result.error;
        showError(
          'Download failed',
          `Failed to download ${file.file.name}: ${result.error}`,
          5000
        );
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Download failed';
      showError(
        'Download failed',
        `Failed to download ${file.file.name}: ${downloadError}`,
        5000
      );
    } finally {
      isDownloading = false;
    }
  }
  
  async function downloadAllFiles() {
    if (!allFiles.length || isDownloading) return;
    
    isDownloading = true;
    downloadError = null;
    
    const totalFiles = allFiles.length;
    
    // Show batch download started notification
    showInfo(
      'Batch download started',
      `Downloading ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`,
      3000 // Auto-dismiss after 3 seconds
    );
    
    try {
      const downloadFolder = getDownloadFolder();
      const filesToDownload = allFiles.map(f => ({
        url: f.file.url_private_download || f.file.url_private,
        fileName: f.file.name
      }));
      
      const result = await downloadFilesInBatch(filesToDownload, {
        savePath: downloadFolder,
        showDialog: !downloadFolder
      });
      
      if (result.success) {
        const downloadedCount = result.paths?.length || 0;
        const location = downloadFolder || 'Downloads folder';
        
        // Show success with details
        showSuccess(
          'Batch download complete',
          `${downloadedCount} of ${totalFiles} files saved to ${location}`,
          3000
        );
        
        // List file names if reasonable number
        if (downloadedCount > 0 && downloadedCount <= 5) {
          const fileNames = allFiles.slice(0, downloadedCount).map(f => f.file.name).join(', ');
          showInfo('Downloaded files', fileNames, 5000);
        }
      } else if (result.error && !result.error.includes('cancelled')) {
        downloadError = result.error;
        showError(
          'Batch download failed',
          `Failed to download files: ${result.error}`,
          5000
        );
      }
    } catch (error) {
      downloadError = error instanceof Error ? error.message : 'Batch download failed';
      showError(
        'Batch download failed',
        `Failed to download files: ${downloadError}`,
        5000
      );
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

  async function loadGoogleThumbnail() {
    if (!isGoogleFile) return;

    isLoadingFullImage = true;
    imageLoadError = false;

    console.log('[Lightbox] Loading Google Docs/Sheets large thumbnail:', {
      name: file.file.name,
      type: file.type
    });

    try {
      // Get the largest available thumbnail (960 or 1024)
      const { getBestThumbnailUrl, createFileDataUrl } = await import('$lib/api/files');
      const thumbnailUrl = getBestThumbnailUrl(file.file, 960);

      if (!thumbnailUrl) {
        console.log('[Lightbox] No thumbnail URL available for Google file');
        imageLoadError = true;
        return;
      }

      console.log('[Lightbox] Fetching large thumbnail:', thumbnailUrl);

      // Fetch with authentication and convert to data URL
      if (thumbnailUrl.startsWith('https://files.slack.com')) {
        const dataUrl = await createFileDataUrl(
          thumbnailUrl,
          file.file.mimetype || 'image/jpeg'
        );
        fullImageUrl = dataUrl;
        console.log('[Lightbox] Successfully loaded Google thumbnail as data URL');
      } else {
        // External thumbnail URL
        fullImageUrl = thumbnailUrl;
      }
    } catch (error) {
      console.error('[Lightbox] Failed to load Google thumbnail:', error);
      imageLoadError = true;
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
          <span>{file.type === 'code' ? 'Code' : (file.file.pretty_type || file.type)}</span>
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
        {:else if isImage || isGoogleFile}
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
          on:click={() => downloadFullFile(false)}
          disabled={isDownloading}
          title="Download (d)">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path fill="currentColor" d="M10 14L6 10h2.5V4h3v6H14l-4 4zm-7 3v1h14v-1H3z"/>
          </svg>
        </button>
        
        {#if allFiles.length > 1}
          <button 
            class="action-btn"
            on:click={downloadAllFiles}
            disabled={isDownloading}
            title="Download all files (Shift+d)">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path fill="currentColor" d="M7 14L3 10h2.5V4h3v6H11l-4 4zm6-4V4h3v6h2.5l-4 4-4-4H13zm-10 7v1h14v-1H3z"/>
            </svg>
          </button>
        {/if}
        
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
          on:dblclick={toggleZoom}
          style="zoom: {zoomLevel};"
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
              maxWidth={window.innerWidth * 0.9}
              maxHeight={window.innerHeight * 0.75}
              fitToViewport={true}
              allowScrollOnZoom={true}
            />
          {/if}
        </div>
      {:else if isText}
        <div class="text-preview-wrapper" style="zoom: {zoomLevel};">
          <TextPreview
            bind:this={textPreviewRef}
            file={file.file}
            workspaceId={$activeWorkspace?.id || 'default'}
            compact={true}
          />
        </div>
      {:else if isCsv}
        <div class="csv-preview-wrapper" style="zoom: {zoomLevel};">
          <CsvPreview
            bind:this={csvPreviewRef}
            file={file.file}
            workspaceId={$activeWorkspace?.id || 'default'}
            compact={true}
          />
        </div>
      {:else if isExcel}
        <div class="excel-preview-wrapper" style="zoom: {zoomLevel};">
          <ExcelPreview
            bind:this={excelPreviewRef}
            file={file.file}
            workspaceId={$activeWorkspace?.id || 'default'}
            compact={true}
          />
        </div>
      {:else if isWord}
        <div class="word-preview-wrapper" style="zoom: {zoomLevel};">
          {#key file.file.id}
            <WordPreview
              file={file.file}
              workspaceId={$activeWorkspace?.id || 'default'}
              compact={true}
            />
          {/key}
        </div>
      {:else if isOffice}
        <div class="office-preview-wrapper" style="zoom: {zoomLevel};">
          {#key file.file.id}
            <OfficePreview
              file={file.file}
              workspaceId={$activeWorkspace?.id || 'default'}
              compact={true}
            />
          {/key}
        </div>
      {:else if isGoogleFile}
        <div class="google-docs-lightbox">
          <div class="google-preview-content">
            <!-- Large thumbnail image -->
            <div
              class="google-thumbnail-wrapper"
              class:zoomed={isZoomed}
              on:dblclick={toggleZoom}
              style="zoom: {zoomLevel};"
            >
              {#if isLoadingFullImage}
                <div class="google-loading">
                  <div class="spinner"></div>
                  <p>Loading preview...</p>
                </div>
              {:else if imageLoadError}
                <div class="google-error">
                  <svg class="error-icon" width="64" height="64" viewBox="0 0 48 48">
                    <path fill="currentColor" d="M38 10v28H10V10h28zm0-2H10c-1.1 0-2 .9-2 2v28c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/>
                    <path fill="currentColor" d="M27.5 19.5l-5 6.5-3.5-4.5-5 6.5h20z"/>
                  </svg>
                  <p>Preview unavailable</p>
                </div>
              {:else if displayUrl}
                <img
                  src={displayUrl}
                  alt={file.file.name}
                  class="google-thumbnail"
                />
              {/if}
            </div>

            <!-- Metadata panel -->
            <div class="google-metadata-panel">
              <div class="google-icon-large">
                {isGoogleSheets ? '📊' : '📄'}
              </div>
              <h3 class="google-file-name">{file.file.name || file.file.title}</h3>
              <p class="google-file-type">
                {isGoogleSheets ? 'Spreadsheet' : 'Document'} in Google {isGoogleSheets ? 'Sheets' : 'Docs'}
              </p>

              <!-- Page 1 preview notice -->
              <div class="google-page-notice">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink: 0;">
                  <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z"/>
                  <path d="M6.5 7.75A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z"/>
                </svg>
                <span>Showing page 1 preview only. Open in Google {isGoogleSheets ? 'Sheets' : 'Docs'} to view the full {isGoogleSheets ? 'spreadsheet' : 'document'}.</span>
              </div>

              <div class="google-metadata-grid">
                {#if file.file.size}
                  <div class="metadata-item">
                    <span class="label">Size</span>
                    <span class="value">{formatFileSize(file.file.size)}</span>
                  </div>
                {/if}
                {#if file.file.created}
                  <div class="metadata-item">
                    <span class="label">Created</span>
                    <span class="value">{new Date(file.file.created * 1000).toLocaleDateString()}</span>
                  </div>
                {/if}
              </div>

              <!-- Open in Google button (enhanced) -->
              <button
                class="open-in-google-btn enhanced"
                on:click={() => window.open(file.file.url_private, '_blank')}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                </svg>
                Open Full {isGoogleSheets ? 'Spreadsheet' : 'Document'}
              </button>
            </div>
          </div>
        </div>
      {:else}
        <div class="generic-preview">
          <div class="file-icon">{file.icon}</div>
          <h3>{file.file.name}</h3>
          <p class="file-type">{file.type === 'code' ? 'Code' : (file.file.pretty_type || file.type)}</p>
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
    width: 90vw;
    height: 90vh;
    max-width: 1400px;
    max-height: 900px;
    background: var(--color-surface);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    /* Ensure container doesn't overflow */
    overflow: hidden;
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
    /* Ensure content area has proper dimensions */
    width: 100%;
  }

  .image-wrapper {
    width: 100%;
    height: 100%;
    overflow: auto;
    cursor: zoom-in;
    position: relative;
    /* Top-left alignment for proper scroll behavior when zoomed */
    display: block;
  }

  .image-wrapper.zoomed {
    cursor: zoom-out;
  }

  .lightbox-image {
    /* Use actual dimensions for proper scaling */
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease, opacity 0.3s ease;
    user-select: none;
    /* Important: This allows the scaled image to create proper scroll area */
    display: block;
  }

  .image-wrapper.zoomed .lightbox-image {
    /* Keep same behavior when zoomed */
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
    /* SIMPLE SOLUTION: Fixed size container for PDF */
    width: 100%;
    height: 100%;
    /* Don't use flexbox - it can interfere with child sizing */
    overflow: hidden;
    position: relative;
    background: #525252;
    /* Ensure the container has defined dimensions */
    display: block;
  }
  
  /* CRITICAL: PdfRenderer must fill the container exactly */
  .pdf-content :global(.pdf-renderer) {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
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

  .text-preview-wrapper,
  .csv-preview-wrapper,
  .excel-preview-wrapper,
  .word-preview-wrapper,
  .office-preview-wrapper {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: var(--color-surface);
    border-radius: 8px;
    /* Top-left alignment for proper scroll behavior when zoomed */
    display: block;
  }

  /* Google Docs/Sheets Lightbox Styles */
  .google-docs-lightbox {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 2rem;
  }

  .google-preview-content {
    display: flex;
    gap: 2rem;
    max-width: 1200px;
    width: 100%;
    height: 100%;
    align-items: stretch;
  }

  .google-thumbnail-wrapper {
    flex: 1;
    display: block;
    min-width: 0;
    max-height: calc(90vh - 8rem);
    overflow: auto;
    cursor: zoom-in;
    position: relative;
  }

  .google-thumbnail-wrapper.zoomed {
    cursor: zoom-out;
  }

  .google-thumbnail {
    max-width: 100%;
    max-height: 70vh;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s ease;
    user-select: none;
    display: block;
  }

  .google-thumbnail-wrapper.zoomed .google-thumbnail {
    max-width: none;
    max-height: none;
  }

  .google-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    color: var(--color-text-secondary);
  }

  .google-loading .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .google-loading p {
    font-size: 0.875rem;
    margin: 0;
  }

  .google-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    color: var(--color-text-secondary);
  }

  .google-error .error-icon {
    opacity: 0.5;
  }

  .google-error p {
    font-size: 0.875rem;
    margin: 0;
  }

  .google-metadata-panel {
    flex: 0 0 320px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2rem;
    background: var(--color-surface-elevated);
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .google-icon-large {
    font-size: 3rem;
    text-align: center;
  }

  .google-file-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
    word-wrap: break-word;
  }

  .google-file-type {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }

  .google-metadata-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 0;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
  }

  .metadata-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .metadata-item .label {
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .metadata-item .value {
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }

  .google-page-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    margin: 1rem 0;
    background: rgba(88, 166, 255, 0.1);
    border: 1px solid rgba(88, 166, 255, 0.3);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #58a6ff;
  }

  .google-page-notice span {
    flex: 1;
  }

  .open-in-google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .open-in-google-btn.enhanced {
    padding: 1rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(66, 133, 244, 0.25);
  }

  .open-in-google-btn:hover {
    background: #3367d6;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
  }

  .open-in-google-btn.enhanced:hover {
    box-shadow: 0 6px 16px rgba(66, 133, 244, 0.4);
  }

  .open-in-google-btn:active {
    transform: translateY(0);
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