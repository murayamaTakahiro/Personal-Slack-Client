import { invoke } from '@tauri-apps/api/core';
import type { SlackFile } from '$lib/types/slack';
import {
  getMessageFilesMock,
  getFileInfoMock,
  downloadFileMock,
  clearFileCacheMock,
  getCacheStatsMock
} from './filesMock';

export interface FileDownloadProgress {
  fileId: string;
  progress: number;
  total: number;
  completed: boolean;
  error?: string;
}

export interface FileDownloadResult {
  success: boolean;
  localPath?: string;
  error?: string;
}

export interface FileInfoResult {
  file: SlackFile;
  cached: boolean;
  cachePath?: string;
}

/**
 * Get files attached to a specific message
 */
export async function getMessageFiles(
  workspaceId: string,
  channelId: string,
  messageTs: string
): Promise<SlackFile[]> {
  try {
    return await invoke('get_message_files', {
      workspaceId,
      channelId,
      messageTs
    });
  } catch (error) {
    console.warn('Tauri command not available, using mock:', error);
    return getMessageFilesMock(workspaceId, channelId, messageTs);
  }
}

/**
 * Get detailed information about a specific file
 */
export async function getFileInfo(
  workspaceId: string,
  fileId: string
): Promise<FileInfoResult> {
  try {
    return await invoke('get_file_info', {
      workspaceId,
      fileId
    });
  } catch (error) {
    console.warn('Tauri command not available, using mock:', error);
    return getFileInfoMock(workspaceId, fileId);
  }
}

/**
 * Download a file from Slack with authentication
 */
export async function downloadFile(
  workspaceId: string,
  fileId: string,
  url: string,
  onProgress?: (progress: FileDownloadProgress) => void
): Promise<FileDownloadResult> {
  try {
    // Start download
    const result = await invoke<FileDownloadResult>('download_file', {
      workspaceId,
      fileId,
      url
    });

    // TODO: Implement progress tracking with Tauri events
    if (onProgress) {
      // This would need to be implemented with Tauri event listeners
      // for real-time progress updates
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get a file from cache or download it
 */
export async function getOrDownloadFile(
  workspaceId: string,
  file: SlackFile
): Promise<FileDownloadResult> {
  // First check if file is cached
  const fileInfo = await getFileInfo(workspaceId, file.id);
  
  if (fileInfo.cached && fileInfo.cachePath) {
    return {
      success: true,
      localPath: fileInfo.cachePath
    };
  }

  // Download the file
  return await downloadFile(
    workspaceId,
    file.id,
    file.url_private_download || file.url_private
  );
}

/**
 * Clear file cache for a specific workspace
 */
export async function clearFileCache(workspaceId: string): Promise<void> {
  try {
    return await invoke('clear_file_cache', {
      workspaceId
    });
  } catch (error) {
    console.warn('Tauri command not available, using mock:', error);
    return clearFileCacheMock(workspaceId);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(workspaceId: string): Promise<{
  totalSize: number;
  fileCount: number;
  maxSize: number;
}> {
  try {
    return await invoke('get_cache_stats', {
      workspaceId
    });
  } catch (error) {
    console.warn('Tauri command not available, using mock:', error);
    return getCacheStatsMock(workspaceId);
  }
}

/**
 * Validate if a file type is supported for preview
 */
export function isPreviewSupported(file: SlackFile): boolean {
  const supportedTypes = [
    'image',
    'pdf',
    'text',
    'code',
    'zip',
    'csv',
    'json',
    'xml',
    'markdown'
  ];

  const mimeTypePatterns = [
    /^image\//,
    /^text\//,
    /^application\/pdf$/,
    /^application\/json$/,
    /^application\/xml$/,
    /^application\/zip$/
  ];

  // Check by pretty_type
  if (supportedTypes.some(type => 
    file.pretty_type?.toLowerCase().includes(type)
  )) {
    return true;
  }

  // Check by mimetype
  return mimeTypePatterns.some(pattern => 
    pattern.test(file.mimetype)
  );
}

/**
 * Get the best available thumbnail URL for a file
 */
export function getBestThumbnailUrl(file: SlackFile, targetSize?: number): string | undefined {
  // Default target size
  targetSize = targetSize || 360;

  // For PDFs, use PDF thumbnail if available
  if (file.mimetype === 'application/pdf' && file.thumb_pdf) {
    return file.thumb_pdf;
  }

  // Image thumbnails in order of preference based on target size
  const thumbnails = [
    { size: 64, url: file.thumb_64 },
    { size: 80, url: file.thumb_80 },
    { size: 160, url: file.thumb_160 },
    { size: 360, url: file.thumb_360 },
    { size: 480, url: file.thumb_480 },
    { size: 720, url: file.thumb_720 },
    { size: 960, url: file.thumb_960 },
    { size: 1024, url: file.thumb_1024 }
  ].filter(t => t.url);

  if (thumbnails.length === 0) {
    return undefined;
  }

  // Find the smallest thumbnail that's >= target size
  const suitable = thumbnails.find(t => t.size >= targetSize);
  
  // Return suitable thumbnail or the largest available
  return suitable?.url || thumbnails[thumbnails.length - 1].url;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * Get file icon based on file type
 */
export function getFileIcon(file: SlackFile): string {
  const typeIcons: Record<string, string> = {
    pdf: '📄',
    image: '🖼️',
    video: '🎥',
    audio: '🎵',
    zip: '📦',
    code: '💻',
    text: '📝',
    spreadsheet: '📊',
    presentation: '📽️',
    document: '📃'
  };

  // Check pretty_type first
  for (const [type, icon] of Object.entries(typeIcons)) {
    if (file.pretty_type?.toLowerCase().includes(type)) {
      return icon;
    }
  }

  // Check mimetype patterns
  if (/^image\//.test(file.mimetype)) return typeIcons.image;
  if (/^video\//.test(file.mimetype)) return typeIcons.video;
  if (/^audio\//.test(file.mimetype)) return typeIcons.audio;
  if (/^text\//.test(file.mimetype)) return typeIcons.text;
  
  // Default icon
  return '📎';
}