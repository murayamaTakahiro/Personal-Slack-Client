import { writable, derived, get } from 'svelte/store';
import type { SlackFile } from '$lib/types/slack';
import type { FileMetadata } from '$lib/services/fileService';
import { processFileMetadata } from '$lib/services/fileService';
import { downloadFile, type FileDownloadProgress } from '$lib/api/files';

export interface LightboxState {
  isOpen: boolean;
  currentFile?: FileMetadata;
  allFiles: FileMetadata[];
  currentIndex: number;
}

export interface DownloadState {
  fileId: string;
  progress: number;
  total: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  error?: string;
  localPath?: string;
}

export interface FilePreviewState {
  lightbox: LightboxState;
  downloads: Map<string, DownloadState>;
  loadingFiles: Set<string>;
  errorFiles: Map<string, string>;
  cachedPaths: Map<string, string>;
}

// Create the main store
function createFilePreviewStore() {
  const { subscribe, set, update } = writable<FilePreviewState>({
    lightbox: {
      isOpen: false,
      allFiles: [],
      currentIndex: 0
    },
    downloads: new Map(),
    loadingFiles: new Set(),
    errorFiles: new Map(),
    cachedPaths: new Map()
  });

  return {
    subscribe,

    // Lightbox management
    openLightbox(file: FileMetadata, allFiles: FileMetadata[]) {
      update(state => {
        const index = allFiles.findIndex(f => f.file.id === file.file.id);
        return {
          ...state,
          lightbox: {
            isOpen: true,
            currentFile: file,
            allFiles,
            currentIndex: Math.max(0, index)
          }
        };
      });
    },

    closeLightbox() {
      update(state => ({
        ...state,
        lightbox: {
          ...state.lightbox,
          isOpen: false,
          currentFile: undefined
        }
      }));
    },

    nextImage() {
      update(state => {
        const { currentIndex, allFiles } = state.lightbox;
        const newIndex = (currentIndex + 1) % allFiles.length;
        return {
          ...state,
          lightbox: {
            ...state.lightbox,
            currentIndex: newIndex,
            currentFile: allFiles[newIndex]
          }
        };
      });
    },

    previousImage() {
      update(state => {
        const { currentIndex, allFiles } = state.lightbox;
        const newIndex = currentIndex === 0 ? allFiles.length - 1 : currentIndex - 1;
        return {
          ...state,
          lightbox: {
            ...state.lightbox,
            currentIndex: newIndex,
            currentFile: allFiles[newIndex]
          }
        };
      });
    },

    // Download management
    startDownload(fileId: string, total: number = 0) {
      update(state => {
        const downloads = new Map(state.downloads);
        downloads.set(fileId, {
          fileId,
          progress: 0,
          total,
          status: 'downloading'
        });
        return {
          ...state,
          downloads
        };
      });
    },

    updateDownloadProgress(fileId: string, progress: number, total: number) {
      update(state => {
        const downloads = new Map(state.downloads);
        const existing = downloads.get(fileId);
        if (existing) {
          downloads.set(fileId, {
            ...existing,
            progress,
            total,
            status: 'downloading'
          });
        }
        return {
          ...state,
          downloads
        };
      });
    },

    completeDownload(fileId: string, localPath: string) {
      update(state => {
        const downloads = new Map(state.downloads);
        const existing = downloads.get(fileId);
        if (existing) {
          downloads.set(fileId, {
            ...existing,
            status: 'completed',
            localPath
          });
        }

        const cachedPaths = new Map(state.cachedPaths);
        cachedPaths.set(fileId, localPath);

        return {
          ...state,
          downloads,
          cachedPaths
        };
      });
    },

    failDownload(fileId: string, error: string) {
      update(state => {
        const downloads = new Map(state.downloads);
        const existing = downloads.get(fileId);
        if (existing) {
          downloads.set(fileId, {
            ...existing,
            status: 'failed',
            error
          });
        }

        const errorFiles = new Map(state.errorFiles);
        errorFiles.set(fileId, error);

        return {
          ...state,
          downloads,
          errorFiles
        };
      });
    },

    // File loading state
    setFileLoading(fileId: string, isLoading: boolean) {
      update(state => {
        const loadingFiles = new Set(state.loadingFiles);
        if (isLoading) {
          loadingFiles.add(fileId);
        } else {
          loadingFiles.delete(fileId);
        }
        return {
          ...state,
          loadingFiles
        };
      });
    },

    setFileError(fileId: string, error: string | null) {
      update(state => {
        const errorFiles = new Map(state.errorFiles);
        if (error) {
          errorFiles.set(fileId, error);
        } else {
          errorFiles.delete(fileId);
        }
        return {
          ...state,
          errorFiles
        };
      });
    },

    setCachedPath(fileId: string, path: string) {
      update(state => {
        const cachedPaths = new Map(state.cachedPaths);
        cachedPaths.set(fileId, path);
        return {
          ...state,
          cachedPaths
        };
      });
    },

    // Clear state
    clearDownloads() {
      update(state => ({
        ...state,
        downloads: new Map()
      }));
    },

    clearErrors() {
      update(state => ({
        ...state,
        errorFiles: new Map()
      }));
    },

    reset() {
      set({
        lightbox: {
          isOpen: false,
          allFiles: [],
          currentIndex: 0
        },
        downloads: new Map(),
        loadingFiles: new Set(),
        errorFiles: new Map(),
        cachedPaths: new Map()
      });
    }
  };
}

// Create the store instance
export const filePreviewStore = createFilePreviewStore();

// Derived stores for common queries
export const lightboxOpen = derived(
  filePreviewStore,
  $store => $store.lightbox.isOpen
);

export const currentLightboxFile = derived(
  filePreviewStore,
  $store => $store.lightbox.currentFile
);

export const downloadProgress = derived(
  filePreviewStore,
  $store => (fileId: string) => {
    const download = $store.downloads.get(fileId);
    if (!download) return null;
    
    if (download.total === 0) return 0;
    return (download.progress / download.total) * 100;
  }
);

export const isFileLoading = derived(
  filePreviewStore,
  $store => (fileId: string) => $store.loadingFiles.has(fileId)
);

export const getFileError = derived(
  filePreviewStore,
  $store => (fileId: string) => $store.errorFiles.get(fileId)
);

export const getCachedPath = derived(
  filePreviewStore,
  $store => (fileId: string) => $store.cachedPaths.get(fileId)
);

// Helper function to download file with progress tracking
export async function downloadFileWithProgress(
  workspaceId: string,
  file: SlackFile
): Promise<string | null> {
  const fileId = file.id;
  
  // Check if already cached
  const currentState = get(filePreviewStore);
  const cachedPath = currentState.cachedPaths.get(fileId);
  if (cachedPath) {
    return cachedPath;
  }

  // Start download
  filePreviewStore.startDownload(fileId, file.size);

  try {
    const result = await downloadFile(
      workspaceId,
      fileId,
      file.url_private_download || file.url_private,
      (progress: FileDownloadProgress) => {
        filePreviewStore.updateDownloadProgress(
          fileId,
          progress.progress,
          progress.total
        );
      }
    );

    if (result.success && result.localPath) {
      filePreviewStore.completeDownload(fileId, result.localPath);
      return result.localPath;
    } else {
      filePreviewStore.failDownload(fileId, result.error || 'Download failed');
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    filePreviewStore.failDownload(fileId, errorMessage);
    return null;
  }
}

// Helper to process and open files in lightbox
export function openFilesInLightbox(files: SlackFile[], selectedFile?: SlackFile) {
  const metadata = files.map(processFileMetadata);
  const selected = selectedFile 
    ? processFileMetadata(selectedFile)
    : metadata[0];

  if (selected && metadata.length > 0) {
    filePreviewStore.openLightbox(selected, metadata);
  }
}

// Keyboard navigation helper
export function handleLightboxKeyboard(event: KeyboardEvent) {
  const state = get(filePreviewStore);
  if (!state.lightbox.isOpen) return;

  switch (event.key) {
    case 'Escape':
      filePreviewStore.closeLightbox();
      break;
    case 'ArrowLeft':
      filePreviewStore.previousImage();
      break;
    case 'ArrowRight':
      filePreviewStore.nextImage();
      break;
  }
}