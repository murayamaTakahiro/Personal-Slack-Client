<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize } from '$lib/api/files';
  import { downloadFile } from '$lib/api/files';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';
  import { read, utils, type WorkSheet } from 'xlsx';
  import { invoke } from '@tauri-apps/api/core';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isLoading = true;
  let isDownloading = false;
  let error: string | null = null;
  let tableData: any[][] = [];
  let headers: string[] = [];
  let isTruncated = false;
  let totalRows = 0;
  let totalColumns = 0;
  let sheetNames: string[] = [];
  let currentSheetIndex = 0;
  let headerContainer: HTMLDivElement;
  let bodyContainer: HTMLDivElement;

  const MAX_PREVIEW_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_PREVIEW_ROWS = 100;
  const MAX_DISPLAY_COLUMNS = 50;

  $: formattedSize = formatFileSize(file.size);
  $: fileName = file.name || file.title || 'Untitled';
  $: currentSheetName = sheetNames[currentSheetIndex] || 'Sheet 1';

  // Reload content when file changes
  $: if (file && file.id) {
    loadExcelContent();
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

    const headerCells = Array.from(headerTable.querySelectorAll('th'));
    const bodyFirstRow = bodyTable.querySelector('tr');

    if (!bodyFirstRow) return;

    const bodyCells = Array.from(bodyFirstRow.querySelectorAll('td'));

    // Calculate max width for each column
    const columnWidths: number[] = [];

    headerCells.forEach((th, index) => {
      const td = bodyCells[index];
      if (!td) return;

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
    loadExcelContent();
  });

  // Sync column widths after data loads
  $: if (tableData.length > 0 && headerContainer && bodyContainer) {
    setTimeout(syncColumnWidths, 100);
  }

  async function loadExcelContent() {
    isLoading = true;
    error = null;

    try {
      if (file.size > MAX_PREVIEW_SIZE) {
        showInfo(
          'Large file',
          `Showing first ${MAX_PREVIEW_ROWS} rows. Download for full content.`,
          5000
        );
      }

      const url = file.url_private_download || file.url_private;

      // Download file as binary via Tauri backend
      const arrayBuffer = await invoke<number[]>('download_file_binary', {
        workspaceId,
        url
      });

      // Convert number array to Uint8Array
      const uint8Array = new Uint8Array(arrayBuffer);

      // Parse Excel file
      const workbook = read(uint8Array, { type: 'array' });

      // Get sheet names
      sheetNames = workbook.SheetNames;

      if (sheetNames.length === 0) {
        throw new Error('No sheets found in Excel file');
      }

      // Load the current sheet (or first sheet if currentSheetIndex is out of bounds)
      const sheetIndex = Math.min(currentSheetIndex, sheetNames.length - 1);
      loadSheet(workbook.Sheets[sheetNames[sheetIndex]]);

    } catch (err) {
      console.error('[ExcelPreview] Error loading Excel content:', err);
      error = err instanceof Error ? err.message : 'Failed to load Excel file';
      showError('Preview error', error, 5000);
    } finally {
      isLoading = false;
    }
  }

  function loadSheet(sheet: WorkSheet) {
    try {
      // Convert sheet to JSON (array of arrays)
      const jsonData: any[][] = utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false // Format all values as strings
      });

      if (jsonData.length === 0) {
        tableData = [];
        headers = [];
        totalRows = 0;
        totalColumns = 0;
        return;
      }

      totalRows = jsonData.length;

      // First row as headers
      const rawHeaders = jsonData[0] || [];
      totalColumns = rawHeaders.length;

      // Limit columns
      const displayColumns = Math.min(totalColumns, MAX_DISPLAY_COLUMNS);
      headers = rawHeaders.slice(0, displayColumns).map((h, i) =>
        h?.toString() || `Column ${i + 1}`
      );

      // Data rows (skip first row which is header)
      const dataRows = jsonData.slice(1);

      // Limit rows
      const displayRows = Math.min(dataRows.length, MAX_PREVIEW_ROWS);
      tableData = dataRows.slice(0, displayRows).map(row =>
        row.slice(0, displayColumns).map(cell => cell?.toString() || '')
      );

      isTruncated = displayRows < dataRows.length || displayColumns < totalColumns;

      // Sync column widths after data is set
      setTimeout(syncColumnWidths, 100);

    } catch (err) {
      console.error('[ExcelPreview] Error processing sheet:', err);
      error = 'Failed to process sheet data';
    }
  }

  function switchSheet(index: number) {
    currentSheetIndex = index;
    // Re-parse the workbook to get the selected sheet
    // For now, we'll need to reload the entire file
    // A better approach would be to keep the workbook in memory
    loadExcelContent();
  }

  // Export functions for external control (e.g., keyboard shortcuts in Lightbox)
  export function nextSheet() {
    if (currentSheetIndex < sheetNames.length - 1) {
      switchSheet(currentSheetIndex + 1);
    }
  }

  export function previousSheet() {
    if (currentSheetIndex > 0) {
      switchSheet(currentSheetIndex - 1);
    }
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
      showError('Download failed', `Failed to download ${fileName}: ${errorMessage}`, 5000);
    } finally {
      isDownloading = false;
    }
  }
</script>

<div class="excel-preview" class:compact>
  {#if isLoading}
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading Excel file...</span>
    </div>
  {:else if error}
    <div class="error-container">
      <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13a6 6 0 110-12 6 6 0 010 12zm1-6V4H7v4h2zm0 3V9H7v2h2z"/>
      </svg>
      <span>{error}</span>
    </div>
  {:else if tableData.length === 0}
    <div class="empty-container">
      <span>No data in this sheet</span>
    </div>
  {:else}
    <div class="preview-container">
      <div class="file-info">
        <div class="file-header">
          <div class="file-name-row">
            <span class="file-name" title={fileName}>{fileName}</span>
            <span class="file-size">{formattedSize}</span>
          </div>

          {#if sheetNames.length > 1}
            <div class="sheet-tabs">
              {#each sheetNames as sheetName, index}
                <button
                  class="sheet-tab"
                  class:active={index === currentSheetIndex}
                  on:click={() => switchSheet(index)}
                  title={sheetName}
                >
                  {sheetName}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if isTruncated}
          <div class="truncation-notice">
            Showing {tableData.length} of {totalRows - 1} rows
            {#if totalColumns > MAX_DISPLAY_COLUMNS}
              and {headers.length} of {totalColumns} columns
            {/if}
            . Download for full content.
          </div>
        {/if}
      </div>

      <div class="table-container">
        <!-- Sticky Header -->
        <div class="table-header-wrapper" bind:this={headerContainer}>
          <table class="header-table">
            <thead>
              <tr>
                {#each headers as header, index}
                  <th>{header}</th>
                {/each}
              </tr>
            </thead>
          </table>
        </div>

        <!-- Scrollable Body -->
        <div
          class="table-body-wrapper"
          bind:this={bodyContainer}
          on:scroll={handleBodyScroll}
        >
          <table class="body-table">
            <tbody>
              {#each tableData as row, rowIndex}
                <tr>
                  {#each row as cell, cellIndex}
                    <td>{cell}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if !compact}
        <div class="actions">
          <button
            class="download-button"
            on:click={handleDownload}
            disabled={isDownloading}
          >
            {#if isDownloading}
              <div class="spinner small"></div>
            {:else}
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
              </svg>
            {/if}
            <span>{isDownloading ? 'Downloading...' : 'Download Excel File'}</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .excel-preview {
    width: 100%;
    border-radius: 0.375rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .excel-preview.compact {
    background: transparent;
    border: none;
  }

  .loading-container,
  .error-container,
  .empty-container {
    padding: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--color-text-secondary);
  }

  .error-container {
    color: var(--color-error);
    background: var(--color-error-bg);
    border-radius: 0.375rem;
  }

  .spinner {
    width: 20px;
    height: 20px;
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
    to {
      transform: rotate(360deg);
    }
  }

  .preview-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-name-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .file-name {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .sheet-tabs {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }

  .sheet-tab {
    padding: 0.25rem 0.75rem;
    background: var(--color-tab-bg);
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .sheet-tab:hover {
    background: var(--color-tab-hover);
  }

  .sheet-tab.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .truncation-notice {
    padding: 0.5rem;
    background: var(--color-notice-bg);
    color: var(--color-notice-text);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .table-container {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    overflow: hidden;
    max-height: 600px;
  }

  .table-header-wrapper {
    overflow: hidden;
    background: var(--color-header-bg);
    border-bottom: 2px solid var(--color-border);
  }

  .table-body-wrapper {
    overflow: auto;
    flex: 1;
  }

  .header-table,
  .body-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .header-table th {
    padding: 0.5rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-primary);
    background: var(--color-header-bg);
    border-right: 1px solid var(--color-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .body-table td {
    padding: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-text-primary);
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .body-table tr:last-child td {
    border-bottom: none;
  }

  .header-table th:last-child,
  .body-table td:last-child {
    border-right: none;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .download-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .download-button:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .download-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-header-bg: #2c2d2e;
    --color-tab-bg: #2c2d2e;
    --color-tab-hover: #3a3b3c;
    --color-notice-bg: rgba(18, 100, 163, 0.1);
    --color-notice-text: #a3c9e1;
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-header-bg: #f6f6f6;
    --color-tab-bg: #f6f6f6;
    --color-tab-hover: #e8e8e8;
    --color-notice-bg: rgba(18, 100, 163, 0.05);
    --color-notice-text: #0d4f8b;
  }
</style>
