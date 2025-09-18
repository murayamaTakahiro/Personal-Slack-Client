import { invoke } from '@tauri-apps/api/core';

export interface FileUploadRequest {
  file_path: string;
  channel_id: string;
  initial_comment?: string;
  thread_ts?: string;
}

export interface UploadDataRequest {
  data: string; // Base64 encoded
  filename: string;
  channel_id: string;
  initial_comment?: string;
  thread_ts?: string;
}

export interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  size: number;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  permalink_public?: string;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_480?: string;
  thumb_720?: string;
}

export interface FileUploadResponse {
  ok: boolean;
  file?: SlackFile;
  error?: string;
}

export interface FileInfo {
  filename: string;
  mime_type: string;
  size: number;
  path: string;
}

/**
 * Upload a file to Slack
 */
export async function uploadFileToSlack(
  filePath: string,
  channelId: string,
  initialComment?: string,
  threadTs?: string
): Promise<FileUploadResponse> {
  const request: FileUploadRequest = {
    file_path: filePath,
    channel_id: channelId,
    initial_comment: initialComment,
    thread_ts: threadTs,
  };

  return await invoke('upload_file_to_slack', { request });
}

/**
 * Upload clipboard image to Slack
 */
export async function uploadClipboardImage(
  data: string,
  filename: string,
  channelId: string,
  initialComment?: string,
  threadTs?: string
): Promise<FileUploadResponse> {
  const request: UploadDataRequest = {
    data,
    filename,
    channel_id: channelId,
    initial_comment: initialComment,
    thread_ts: threadTs,
  };

  return await invoke('upload_clipboard_image', { request });
}

/**
 * Get file info for a local file
 */
export async function getFileInfo(filePath: string): Promise<FileInfo> {
  return await invoke('get_file_info', { filePath });
}

/**
 * Convert a File object to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get an image from clipboard
 */
export async function getClipboardImage(): Promise<{ data: string; filename: string } | null> {
  try {
    const clipboardItems = await navigator.clipboard.read();

    for (const item of clipboardItems) {
      // Check for image types
      const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      const imageType = imageTypes.find(type => item.types.includes(type));

      if (imageType) {
        const blob = await item.getType(imageType);
        const base64 = await blobToBase64(blob);
        const extension = imageType.split('/')[1];
        const filename = `clipboard-image-${Date.now()}.${extension}`;

        return { data: base64, filename };
      }
    }
  } catch (error) {
    console.error('Failed to read clipboard:', error);
  }

  return null;
}

/**
 * Convert a Blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove the data URL prefix
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSizeMB: number = 1024): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return size <= maxSizeBytes;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}