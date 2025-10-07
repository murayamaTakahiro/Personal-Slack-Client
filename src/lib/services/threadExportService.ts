import type { ThreadMessages, Message, SlackFile, EmojiReaction } from '../types/slack';
import type { ExportOptions, ExportedThread, ExportedMessage, ExportedAttachment, ExportedReaction, FolderExportResult, AttachmentFile } from '../types/export';
import { decodeSlackText } from '../utils/htmlEntities';
import { getAuthenticatedFileUrl, createFileDataUrl } from '../api/files';

export class ThreadExportService {
  /**
   * スレッドをTSV形式に変換
   */
  async exportToTSV(
    thread: ThreadMessages,
    channelName: string,
    channelId: string,
    options: ExportOptions
  ): Promise<string> {
    const exported = await this.prepareExport(thread, channelName, channelId, options);
    return this.formatAsTSV(exported);
  }

  /**
   * スレッドをMarkdown形式に変換
   */
  async exportToMarkdown(
    thread: ThreadMessages,
    channelName: string,
    channelId: string,
    options: ExportOptions
  ): Promise<string> {
    const exported = await this.prepareExport(thread, channelName, channelId, options);
    return this.formatAsMarkdown(exported);
  }

  async exportToMarkdownFolder(
    thread: ThreadMessages,
    channelName: string,
    channelId: string,
    options: ExportOptions
  ): Promise<FolderExportResult> {
    const exported = await this.prepareExport(thread, channelName, channelId, options);
    
    // Download all attachments and assign local paths
    const attachments: AttachmentFile[] = [];
    let fileCounter = 1;
    
    for (const msg of [exported.parentMessage, ...exported.replies]) {
      for (const att of msg.attachments) {
        try {
          // Generate a safe filename
          const extension = att.name.split('.').pop() || 'bin';
          const safeFileType = att.fileType.replace(/[^a-z0-9]/gi, '_');
          const filename = `${safeFileType}_${String(fileCounter).padStart(3, '0')}.${extension}`;
          
          // Use url_private_download or url_private for authenticated access
          // We need to get the original SlackFile to access these URLs
          const originalFile = this.findOriginalFile(thread, att.id);
          if (!originalFile) {
            console.error(`Could not find original file for attachment ${att.id}`);
            continue;
          }
          
          const urlToFetch = originalFile.url_private_download || originalFile.url_private;
          if (!urlToFetch) {
            console.error(`No download URL available for file ${att.id}`);
            continue;
          }
          
          // Use createFileDataUrl which handles authentication via Tauri
          const dataUrl = await createFileDataUrl(urlToFetch, originalFile.mimetype);
          
          // Extract base64 content from data URL
          // Format: "data:image/png;base64,iVBORw0KG..."
          const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
          if (!base64Match) {
            console.error(`Invalid data URL format for file ${att.id}`);
            continue;
          }
          
          const base64 = base64Match[1];
          
          // Add to attachments list
          attachments.push({
            filename,
            content: base64
          });
          
          // Update attachment with local path
          att.localPath = `./attachments/${filename}`;
          fileCounter++;
        } catch (error) {
          console.error(`Failed to process attachment ${att.id}:`, error);
          // Continue with next file
        }
      }
    }
    
    // Format markdown with local paths
    const markdown = this.formatAsMarkdownWithLocalPaths(exported);
    
    return { markdown, attachments };
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          // Remove data URL prefix (e.g., "data:image/png;base64,")
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private findOriginalFile(thread: ThreadMessages, fileId: string): SlackFile | undefined {
    // Search in parent message
    if (thread.parent.files) {
      const file = thread.parent.files.find(f => f.id === fileId);
      if (file) return file;
    }
    
    // Search in replies
    if (thread.replies) {
      for (const reply of thread.replies) {
        if (reply.files) {
          const file = reply.files.find(f => f.id === fileId);
          if (file) return file;
        }
      }
    }
    
    return undefined;
  }

  /**
   * エクスポート用データ準備
   */
  private async prepareExport(
    thread: ThreadMessages,
    channelName: string,
    channelId: string,
    options: ExportOptions
  ): Promise<ExportedThread> {
    const allMessages = [thread.parent, ...thread.replies];

    const exportedMessages: ExportedMessage[] = await Promise.all(
      allMessages.map((msg, index) => this.convertMessage(msg, index + 1, options))
    );

    return {
      channelName,
      channelId,
      threadTs: thread.parent.ts,
      parentMessage: exportedMessages[0],
      replies: exportedMessages.slice(1),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * メッセージを変換
   */
  private async convertMessage(
    message: Message,
    index: number,
    options: ExportOptions
  ): Promise<ExportedMessage> {
    const timestamp = parseFloat(message.ts);
    const isoDateTime = new Date(timestamp * 1000).toISOString();
    const decodedText = decodeSlackText(message.text);

    const attachments = message.files
      ? await this.processAttachments(message.files, message.permalink, options.attachmentHandling)
      : [];

    const reactions = options.includeReactions && message.reactions
      ? this.convertReactions(message.reactions)
      : undefined;

    return {
      index,
      timestamp: message.ts,
      isoDateTime,
      userId: message.user,
      userName: message.userName,
      userRealName: options.includeUserInfo ? message.userName : undefined,
      text: message.text,
      decodedText,
      attachments,
      reactions,
      slackLink: message.permalink
    };
  }

  /**
   * リアクションを変換
   */
  private convertReactions(reactions: EmojiReaction[]): ExportedReaction[] {
    return reactions.map(reaction => ({
      emoji: reaction.name,
      count: reaction.count,
      users: reaction.users
    }));
  }

  /**
   * 添付ファイルURL処理
   */
  private async processAttachments(
    files: SlackFile[],
    messagePermalink: string,
    handling: ExportOptions['attachmentHandling']
  ): Promise<ExportedAttachment[]> {
    return Promise.all(
      files.map(file => this.processAttachment(file, messagePermalink, handling))
    );
  }

  /**
   * 単一の添付ファイル処理
   */
  private async processAttachment(
    file: SlackFile,
    messagePermalink: string,
    handling: ExportOptions['attachmentHandling']
  ): Promise<ExportedAttachment> {
    const attachment: ExportedAttachment = {
      id: file.id,
      name: file.name,
      fileType: file.filetype,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      permalink: file.permalink,
      slackMessageLink: messagePermalink
    };

    if (handling === 'data-url') {
      try {
        // Create data URL for embedding file content (ideal for LLMs)
        const urlToFetch = file.url_private_download || file.url_private;
        attachment.dataUrl = await createFileDataUrl(urlToFetch, file.mimetype);
      } catch (error) {
        console.error('Failed to create data URL for file:', file.id, error);
        // Fallback to permalink
        attachment.dataUrl = undefined;
      }
    } else if (handling === 'authenticated-url') {
      try {
        // Use url_private_download for better compatibility with downloads
        const urlToAuthenticate = file.url_private_download || file.url_private;
        attachment.authenticatedUrl = await getAuthenticatedFileUrl(urlToAuthenticate);
      } catch (error) {
        console.error('Failed to get authenticated URL for file:', file.id, error);
        // Fallback to the original URL
        attachment.authenticatedUrl = file.url_private_download || file.url_private;
      }
    }

    return attachment;
  }

  /**
   * ファイルサイズをフォーマット
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * TSVフォーマット生成
   */
  private formatAsTSV(data: ExportedThread): string {
    const headers = [
      'Index',
      'Timestamp',
      'ISO DateTime',
      'User ID',
      'User Name',
      'Message',
      'Attachment Count',
      'Attachment Names',
      'Attachment URLs',
      'Attachment Sizes',
      'Reaction Summary',
      'Slack Link'
    ];

    const allMessages = [data.parentMessage, ...data.replies];

    const rows = allMessages.map(msg => {
      const attachmentNames = msg.attachments.map(a => a.name).join(',');
      const attachmentUrls = msg.attachments
        .map(a => a.dataUrl || a.authenticatedUrl || a.permalink)
        .join(',');
      const attachmentSizes = msg.attachments.map(a => a.size.toString()).join(',');

      const reactionSummary = msg.reactions
        ? msg.reactions.map(r => `${r.emoji}(${r.count})`).join(',')
        : '';

      // TSVではタブと改行をエスケープ
      const escapeTsv = (text: string) =>
        text.replace(/\t/g, '  ').replace(/\n/g, '\\n').replace(/\r/g, '');

      return [
        msg.index.toString(),
        msg.timestamp,
        msg.isoDateTime,
        msg.userId,
        msg.userName,
        escapeTsv(msg.decodedText),
        msg.attachments.length.toString(),
        attachmentNames,
        attachmentUrls,
        attachmentSizes,
        reactionSummary,
        msg.slackLink
      ].join('\t');
    });

    return [headers.join('\t'), ...rows].join('\n');
  }

  /**
   * Markdownフォーマット生成
   */
  private formatAsMarkdown(data: ExportedThread): string {
    const lines: string[] = [];

    // ヘッダー
    lines.push(`# Thread Export: #${data.channelName}`);
    lines.push('');
    lines.push(`**Exported:** ${new Date(data.exportedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    lines.push(`**Parent Message:** ${new Date(parseFloat(data.parentMessage.timestamp) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 全メッセージ
    const allMessages = [data.parentMessage, ...data.replies];
    const totalMessages = allMessages.length;

    allMessages.forEach(msg => {
      lines.push(`## Message ${msg.index}/${totalMessages} - ${msg.userName} (@${msg.userName})`);
      lines.push('');
      lines.push(`**Posted:** ${new Date(parseFloat(msg.timestamp) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      lines.push(`**User ID:** ${msg.userId}`);
      lines.push('');

      // メッセージ本文
      lines.push(msg.decodedText);
      lines.push('');

      // 添付ファイル
      if (msg.attachments.length > 0) {
        lines.push(`**Attachments (${msg.attachments.length}):**`);
        msg.attachments.forEach(att => {
          const emoji = this.getFileEmoji(att.fileType);
          const url = att.dataUrl || att.authenticatedUrl || att.permalink;
          lines.push(`- ${emoji} [${att.name}](${url}) (${att.formattedSize}) | [View in Slack](${att.slackMessageLink})`);
        });
        lines.push('');
      }

      // リアクション
      if (msg.reactions && msg.reactions.length > 0) {
        lines.push('**Reactions:**');
        msg.reactions.forEach(reaction => {
          const userList = reaction.users.map(u => `@${u}`).join(', ');
          lines.push(`- ${reaction.emoji} (${reaction.count}): ${userList}`);
        });
        lines.push('');
      }

      // Slackリンク
      lines.push(`**Slack Link:** ${msg.slackLink}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  }

  private formatAsMarkdownWithLocalPaths(data: ExportedThread): string {
    const lines: string[] = [];

    // ヘッダー
    lines.push(`# Thread Export: #${data.channelName}`);
    lines.push('');
    lines.push(`**Exported:** ${new Date(data.exportedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    lines.push(`**Parent Message:** ${new Date(parseFloat(data.parentMessage.timestamp) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 全メッセージ
    const allMessages = [data.parentMessage, ...data.replies];
    const totalMessages = allMessages.length;

    allMessages.forEach(msg => {
      lines.push(`## Message ${msg.index}/${totalMessages} - ${msg.userName} (@${msg.userName})`);
      lines.push('');
      lines.push(`**Posted:** ${new Date(parseFloat(msg.timestamp) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      lines.push(`**User ID:** ${msg.userId}`);
      lines.push('');

      // メッセージ本文
      lines.push(msg.decodedText);
      lines.push('');

      // 添付ファイル（ローカルパス優先）
      if (msg.attachments.length > 0) {
        lines.push(`**Attachments (${msg.attachments.length}):**`);
        msg.attachments.forEach(att => {
          const emoji = this.getFileEmoji(att.fileType);
          // localPath があれば優先、なければフォールバック
          const url = att.localPath || att.dataUrl || att.authenticatedUrl || att.permalink;

          // 画像ファイルは ![alt](url) 構文で埋め込み（VS Codeでプレビュー可能）
          const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
          const extension = att.name.split('.').pop()?.toLowerCase() || '';
          const isImage = imageExtensions.includes(extension);

          if (isImage && att.localPath) {
            // 画像：Markdown画像構文で埋め込み
            lines.push(`- ${emoji} **${att.name}** (${att.formattedSize})`);
            lines.push(`  ![${att.name}](${url})`);
            lines.push(`  [View in Slack](${att.slackMessageLink})`);
          } else {
            // 非画像：リンク形式
            lines.push(`- ${emoji} [${att.name}](${url}) (${att.formattedSize}) | [View in Slack](${att.slackMessageLink})`);
          }
        });
        lines.push('');
      }

      // リアクション
      if (msg.reactions && msg.reactions.length > 0) {
        lines.push('**Reactions:**');
        msg.reactions.forEach(reaction => {
          const userList = reaction.users.map(u => `@${u}`).join(', ');
          lines.push(`- ${reaction.emoji} (${reaction.count}): ${userList}`);
        });
        lines.push('');
      }

      // Slackリンク
      lines.push(`**Slack Link:** ${msg.slackLink}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * ファイルタイプに応じた絵文字を返す
   */
  private getFileEmoji(fileType: string): string {
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const docTypes = ['pdf', 'doc', 'docx', 'txt', 'md'];
    const codeTypes = ['js', 'ts', 'py', 'java', 'cpp', 'c', 'rs', 'go'];
    const archiveTypes = ['zip', 'tar', 'gz', 'rar', '7z'];
    const videoTypes = ['mp4', 'avi', 'mov', 'webm', 'mkv'];

    const type = fileType.toLowerCase();

    if (imageTypes.includes(type)) return '🖼️';
    if (docTypes.includes(type)) return '📄';
    if (codeTypes.includes(type)) return '💻';
    if (archiveTypes.includes(type)) return '📦';
    if (videoTypes.includes(type)) return '🎬';

    return '📎';
  }
}
