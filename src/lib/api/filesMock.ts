// Mock implementation for file operations when Tauri commands are not available
import type { SlackFile } from '$lib/types/slack';
import type { FileDownloadProgress, FileDownloadResult, FileInfoResult } from './files';

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
    url_private: 'https://via.placeholder.com/1920x1080/4a90e2/ffffff?text=Screenshot',
    url_private_download: 'https://via.placeholder.com/1920x1080/4a90e2/ffffff?text=Screenshot',
    permalink: 'https://test.slack.com/files/U123/F456/screenshot.png',
    thumb_64: 'https://via.placeholder.com/64x64/4a90e2/ffffff?text=IMG',
    thumb_80: 'https://via.placeholder.com/80x80/4a90e2/ffffff?text=IMG',
    thumb_160: 'https://via.placeholder.com/160x160/4a90e2/ffffff?text=IMG',
    thumb_360: 'https://via.placeholder.com/360x360/4a90e2/ffffff?text=IMG',
    thumb_480: 'https://via.placeholder.com/480x480/4a90e2/ffffff?text=IMG',
    thumb_720: 'https://via.placeholder.com/720x720/4a90e2/ffffff?text=IMG',
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