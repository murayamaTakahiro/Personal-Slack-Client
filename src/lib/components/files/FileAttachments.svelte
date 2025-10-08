<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { 
    groupFilesByType, 
    getFileTypeDisplayName,
    calculateTotalSize,
    type FileGroup 
  } from '$lib/services/fileService';
  import { downloadFilesInBatch } from '$lib/api/files';
  import { getDownloadFolder } from '$lib/stores/settings';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';
  import ImagePreview from './ImagePreview.svelte';
  import PdfPreview from './PdfPreview.svelte';
  import TextPreview from './TextPreview.svelte';
  import CsvPreview from './CsvPreview.svelte';
  import ExcelPreview from './ExcelPreview.svelte';
  import WordPreview from './WordPreview.svelte';
  import OfficePreview from './OfficePreview.svelte';
  import GoogleDocsPreview from './GoogleDocsPreview.svelte';
  import GenericFilePreview from './GenericFilePreview.svelte';

  export let files: SlackFile[] = [];
  export let workspaceId: string;
  export let compact: boolean = false;
  

  let fileGroups: FileGroup[] = [];
  let totalSize: string = '';
  let isLoading = true;
  let error: string | null = null;
  let isDownloading = false;

  $: if (files?.length > 0) {
    processFiles();
  }

  function processFiles() {
    try {
      isLoading = true;
      error = null;
      
      // Debug: Log received files
      console.log('[FileAttachments] Received files:', files);
      console.log('[FileAttachments] Files detailed:', JSON.stringify(files, null, 2));
      
      // Validate workspace ID
      if (!workspaceId) {
        console.warn('[FileAttachments] No workspace ID provided, using default');
        workspaceId = 'default';
      }
      
      // Filter out invalid files
      const validFiles = files.filter(file => {
        if (!file || !file.id) {
          console.warn('[FileAttachments] Skipping invalid file:', file);
          return false;
        }
        // Debug: Log valid file details
        console.log('[FileAttachments] Valid file:', {
          id: file.id,
          name: file.name,
          mimetype: file.mimetype,
          url_private: file.url_private,
          thumb_360: file.thumb_360,
          thumb_480: file.thumb_480,
          thumb_720: file.thumb_720,
          permalink: file.permalink
        });
        return true;
      });
      
      if (validFiles.length === 0) {
        console.warn('[FileAttachments] No valid files to display');
        fileGroups = [];
        totalSize = '0 B';
        isLoading = false;
        return;
      }
      
      fileGroups = groupFilesByType(validFiles);
      totalSize = calculateTotalSize(validFiles);
      
      isLoading = false;
    } catch (err) {
      console.error('[FileAttachments] Error processing files:', err);
      error = err instanceof Error ? err.message : 'Failed to process files';
      fileGroups = [];
      totalSize = '0 B';
      isLoading = false;
    }
  }

  
  async function downloadAllFiles() {
    if (!files.length || isDownloading) return;
    
    isDownloading = true;
    
    const totalFiles = files.length;
    
    // Show batch download started notification
    showInfo(
      'Batch download started',
      `Downloading ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`,
      3000 // Auto-dismiss after 3 seconds
    );
    
    try {
      const downloadFolder = getDownloadFolder();
      const filesToDownload = files.map(f => ({
        url: f.url_private_download || f.url_private,
        fileName: f.name
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
          const fileNames = files.slice(0, downloadedCount).map(f => f.name).join(', ');
          showInfo('Downloaded files', fileNames, 5000);
        }
      } else if (result.error && !result.error.includes('cancelled')) {
        showError(
          'Batch download failed',
          `Failed to download files: ${result.error}`,
          5000
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      showError(
        'Batch download failed',
        `Failed to download files: ${errorMessage}`,
        5000
      );
    } finally {
      isDownloading = false;
    }
  }
</script>

<div class="file-attachments" class:compact>
  {#if isLoading}
    <div class="loading-container">
      <div class="skeleton-loader">
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
    </div>
  {:else if error}
    <div class="error-container">
      <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13a6 6 0 110-12 6 6 0 010 12zm1-6V4H7v4h2zm0 3V9H7v2h2z"/>
      </svg>
      <span class="error-message">{error}</span>
    </div>
  {:else if fileGroups.length > 0}
    <div class="files-container">
      {#each fileGroups as group}
        <div class="file-group">
          {#if !compact}
            <div class="group-header">
              <h4 class="group-title">{getFileTypeDisplayName(group.type)}</h4>
              <span class="group-count">({group.files.length})</span>
            </div>
          {/if}
          
          <div class="files-grid" class:image-grid={group.type === 'image'}>
            {#each group.files as metadata (metadata.file.id)}
              <div class="file-item">
                {#if group.type === 'image'}
                  <ImagePreview
                    file={metadata.file}
                    {workspaceId}
                    showMetadata={!compact}
                  />
                {:else if group.type === 'pdf'}
                  <PdfPreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {:else if group.type === 'text' || group.type === 'code'}
                  <TextPreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {:else if group.type === 'csv'}
                  <CsvPreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {:else if group.type === 'excel'}
                  <ExcelPreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {:else if group.type === 'word'}
                  {#if metadata.file.name?.toLowerCase().endsWith('.docx') || metadata.file.mimetype?.includes('openxmlformats')}
                    <WordPreview
                      file={metadata.file}
                      {workspaceId}
                      {compact}
                    />
                  {:else}
                    <OfficePreview
                      file={metadata.file}
                      {workspaceId}
                      {compact}
                    />
                  {/if}
                {:else if group.type === 'powerpoint'}
                  <OfficePreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {:else if group.type === 'google-sheets' || group.type === 'google-docs'}
                  <GoogleDocsPreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {:else}
                  <GenericFilePreview
                    file={metadata.file}
                    {workspaceId}
                    {compact}
                  />
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
      
      {#if !compact}
        <div class="files-footer">
          <span class="total-info">
            Total: {files.length} file{files.length !== 1 ? 's' : ''} • {totalSize}
          </span>
          {#if files.length > 0}
            <button 
              class="download-all-btn"
              on:click={downloadAllFiles}
              disabled={isDownloading}
              title="Download all files (Shift+d when lightbox is open)"
            >
              <svg width="16" height="16" viewBox="0 0 20 20">
                <path fill="currentColor" d="M7 14L3 10h2.5V4h3v6H11l-4 4zm6-4V4h3v6h2.5l-4 4-4-4H13zm-10 7v1h14v-1H3z"/>
              </svg>
              {#if isDownloading}
                Downloading...
              {:else}
                Download All
              {/if}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-attachments {
    margin: 0.75rem 0;
    border-radius: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .file-attachments.compact {
    margin: 0.5rem 0;
    background: transparent;
    border: none;
  }

  .loading-container {
    padding: 1.5rem;
    display: flex;
    justify-content: center;
  }

  .skeleton-loader {
    display: flex;
    gap: 1rem;
    width: 100%;
    max-width: 600px;
  }

  .skeleton-item {
    flex: 1;
    height: 100px;
    background: linear-gradient(
      90deg,
      var(--color-skeleton-base) 25%,
      var(--color-skeleton-shine) 50%,
      var(--color-skeleton-base) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s infinite;
    border-radius: 0.375rem;
  }

  @keyframes skeleton-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .error-container {
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-error);
    background: var(--color-error-bg);
    border-radius: 0.375rem;
    margin: 0.5rem;
  }

  .error-icon {
    flex-shrink: 0;
  }

  .error-message {
    font-size: 0.875rem;
  }

  .files-container {
    padding: 1rem;
  }

  .compact .files-container {
    padding: 0;
  }

  .file-group {
    margin-bottom: 1.5rem;
  }

  .file-group:last-child {
    margin-bottom: 0;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .group-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .group-count {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .files-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }

  .files-grid.image-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.5rem;
  }

  .compact .files-grid {
    gap: 0.5rem;
  }

  .file-item {
    display: flex;
  }

  .files-footer {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .total-info {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  
  .download-all-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-primary-bg);
    color: var(--color-primary);
    border: 1px solid var(--color-primary);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .download-all-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: white;
  }
  
  .download-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .download-all-btn svg {
    flex-shrink: 0;
  }

  @media (max-width: 640px) {
    .files-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }

    .files-grid.image-grid {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    }
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-skeleton-base: #2c2d2e;
    --color-skeleton-shine: #3a3b3c;
    --color-primary: #1264a3;
    --color-primary-bg: rgba(18, 100, 163, 0.1);
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-skeleton-base: #f0f0f0;
    --color-skeleton-shine: #e0e0e0;
    --color-primary: #1264a3;
    --color-primary-bg: rgba(18, 100, 163, 0.05);
  }
</style>