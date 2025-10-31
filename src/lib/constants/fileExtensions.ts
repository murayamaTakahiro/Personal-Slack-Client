/**
 * File extension groups for filtering attachments
 */

export interface ExtensionGroup {
  id: string;
  label: string;
  icon: string;
  extensions: string[];
}

/**
 * Predefined file extension groups
 * These groups are used in the FileExtensionSelector component
 */
export const FILE_EXTENSION_GROUPS: ExtensionGroup[] = [
  {
    id: 'images',
    label: 'Images',
    icon: '🖼️',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif']
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: '📄',
    extensions: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'markdown']
  },
  {
    id: 'spreadsheets',
    label: 'Spreadsheets',
    icon: '📊',
    extensions: ['xlsx', 'xls', 'csv', 'tsv', 'ods', 'xlsm', 'xlsb']
  },
  {
    id: 'presentations',
    label: 'Presentations',
    icon: '📽️',
    extensions: ['pptx', 'ppt', 'pptm', 'odp', 'key']
  },
  {
    id: 'code',
    label: 'Code Files',
    icon: '💻',
    extensions: [
      'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'rb', 'go', 'rs', 'php',
      'html', 'css', 'scss', 'sass', 'less', 'json', 'yaml', 'yml', 'xml', 'sql',
      'sh', 'bash', 'ps1', 'bat', 'cmd', 'swift', 'kt', 'scala', 'r', 'graphql',
      'vue', 'svelte', 'dart', 'lua', 'perl', 'vim'
    ]
  },
  {
    id: 'archives',
    label: 'Archives',
    icon: '📦',
    extensions: ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz', 'tgz', 'tar.gz']
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: '🎬',
    extensions: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', 'mpeg', 'mpg']
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: '🎵',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'opus']
  },
  {
    id: 'other',
    label: 'Other',
    icon: '📎',
    extensions: [] // Special group for files that don't match any category
  }
];

/**
 * Get all extensions from all groups (flattened)
 */
export function getAllExtensions(): string[] {
  return FILE_EXTENSION_GROUPS
    .filter(group => group.id !== 'other')
    .flatMap(group => group.extensions);
}

/**
 * Find which group(s) an extension belongs to
 */
export function findGroupsForExtension(extension: string): ExtensionGroup[] {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return FILE_EXTENSION_GROUPS.filter(group =>
    group.extensions.includes(ext)
  );
}

/**
 * Get extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if a filename matches any of the selected extensions
 */
export function matchesExtensions(filename: string, selectedExtensions: string[]): boolean {
  if (selectedExtensions.length === 0) return true;
  const ext = getFileExtension(filename);
  return selectedExtensions.includes(ext);
}
