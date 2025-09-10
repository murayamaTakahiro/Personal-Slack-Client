// Mock implementation for file operations when Tauri commands are not available
import type { SlackFile } from '$lib/types/slack';
import type { FileDownloadProgress, FileDownloadResult, FileInfoResult } from './files';
import { generateFilePlaceholder, generateThumbnailPlaceholder } from '$lib/utils/placeholder';

// Mock data for testing
const mockFiles: SlackFile[] = [
  {
    id: 'F1234567890',
    created: 1699000000,
    timestamp: 1699000000,
    name: 'screenshot.png',
    title: 'App Screenshot',
    mimetype: 'image/png',
    filetype: 'png',
    pretty_type: 'PNG Image',
    user: 'U1234567890',
    username: 'testuser',
    editable: false,
    size: 245678,
    mode: 'hosted',
    is_external: false,
    external_type: '',
    is_public: false,
    public_url_shared: false,
    display_as_bot: false,
    url_private: generateThumbnailPlaceholder(1920, 1080, 'Screenshot'),
    url_private_download: generateThumbnailPlaceholder(1920, 1080, 'Screenshot'),
    permalink: 'https://test.slack.com/files/U123/F456/screenshot.png',
    thumb_64: generateThumbnailPlaceholder(64, 64),
    thumb_80: generateThumbnailPlaceholder(80, 80),
    thumb_160: generateThumbnailPlaceholder(160, 160),
    thumb_360: generateThumbnailPlaceholder(360, 360),
    thumb_480: generateThumbnailPlaceholder(480, 480),
    thumb_720: generateThumbnailPlaceholder(720, 720),
    original_w: 1920,
    original_h: 1080,
    has_rich_preview: true
  }
];

export async function getMessageFilesMock(
  workspaceId: string,
  channelId: string,
  messageTs: string
): Promise<SlackFile[]> {
  // Return mock files for testing
  console.log('Mock: Getting files for message', { workspaceId, channelId, messageTs });
  return mockFiles;
}

export async function getFileInfoMock(
  workspaceId: string,
  fileId: string
): Promise<FileInfoResult> {
  console.log('Mock: Getting file info', { workspaceId, fileId });
  const file = mockFiles.find(f => f.id === fileId) || mockFiles[0];
  return {
    file,
    cached: false,
    cachePath: undefined
  };
}

export async function downloadFileMock(
  workspaceId: string,
  fileId: string,
  url: string,
  onProgress?: (progress: FileDownloadProgress) => void
): Promise<FileDownloadResult> {
  console.log('Mock: Downloading file', { workspaceId, fileId, url });
  
  // Simulate download progress
  if (onProgress) {
    for (let i = 0; i <= 100; i += 20) {
      setTimeout(() => {
        onProgress({
          fileId,
          progress: i,
          total: 100,
          completed: i === 100
        });
      }, i * 10);
    }
  }
  
  return {
    success: true,
    localPath: `/tmp/mock-download-${fileId}`
  };
}

export async function clearFileCacheMock(workspaceId: string): Promise<void> {
  console.log('Mock: Clearing file cache', { workspaceId });
}

export async function getCacheStatsMock(workspaceId: string): Promise<{
  totalSize: number;
  fileCount: number;
  maxSize: number;
}> {
  console.log('Mock: Getting cache stats', { workspaceId });
  return {
    totalSize: 1024 * 1024 * 50, // 50MB
    fileCount: 25,
    maxSize: 1024 * 1024 * 500 // 500MB
  };
}