<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    uploadFileToSlack,
    uploadClipboardImage,
    uploadFilesBatch,
    formatFileSize,
    validateFileSize,
    getFileInfo,
    fileToBase64,
    type SlackFile,
    type BatchUploadRequest,
  } from '../../api/upload';

  export let channelId: string;
  export let threadTs: string = '';

  const dispatch = createEventDispatcher();

  interface FileUpload {
    id: string;
    file?: File;
    filePath?: string; // For file picker files
    data?: string; // Base64 for clipboard images
    filename: string;
    size: number;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    progress: number;
    error?: string;
    slackFile?: SlackFile;
    preview?: string;
    initialComment?: string; // Message to include with the upload
  }

  let uploads: FileUpload[] = [];
  let uploadQueue: FileUpload[] = [];
  let isUploading = false;
  const maxConcurrentUploads = 3;
  let currentUploads = 0;

  export async function addFile(file: File) {
    const id = `file-${Date.now()}-${Math.random()}`;

    // Validate file size (1GB max)
    if (!validateFileSize(file.size)) {
      dispatch('error', { message: `File ${file.name} is too large. Maximum size is 1GB.` });
      return;
    }

    const upload: FileUpload = {
      id,
      file,
      filename: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
    };

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      upload.preview = URL.createObjectURL(file);
    }

    uploads = [...uploads, upload];
    uploadQueue.push(upload);
    // Don't auto-start processing, wait for uploadAllWithComment
    // processQueue();

    return id;
  }

  export async function addFilePath(filePath: string) {
    const id = `filepath-${Date.now()}-${Math.random()}`;

    try {
      // Get file info from the backend
      const fileInfo = await getFileInfo(filePath);

      // Validate file size (1GB max)
      if (!validateFileSize(fileInfo.size)) {
        dispatch('error', { message: `File ${fileInfo.filename} is too large. Maximum size is 1GB.` });
        return;
      }

      const upload: FileUpload = {
        id,
        filePath, // Store the file path instead of File object
        filename: fileInfo.filename,
        size: fileInfo.size,
        status: 'pending',
        progress: 0,
      };

      // For images, we could generate a preview but that would require reading the file
      // For now, just show the file icon

      uploads = [...uploads, upload];
      uploadQueue.push(upload);
      // Don't auto-start processing, wait for uploadAllWithComment
      // processQueue();

      return id;
    } catch (error) {
      dispatch('error', { message: `Failed to add file: ${error}` });
      return null;
    }
  }

  export async function addFiles(files: File[]) {
    for (const file of files) {
      await addFile(file);
    }
  }

  export async function addClipboardData(data: string, filename: string) {
    const id = `clipboard-${Date.now()}`;

    // Estimate size from base64 (roughly 3/4 of the string length)
    const estimatedSize = Math.floor((data.length * 3) / 4);

    if (!validateFileSize(estimatedSize)) {
      dispatch('error', { message: 'Clipboard image is too large. Maximum size is 1GB.' });
      return;
    }

    const upload: FileUpload = {
      id,
      data,
      filename,
      size: estimatedSize,
      status: 'pending',
      progress: 0,
      preview: `data:image/png;base64,${data}`, // Assume PNG for preview
    };

    uploads = [...uploads, upload];
    uploadQueue.push(upload);
    // Don't auto-start processing, wait for uploadAllWithComment
    // processQueue();

    return id;
  }

  export async function uploadAllWithComment(initialComment: string = '') {
    // Batch upload all pending files in a single message
    const pendingUploads = uploads.filter(u => u.status === 'pending');
    if (pendingUploads.length === 0) return;

    // Separate files by type
    const filePathUploads = pendingUploads.filter(u => u.filePath);
    const dataUploads = pendingUploads.filter(u => u.data);
    const fileObjectUploads = pendingUploads.filter(u => u.file && !u.filePath && !u.data);

    // Prepare batch request
    const batchRequest: BatchUploadRequest = {
      files: filePathUploads.map(u => ({
        file_path: u.filePath!,
        channel_id: channelId,
        initial_comment: undefined, // Will be set at batch level
        thread_ts: undefined, // Will be set at batch level
      })),
      data_items: dataUploads.map(u => ({
        data: u.data!,
        filename: u.filename,
        channel_id: channelId,
        initial_comment: undefined,
        thread_ts: undefined,
      })),
      channel_id: channelId,
      initial_comment: initialComment || undefined,
      thread_ts: threadTs || undefined,
    };

    // Handle File objects (convert to base64)
    for (const upload of fileObjectUploads) {
      const base64 = await fileToBase64(upload.file!);
      batchRequest.data_items.push({
        data: base64,
        filename: upload.filename,
        channel_id: channelId,
        initial_comment: undefined,
        thread_ts: undefined,
      });
    }

    // Mark all as uploading
    pendingUploads.forEach(u => {
      u.status = 'uploading';
    });
    uploads = uploads;

    try {
      // Upload all files in batch
      const response = await uploadFilesBatch(batchRequest);

      if (response && response.ok) {
        // Mark all as completed
        pendingUploads.forEach(u => {
          u.status = 'completed';
          u.progress = 100;
        });
        dispatch('uploaded', { batch: true, count: pendingUploads.length });
      } else {
        throw new Error(response?.error || 'Batch upload failed');
      }
    } catch (error) {
      // Mark all as failed
      pendingUploads.forEach(u => {
        u.status = 'failed';
        u.error = error instanceof Error ? error.message : 'Upload failed';
      });
      dispatch('error', { error: error instanceof Error ? error.message : 'Batch upload failed' });
    }

    uploads = uploads;
    checkAllUploadsComplete();
  }

  async function processQueue() {
    if (isUploading && currentUploads >= maxConcurrentUploads) {
      return;
    }

    const pending = uploadQueue.find((u) => u.status === 'pending');
    if (!pending) {
      if (currentUploads === 0) {
        isUploading = false;
        checkAllUploadsComplete();
      }
      return;
    }

    isUploading = true;
    currentUploads++;
    await uploadFile(pending);
    currentUploads--;

    // Process next in queue
    processQueue();
  }

  async function uploadFile(upload: FileUpload) {
    // Update status
    upload.status = 'uploading';
    uploads = uploads;

    try {
      let response;

      if (upload.filePath) {
        // Upload file from file path (from file picker)
        response = await uploadFileToSlack(
          upload.filePath,
          channelId,
          upload.initialComment,
          threadTs || undefined
        );
      } else if (upload.file) {
        // Upload File object (from drag & drop - not yet fully implemented)
        // We need to convert File to a path or base64
        // For now, this is a limitation
        const base64 = await fileToBase64(upload.file);
        response = await uploadClipboardImage(
          base64,
          upload.filename,
          channelId,
          upload.initialComment,
          threadTs || undefined
        );
      } else if (upload.data) {
        // Upload clipboard data
        response = await uploadClipboardImage(
          upload.data,
          upload.filename,
          channelId,
          upload.initialComment,
          threadTs || undefined
        );
      } else {
        throw new Error('No file or data to upload');
      }

      if (response && response.ok && response.file) {
        upload.status = 'completed';
        upload.progress = 100;
        upload.slackFile = response.file;
        dispatch('uploaded', { file: response.file });
      } else {
        throw new Error(response?.error || 'Upload failed');
      }
    } catch (error) {
      upload.status = 'failed';
      upload.error = error instanceof Error ? error.message : 'Upload failed';
      dispatch('error', { upload, error: upload.error });
    }

    uploads = uploads;
  }

  export function removeUpload(id: string) {
    uploads = uploads.filter((u) => u.id !== id);
    uploadQueue = uploadQueue.filter((u) => u.id !== id);

    // Clean up preview URLs
    const upload = uploads.find((u) => u.id === id);
    if (upload?.preview && upload.file) {
      URL.revokeObjectURL(upload.preview);
    }
  }

  export function retryUpload(id: string) {
    const upload = uploads.find((u) => u.id === id);
    if (upload && upload.status === 'failed') {
      upload.status = 'pending';
      upload.error = undefined;
      upload.progress = 0;
      uploads = uploads;
      uploadQueue.push(upload);
      processQueue();
    }
  }

  export function clearCompleted() {
    const completed = uploads.filter((u) => u.status === 'completed');
    completed.forEach((u) => {
      if (u.preview && u.file) {
        URL.revokeObjectURL(u.preview);
      }
    });
    uploads = uploads.filter((u) => u.status !== 'completed');
  }

  function checkAllUploadsComplete() {
    const allComplete = uploads.every((u) => u.status === 'completed' || u.status === 'failed');
    if (allComplete) {
      dispatch('allComplete');
    }
  }

  export function getUploads() {
    return uploads;
  }

  export function hasUploads() {
    return uploads.length > 0;
  }

  export function getUploadedFiles(): SlackFile[] {
    return uploads
      .filter((u) => u.status === 'completed' && u.slackFile)
      .map((u) => u.slackFile!);
  }
</script>

<div class="file-upload-manager">
  {#if uploads.length > 0}
    <div class="uploads-list">
      {#each uploads as upload (upload.id)}
        <div class="upload-item" class:uploading={upload.status === 'uploading'} class:failed={upload.status === 'failed'} class:completed={upload.status === 'completed'}>
          {#if upload.preview}
            <div class="file-preview">
              <img src={upload.preview} alt={upload.filename} />
            </div>
          {:else}
            <div class="file-icon">
              📄
            </div>
          {/if}

          <div class="file-details">
            <div class="file-name">{upload.filename}</div>
            <div class="file-size">{formatFileSize(upload.size)}</div>

            {#if upload.status === 'uploading'}
              <div class="progress-bar">
                <div class="progress-fill" style="width: {upload.progress}%"></div>
              </div>
            {:else if upload.status === 'failed'}
              <div class="error-message">{upload.error}</div>
            {:else if upload.status === 'completed'}
              <div class="success-message">Uploaded</div>
            {/if}
          </div>

          <div class="file-actions">
            {#if upload.status === 'failed'}
              <button class="retry-btn" on:click={() => retryUpload(upload.id)} title="Retry">
                🔄
              </button>
            {/if}
            {#if upload.status !== 'uploading'}
              <button class="remove-btn" on:click={() => removeUpload(upload.id)} title="Remove">
                ×
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if uploads.some((u) => u.status === 'completed')}
      <div class="upload-actions">
        <button class="clear-btn" on:click={clearCompleted}>Clear completed</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .file-upload-manager {
    margin: 8px 0;
  }

  .uploads-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
  }

  .upload-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    transition: all 0.2s;
  }

  .upload-item.uploading {
    background: var(--color-background-secondary);
  }

  .upload-item.failed {
    background: #fee;
    border-color: #fcc;
  }

  .upload-item.completed {
    background: #efe;
    border-color: #cfc;
  }

  .file-preview {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    flex-shrink: 0;
  }

  .file-details {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .progress-bar {
    margin-top: 4px;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    transition: width 0.3s;
  }

  .error-message {
    margin-top: 4px;
    font-size: 12px;
    color: #c00;
  }

  .success-message {
    margin-top: 4px;
    font-size: 12px;
    color: #080;
  }

  .file-actions {
    display: flex;
    gap: 4px;
  }

  .retry-btn,
  .remove-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .retry-btn:hover,
  .remove-btn:hover {
    background: var(--color-hover);
  }

  .remove-btn {
    font-size: 20px;
    line-height: 1;
  }

  .upload-actions {
    margin-top: 8px;
    text-align: right;
  }

  .clear-btn {
    padding: 4px 12px;
    font-size: 12px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    background: var(--color-hover);
  }

  /* Dark mode adjustments */
  :global([data-theme='dark']) .upload-item.failed {
    background: #400;
    border-color: #600;
  }

  :global([data-theme='dark']) .upload-item.completed {
    background: #040;
    border-color: #060;
  }
</style>