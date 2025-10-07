export interface ExportOptions {
  format: 'tsv' | 'markdown' | 'markdown-folder';
  attachmentHandling: 'data-url' | 'authenticated-url' | 'download' | 'permalink-only';
  includeReactions: boolean;
  includeUserInfo: boolean;
}

export interface ExportedThread {
  channelName: string;
  channelId: string;
  threadTs: string;
  parentMessage: ExportedMessage;
  replies: ExportedMessage[];
  exportedAt: string;
}

export interface ExportedMessage {
  index: number;
  timestamp: string;
  isoDateTime: string;
  userId: string;
  userName: string;
  userRealName?: string;
  text: string;
  decodedText: string;
  attachments: ExportedAttachment[];
  reactions?: ExportedReaction[];
  slackLink: string;
}

export interface ExportedAttachment {
  id: string;
  name: string;
  fileType: string;
  size: number;
  formattedSize: string;
  dataUrl?: string;
  authenticatedUrl?: string;
  downloadedPath?: string;
  localPath?: string; // For folder export
  permalink: string;
  slackMessageLink: string;
}

export interface AttachmentFile {
  filename: string;
  content: string; // base64
}

export interface FolderExportResult {
  markdown: string;
  attachments: AttachmentFile[];
}

export interface ExportedReaction {
  emoji: string;
  count: number;
  users: string[];
}
