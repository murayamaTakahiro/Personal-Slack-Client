<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize, getFileContent } from '$lib/api/files';
  import { downloadFile } from '$lib/api/files';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';
  import Papa from 'papaparse';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isLoading = true;
  let isDownloading = false;
  let error: string | null = null;
  let tableData: string[][] = [];
  let headers: string[] = [];
  let isTruncated = false;
  let totalRows = 0;
  let totalColumns = 0;
  let headerContainer: HTMLDivElement;
  let bodyContainer: HTMLDivElement;

  const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_PREVIEW_ROWS = 100;
  const MAX_DISPLAY_COLUMNS = 10;

  $: formattedSize = formatFileSize(file.size);
  $: fileName = file.name || file.title || 'Untitled';
  $: isCSV = fileName.toLowerCase().endsWith('.csv');
  $: isTSV = fileName.toLowerCase().endsWith('.tsv');
  $: delimiter = isTSV ? '\t' : ',';

  // Reload content when file changes
  $: if (file && file.id) {
    loadCsvContent();
  }

  // Sync horizontal scroll between header and body
  function handleBodyScroll() {
    if (headerContainer && bodyContainer) {
      headerContainer.scrollLeft = bodyContainer.scrollLeft;
    }
  }

  // Sync column widths between header and body tables
  function syncColumnWidths() {
    if (!headerContainer || !bodyContainer) return;

    const headerTable = headerContainer.querySelector('.header-table');
    const bodyTable = bodyContainer.querySelector('.body-table');

    if (!headerTable || !bodyTable) return;

    // Get all th and td elements
    const headerCells = Array.from(headerTable.querySelectorAll('th'));
    const bodyFirstRow = bodyTable.querySelector('tr');

    if (!bodyFirstRow) return;

    const bodyCells = Array.from(bodyFirstRow.querySelectorAll('td'));

    // Calculate max width for each column
    const columnWidths: number[] = [];

    headerCells.forEach((th, index) => {
      const td = bodyCells[index];
      if (!td) return;

      // Get natural width of content
      const thWidth = th.scrollWidth;
      const tdWidth = td.scrollWidth;
      const maxWidth = Math.max(thWidth, tdWidth, 100); // Minimum 100px

      columnWidths.push(maxWidth);
    });

    // Apply widths to both header and body cells
    headerCells.forEach((th, index) => {
      th.style.width = `${columnWidths[index]}px`;
      th.style.minWidth = `${columnWidths[index]}px`;
      th.style.maxWidth = `${columnWidths[index]}px`;
    });

    // Apply to all body rows
    const bodyRows = bodyTable.querySelectorAll('tr');
    bodyRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      cells.forEach((td, index) => {
        if (columnWidths[index]) {
          td.style.width = `${columnWidths[index]}px`;
          td.style.minWidth = `${columnWidths[index]}px`;
          td.style.maxWidth = `${columnWidths[index]}px`;
        }
      });
    });
  }

  onMount(() => {
    loadCsvContent();
  });

  // Sync column widths after data loads
  $: if (tableData.length > 0 && headerContainer && bodyContainer) {
    setTimeout(syncColumnWidths, 100);
  }

  async function loadCsvContent() {
    isLoading = true;
    error = null;

    try {
      // Check file size
      if (file.size > MAX_PREVIEW_SIZE) {
        showInfo(
          'Large file',
          `Showing first ${MAX_PREVIEW_ROWS} rows. Download for full content.`,
          5000
        );
      }

      const url = file.url_private_download || file.url_private;

      try {
        // Try to fetch content via backend with UTF-8 first
        let content: string;
        let encodingUsed = 'utf-8';

        try {
          content = await getFileContent(url, MAX_PREVIEW_SIZE, 'utf-8');
          // Quick check if content looks broken (contains replacement characters)
          if (content.includes('�') || content.includes('\ufffd')) {
            throw new Error('Possible encoding issue detected');
          }
        } catch (utf8Error) {
          console.log('[CsvPreview] UTF-8 failed, trying Shift-JIS encoding');
          try {
            // Try Shift-JIS (common for Japanese CSV files)
            content = await getFileContent(url, MAX_PREVIEW_SIZE, 'shift-jis');
            encodingUsed = 'shift-jis';
          } catch (sjisError) {
            // If both fail, try without specific encoding (auto-detect)
            console.log('[CsvPreview] Shift-JIS failed, trying auto-detect');
            content = await getFileContent(url, MAX_PREVIEW_SIZE);
            encodingUsed = 'auto';
          }
        }

        console.log(`[CsvPreview] Successfully loaded content with ${encodingUsed} encoding`);

        // Parse CSV/TSV content using papaparse
        parseCSV(content);
      } catch (backendError) {
        // Fallback: Show sample data for demo purposes
        console.warn('Backend not ready for file content:', backendError);

        // Create sample data for demonstration
        if (isCSV || isTSV) {
          headers = ['Column 1', 'Column 2', 'Column 3', 'Column 4'];
          tableData = [
            ['Sample', 'CSV', 'Data', 'Preview'],
            ['Row 1', 'Value A', 'Value B', 'Value C'],
            ['Row 2', 'Value D', 'Value E', 'Value F'],
            ['Row 3', 'Value G', 'Value H', 'Value I']
          ];
          totalRows = 4;
          totalColumns = 4;
          error = 'Preview temporarily unavailable. Download to view actual content.';
        }
      }
    } catch (err) {
      console.error('Error loading CSV content:', err);
      error = err instanceof Error ? err.message : 'Failed to load CSV content';
      tableData = [];
      headers = [];
    } finally {
      isLoading = false;
    }
  }

  function parseCSV(content: string) {
    // Use papaparse for proper CSV/TSV parsing
    const result = Papa.parse<string[]>(content, {
      delimiter: isTSV ? '\t' : undefined, // Auto-detect for CSV, use tab for TSV
      skipEmptyLines: true,
      header: false // Parse as array of arrays
    });

    if (result.errors.length > 0) {
      console.warn('CSV parsing warnings:', result.errors);
      // Continue with partial data if possible
    }

    if (result.data.length === 0) {
      error = 'Empty file';
      return;
    }

    // First row as headers
    const allHeaders = result.data[0];
    totalColumns = allHeaders.length;

    // Limit columns if too many
    if (allHeaders.length > MAX_DISPLAY_COLUMNS) {
      headers = allHeaders.slice(0, MAX_DISPLAY_COLUMNS);
      headers.push('...');
    } else {
      headers = allHeaders;
    }

    // Parse data rows
    const dataRows = result.data.slice(1);
    totalRows = dataRows.length;

    if (dataRows.length > MAX_PREVIEW_ROWS) {
      isTruncated = true;
    }

    tableData = dataRows
      .slice(0, MAX_PREVIEW_ROWS)
      .map(row => {
        let displayRow = row;
        if (row.length > MAX_DISPLAY_COLUMNS) {
          displayRow = row.slice(0, MAX_DISPLAY_COLUMNS);
          displayRow.push('...');
        }
        // Ensure all rows have same number of columns as headers
        while (displayRow.length < headers.length) {
          displayRow.push('');
        }
        return displayRow;
      });
  }

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    showInfo('Download started', `Downloading ${fileName}...`, 3000);

    try {
      const localPath = await downloadFile(
        workspaceId,
        file.id,
        file.url_private_download || file.url_private,
        file.name
      );

      if (localPath.success) {
        showSuccess('Download complete', `${fileName} saved successfully`, 3000);
      } else {
        showError('Download failed', `Failed to download ${fileName}`, 5000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      showError('Download failed', errorMessage, 5000);
    } finally {
      isDownloading = false;
    }
  }

  function exportToClipboard() {
    const csvContent = [headers, ...tableData]
      .map(row => row.join(delimiter))
      .join('\n');

    navigator.clipboard.writeText(csvContent).then(() => {
      showSuccess('Copied', 'Table data copied to clipboard', 2000);
    }).catch((err) => {
      showError('Copy failed', 'Failed to copy table data', 3000);
    });
  }
</script>

<div class="csv-preview" class:compact>
  {#if isLoading}
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading {isCSV ? 'CSV' : 'TSV'} file...</span>
    </div>
  {:else if error && tableData.length === 0}
    <div class="error-container">
      <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13a6 6 0 110-12 6 6 0 010 12zm1-6V4H7v4h2zm0 3V9H7v2h2z"/>
      </svg>
      <span>{error}</span>
    </div>
  {:else}
    <div class="preview-container">
      {#if !compact}
        <div class="preview-header">
          <div class="file-info">
            <span class="file-name">{fileName}</span>
            <span class="file-meta">
              {formattedSize}
              {#if totalRows > 0}
                • {totalRows} rows × {totalColumns} columns
              {/if}
              {#if isTruncated}
                • <span class="truncated-badge">Truncated</span>
              {/if}
            </span>
          </div>
          <div class="preview-actions">
            <button
              class="action-btn"
              on:click={exportToClipboard}
              title="Copy table to clipboard"
              disabled={tableData.length === 0}
            >
              <svg width="14" height="14" viewBox="0 0 16 16">
                <path fill="currentColor" d="M10 3H6C4.9 3 4 3.9 4 5v9c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V8l-5-5zm4 11c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h3v3c0 .55.45 1 1 1h3v6zm-4-8V3.5L13.5 7H10z"/>
              </svg>
            </button>
            <button
              class="action-btn primary"
              on:click={handleDownload}
              disabled={isDownloading}
              title="Download file"
            >
              {#if isDownloading}
                <div class="spinner small"></div>
              {:else}
                <svg width="14" height="14" viewBox="0 0 16 16">
                  <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
                </svg>
              {/if}
            </button>
          </div>
        </div>
      {/if}

      {#if error && tableData.length > 0}
        <div class="warning-banner">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7zm0 13c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6zm-.75-3.5h1.5V6h-1.5v4.5zm0-5.5h1.5v-1.5h-1.5V5z"/>
          </svg>
          <span>{error}</span>
        </div>
      {/if}

      <div class="table-container">
        <div class="header-container" bind:this={headerContainer}>
          <table class="data-table header-table">
            <thead>
              <tr>
                {#each headers as header}
                  <th>{header}</th>
                {/each}
              </tr>
            </thead>
          </table>
        </div>
        <div class="body-container" bind:this={bodyContainer} on:scroll={handleBodyScroll}>
          <table class="data-table body-table">
            <tbody>
              {#each tableData as row, rowIndex}
                <tr class:even={rowIndex % 2 === 0}>
                  {#each row as cell}
                    <td>{cell}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if isTruncated && !compact}
        <div class="truncation-notice">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7zm0 13c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6zm-.75-3.5h1.5V6h-1.5v4.5zm0-5.5h1.5v-1.5h-1.5V5z"/>
          </svg>
          <span>
            Preview shows first {MAX_PREVIEW_ROWS} rows.
            <button class="download-link" on:click={handleDownload}>
              Download full file
            </button>
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .csv-preview {
    width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .csv-preview.compact {
    border-radius: 0.375rem;
  }

  .loading-container {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-container {
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-error);
    background: var(--color-error-bg);
  }

  .error-icon {
    flex-shrink: 0;
  }

  .preview-container {
    display: flex;
    flex-direction: column;
  }

  .preview-header {
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-header-bg);
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-name {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .truncated-badge {
    padding: 0.125rem 0.375rem;
    background: var(--color-warning-bg);
    color: var(--color-warning);
    border-radius: 0.25rem;
    font-weight: 500;
  }

  .preview-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.375rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-hover-bg);
    border-color: var(--color-border-hover);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .warning-banner {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--color-warning-bg);
    color: var(--color-warning-text);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.875rem;
  }

  .table-container {
    max-height: 400px;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .compact .table-container {
    max-height: 200px;
  }

  .header-container {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--color-header-bg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    overflow-x: auto;
    overflow-y: visible;
    /* Ensure header has enough height */
    min-height: fit-content;
    /* Hide scrollbar for header */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .header-container::-webkit-scrollbar {
    display: none;
  }

  .body-container {
    flex: 1;
    overflow: auto;
    /* Ensure scrollbars are always visible when needed */
    overflow-x: auto;
    overflow-y: auto;
  }

  .data-table {
    border-collapse: collapse;
    font-size: 0.8125rem;
    /* Use fixed layout for consistent column widths */
    table-layout: fixed;
    /* Remove auto width to prevent centering */
    width: auto;
  }

  .header-table {
    margin-bottom: 0;
    display: table;
  }

  .body-table {
    margin-top: 0;
    display: table;
  }

  .data-table th {
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: var(--color-text-primary);
    border-bottom: 2px solid var(--color-border);
    white-space: nowrap;
    background: var(--color-header-bg);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-table td {
    padding: 0.375rem 0.75rem;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .data-table tbody tr:hover {
    background: var(--color-hover-bg);
  }

  .data-table tbody tr.even {
    background: var(--color-stripe-bg);
  }

  .truncation-notice {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--color-warning-bg);
    color: var(--color-warning-text);
    border-top: 1px solid var(--color-border);
    font-size: 0.875rem;
  }

  .download-link {
    background: none;
    border: none;
    color: var(--color-primary);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }

  .download-link:hover {
    color: var(--color-primary-hover);
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-border-light: rgba(86, 88, 86, 0.5);
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-header-bg: rgba(255, 255, 255, 0.03);
    --color-stripe-bg: rgba(255, 255, 255, 0.02);
    --color-hover-bg: rgba(255, 255, 255, 0.08);
    --color-border-hover: #707070;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-warning: #d4a72c;
    --color-warning-bg: rgba(212, 167, 44, 0.1);
    --color-warning-text: #f5e3a3;
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-border-light: rgba(221, 221, 221, 0.5);
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-header-bg: #f8f8f8;
    --color-stripe-bg: #fafafa;
    --color-hover-bg: rgba(0, 0, 0, 0.05);
    --color-border-hover: #bbbbbb;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-warning: #d4a72c;
    --color-warning-bg: rgba(212, 167, 44, 0.1);
    --color-warning-text: #7a5f1a;
  }
</style>