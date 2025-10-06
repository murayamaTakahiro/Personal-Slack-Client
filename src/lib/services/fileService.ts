import type { SlackFile } from '$lib/types/slack';
import { 
  getMessageFiles,
  getFileInfo,
  downloadFile,
  getOrDownloadFile,
  isPreviewSupported,
  getBestThumbnailUrl,
  formatFileSize,
  getFileIcon
} from '$lib/api/files';

export type FileType =
  | 'image'
  | 'pdf'
  | 'text'         // Plain text files (txt, log, etc.)
  | 'csv'          // CSV and TSV files
  | 'excel'        // Excel files (xlsx, xls)
  | 'word'         // Word documents (docx, doc)
  | 'powerpoint'   // PowerPoint presentations (pptx, ppt)
  | 'google-sheets'  // Google Sheets (external files)
  | 'google-docs'    // Google Docs (external files)
  | 'video'
  | 'audio'
  | 'document'     // Generic documents
  | 'spreadsheet'  // Generic spreadsheets
  | 'presentation'
  | 'code'
  | 'archive'
  | 'unknown';

export interface FileMetadata {
  file: SlackFile;
  type: FileType;
  icon: string;
  displaySize: string;
  thumbnailUrl?: string;
  canPreview: boolean;
  downloadUrl: string;
}

export interface FileGroup {
  type: FileType;
  files: FileMetadata[];
}

/**
 * Determine the file type from SlackFile metadata
 */
export function getFileType(file: SlackFile): FileType {
  const mimeType = file.mimetype?.toLowerCase() || '';
  const prettyType = file.pretty_type?.toLowerCase() || '';
  const fileExt = file.name?.split('.').pop()?.toLowerCase() || '';
  const filetype = file.filetype?.toLowerCase() || '';

  // Google Docs/Sheets (PRIORITY: Check first to avoid conflicts with generic spreadsheet/document detection)
  if (file.is_external) {
    const url = file.url_private || '';
    const extType = file.external_type || '';

    // Google Sheets detection
    if (url.includes('docs.google.com/spreadsheets/') ||
        filetype === 'gsheet' ||
        mimeType === 'application/vnd.google-apps.spreadsheet') {
      return 'google-sheets';
    }

    // Google Docs detection
    if (url.includes('docs.google.com/document/') ||
        filetype === 'gdoc' ||
        mimeType === 'application/vnd.google-apps.document') {
      return 'google-docs';
    }
  }

  // Image files
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  // PDF files
  if (mimeType === 'application/pdf' || prettyType.includes('pdf')) {
    return 'pdf';
  }

  // Text files (specific handling for plain text)
  const textExtensions = ['txt', 'log', 'text', 'md', 'markdown', 'rst', 'sh', 'bash', 'ps1', 'bat', 'cmd'];
  if (textExtensions.includes(fileExt) || mimeType === 'text/plain') {
    return 'text';
  }

  // CSV/TSV files (specific handling)
  const csvExtensions = ['csv', 'tsv'];
  if (csvExtensions.includes(fileExt) ||
      mimeType === 'text/csv' ||
      mimeType === 'text/tab-separated-values' ||
      mimeType === 'application/csv' ||
      prettyType.includes('csv')) {
    return 'csv';
  }

  // Excel files (specific handling)
  const excelExtensions = ['xlsx', 'xls', 'xlsm', 'xlsb'];
  const excelMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
  ];
  if (excelExtensions.includes(fileExt) || excelMimeTypes.includes(mimeType)) {
    return 'excel';
  }

  // Word documents (specific handling)
  const wordExtensions = ['docx', 'doc', 'docm'];
  const wordMimeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroEnabled.12'
  ];
  if (wordExtensions.includes(fileExt) || wordMimeTypes.includes(mimeType)) {
    return 'word';
  }

  // PowerPoint presentations (specific handling - before generic presentation)
  const powerpointExtensions = ['pptx', 'ppt', 'pptm'];
  const powerpointMimeTypes = [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
  ];
  if (powerpointExtensions.includes(fileExt) || powerpointMimeTypes.includes(mimeType)) {
    return 'powerpoint';
  }

  // Video files
  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  // Audio files
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  // Document files
  const docExtensions = ['doc', 'docx', 'odt', 'rtf'];
  const docMimeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text'
  ];
  if (docExtensions.includes(fileExt) || docMimeTypes.includes(mimeType)) {
    return 'document';
  }

  // Spreadsheet files
  const spreadsheetExtensions = ['xls', 'xlsx', 'csv', 'ods'];
  const spreadsheetMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.oasis.opendocument.spreadsheet'
  ];
  if (spreadsheetExtensions.includes(fileExt) || spreadsheetMimeTypes.includes(mimeType)) {
    return 'spreadsheet';
  }

  // Presentation files
  const presentationExtensions = ['ppt', 'pptx', 'odp'];
  const presentationMimeTypes = [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation'
  ];
  if (presentationExtensions.includes(fileExt) || presentationMimeTypes.includes(mimeType)) {
    return 'presentation';
  }

  // Code files
  const codeExtensions = [
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'php',
    'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'r', 'sh', 'bash',
    'html', 'css', 'scss', 'sass', 'less', 'xml', 'json', 'yaml', 'yml',
    'sql', 'graphql', 'md', 'markdown'
  ];
  if (codeExtensions.includes(fileExt) || prettyType.includes('code')) {
    return 'code';
  }

  // Archive files
  const archiveExtensions = ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz'];
  const archiveMimeTypes = [
    'application/zip',
    'application/x-rar-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-7z-compressed'
  ];
  if (archiveExtensions.includes(fileExt) || archiveMimeTypes.includes(mimeType)) {
    return 'archive';
  }

  // Text files
  if (mimeType.startsWith('text/') || prettyType.includes('text')) {
    return 'text';
  }

  return 'unknown';
}

/**
 * Get optimal thumbnail size based on container dimensions
 */
export function getOptimalThumbnailSize(containerWidth: number): number {
  if (containerWidth <= 80) return 80;
  if (containerWidth <= 160) return 160;
  if (containerWidth <= 360) return 360;
  if (containerWidth <= 480) return 480;
  if (containerWidth <= 720) return 720;
  if (containerWidth <= 960) return 960;
  return 1024;
}

/**
 * Process a SlackFile into enriched FileMetadata
 */
export function processFileMetadata(file: SlackFile): FileMetadata {
  const type = getFileType(file);
  const canPreview = isPreviewSupported(file);
  const thumbnailUrl = getBestThumbnailUrl(file);
  const icon = getFileIcon(file);
  const displaySize = formatFileSize(file.size);
  const downloadUrl = file.url_private_download || file.url_private;

  return {
    file,
    type,
    icon,
    displaySize,
    thumbnailUrl,
    canPreview,
    downloadUrl
  };
}

/**
 * Group files by type for organized display
 */
export function groupFilesByType(files: SlackFile[]): FileGroup[] {
  const groups = new Map<FileType, FileMetadata[]>();

  for (const file of files) {
    const metadata = processFileMetadata(file);
    const existing = groups.get(metadata.type) || [];
    existing.push(metadata);
    groups.set(metadata.type, existing);
  }

  // Convert to array and sort by priority
  const typeOrder: FileType[] = [
    'image',
    'pdf',
    'text',
    'csv',
    'excel',
    'word',
    'powerpoint',
    'google-sheets',
    'google-docs',
    'document',
    'spreadsheet',
    'presentation',
    'video',
    'audio',
    'code',
    'archive',
    'unknown'
  ];

  return typeOrder
    .filter(type => groups.has(type))
    .map(type => ({
      type,
      files: groups.get(type)!
    }));
}

/**
 * Check if a file is an image that can be displayed inline
 */
export function isInlineImage(file: SlackFile): boolean {
  const supportedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp'
  ];

  return supportedImageTypes.includes(file.mimetype?.toLowerCase() || '');
}

/**
 * Check if a file is a video that can be played inline
 */
export function isInlineVideo(file: SlackFile): boolean {
  const supportedVideoTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg'
  ];

  return supportedVideoTypes.includes(file.mimetype?.toLowerCase() || '');
}

/**
 * Get display name for a file type
 */
export function getFileTypeDisplayName(type: FileType): string {
  const displayNames: Record<FileType, string> = {
    image: 'Images',
    pdf: 'PDFs',
    text: 'Text Files',
    csv: 'CSV/TSV Files',
    excel: 'Excel Files',
    word: 'Word Documents',
    powerpoint: 'PowerPoint Presentations',
    'google-sheets': 'Google Sheets',
    'google-docs': 'Google Docs',
    video: 'Videos',
    audio: 'Audio',
    document: 'Documents',
    spreadsheet: 'Spreadsheets',
    presentation: 'Presentations',
    code: 'Code',
    archive: 'Archives',
    unknown: 'Other Files'
  };

  return displayNames[type] || 'Files';
}

/**
 * Calculate total size of multiple files
 */
export function calculateTotalSize(files: SlackFile[]): string {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return formatFileSize(totalBytes);
}

/**
 * Sort files by various criteria
 */
export function sortFiles(
  files: FileMetadata[],
  sortBy: 'name' | 'size' | 'date' | 'type' = 'name',
  ascending: boolean = true
): FileMetadata[] {
  const sorted = [...files].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'name':
        comparison = a.file.name.localeCompare(b.file.name);
        break;
      case 'size':
        comparison = a.file.size - b.file.size;
        break;
      case 'date':
        comparison = a.file.created - b.file.created;
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
    }

    return ascending ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Filter files based on search query
 */
export function filterFiles(files: FileMetadata[], query: string): FileMetadata[] {
  if (!query.trim()) {
    return files;
  }

  const lowerQuery = query.toLowerCase();
  
  return files.filter(metadata => {
    const file = metadata.file;
    return (
      file.name?.toLowerCase().includes(lowerQuery) ||
      file.title?.toLowerCase().includes(lowerQuery) ||
      metadata.type.includes(lowerQuery) ||
      file.pretty_type?.toLowerCase().includes(lowerQuery)
    );
  });
}

/**
 * Service class for file operations
 */
export class FileService {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  /**
   * Get and process files for a message
   */
  async getMessageFilesWithMetadata(
    channelId: string,
    messageTs: string
  ): Promise<FileMetadata[]> {
    const files = await getMessageFiles(this.workspaceId, channelId, messageTs);
    return files.map(processFileMetadata);
  }

  /**
   * Download a file and return local path
   */
  async downloadFileForPreview(file: SlackFile): Promise<string | null> {
    const result = await getOrDownloadFile(this.workspaceId, file);
    return result.success ? result.localPath || null : null;
  }

  /**
   * Prefetch thumbnails for better performance
   */
  async prefetchThumbnails(files: SlackFile[]): Promise<void> {
    const imageFiles = files.filter(file => getFileType(file) === 'image');
    
    // Download thumbnails in parallel
    const promises = imageFiles.map(async file => {
      const thumbnailUrl = getBestThumbnailUrl(file, 360);
      if (thumbnailUrl) {
        // This would trigger browser cache
        // In production, we might want to use the Rust backend for this
        const img = new Image();
        img.src = thumbnailUrl;
      }
    });

    await Promise.all(promises);
  }
}