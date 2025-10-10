<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { formatFileSize, getFileContent } from '$lib/api/files';
  import { downloadFile } from '$lib/api/files';
  import { showSuccess, showError, showInfo } from '$lib/stores/toast';
  import { highlightCode, isHighlightSupported } from '$lib/utils/syntaxHighlight';
  import { settings } from '$lib/stores/settings';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;

  let isLoading = true;
  let isDownloading = false;
  let fileContent: string = '';
  let error: string | null = null;
  let isTruncated = false;
  let lineCount = 0;
  let highlightedContent: string = '';
  let isHighlighting: boolean = false;
  let shouldHighlight: boolean = false;

  const MAX_PREVIEW_SIZE = 1024 * 1024; // 1MB
  const MAX_PREVIEW_LINES = 1000;

  $: formattedSize = formatFileSize(file.size);
  $: fileName = file.name || file.title || 'Untitled';

  // テーマストアから現在のテーマを取得
  $: currentTheme = (() => {
    if ($settings.theme === 'light') {
      return 'light' as const;
    } else if ($settings.theme === 'dark') {
      return 'dark' as const;
    } else {
      // 'auto'の場合はシステム設定を確認
      const prefersDark = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
      return prefersDark ? 'dark' as const : 'light' as const;
    }
  })();

  // ファイル読み込み時にハイライト可否を判定
  $: shouldHighlight = isHighlightSupported(fileName);

  // ファイルコンテンツ変更時にハイライト適用（非同期処理のトリガー）
  $: if (fileContent && !isLoading && shouldHighlight && !fileContent.includes('[Preview not available')) {
    // 非同期関数を即座実行
    (async () => {
      await applyHighlighting();
    })();
  }

  // Reload content when file changes
  $: if (file && file.id) {
    loadFileContent();
  }

  /**
   * シンタックスハイライトを適用
   */
  async function applyHighlighting() {
    if (isHighlighting) return; // 既にハイライト処理中

    isHighlighting = true;
    try {
      // 行番号を表示（デフォルトtrue）
      highlightedContent = await highlightCode(fileContent, fileName, currentTheme, true);
      console.log('[TextPreview] Syntax highlighting applied with line numbers');
    } catch (error) {
      console.error('[TextPreview] Failed to highlight code:', error);
      highlightedContent = ''; // フォールバックでプレーンテキスト表示
    } finally {
      isHighlighting = false;
    }
  }

  onMount(() => {
    loadFileContent();
  });

  async function loadFileContent() {
    isLoading = true;
    error = null;

    try {
      // Check file size
      if (file.size > MAX_PREVIEW_SIZE) {
        isTruncated = true;
        showInfo(
          'Large file',
          `Showing first ${MAX_PREVIEW_LINES} lines. Download for full content.`,
          5000
        );
      }

      // Fetch file content from Slack
      // For now, we'll use a placeholder until backend is ready
      const url = file.url_private_download || file.url_private;

      try {
        // Try to fetch content via backend
        const content = await getFileContent(url, MAX_PREVIEW_SIZE, 'utf-8');

        // Process content
        const lines = content.split('\n');
        lineCount = lines.length;

        if (lines.length > MAX_PREVIEW_LINES) {
          isTruncated = true;
          fileContent = lines.slice(0, MAX_PREVIEW_LINES).join('\n');
        } else {
          fileContent = content;
        }
      } catch (backendError) {
        // Fallback: Show placeholder for now
        console.warn('Backend not ready for file content:', backendError);

        // UTF-8デコードエラーの場合は特別なメッセージを表示
        const errorMessage = backendError instanceof Error ? backendError.message : String(backendError);
        if (errorMessage.includes('UTF-8') || errorMessage.includes('utf-8')) {
          fileContent = `[Binary file or non-UTF-8 encoded file]\n\nFile: ${fileName}\nSize: ${formattedSize}\n\nThis file cannot be previewed as text.\nDownload the file to view its contents.`;
          error = 'Binary file - preview not available. Please download to view.';
        } else {
          fileContent = `[Preview not available yet]\n\nFile: ${fileName}\nSize: ${formattedSize}\n\nDownload the file to view its contents.`;
          error = 'Preview temporarily unavailable. Download to view content.';
        }
      }
    } catch (err) {
      console.error('Error loading file content:', err);
      error = err instanceof Error ? err.message : 'Failed to load file content';
      fileContent = '';
    } finally {
      isLoading = false;
    }
  }

  async function handleDownload() {
    if (isDownloading) return;

    isDownloading = true;
    showInfo('Download started', `Downloading ${fileName}...`, 3000);

    try {
      const localPath = await downloadFile(
        workspaceId,
        file.id,
        file.url_private_download || file.url_private,
        file.name
      );

      if (localPath.success) {
        showSuccess('Download complete', `${fileName} saved successfully`, 3000);
      } else {
        showError('Download failed', `Failed to download ${fileName}`, 5000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      showError('Download failed', errorMessage, 5000);
    } finally {
      isDownloading = false;
    }
  }

  export function copyToClipboard() {
    if (!fileContent || fileContent.includes('[Preview not available')) {
      showError('Copy failed', 'No content available to copy', 3000);
      return;
    }
    navigator.clipboard.writeText(fileContent).then(() => {
      showSuccess('Copied', 'Text copied to clipboard', 2000);
    }).catch((err) => {
      showError('Copy failed', 'Failed to copy text', 3000);
    });
  }
</script>

<div class="text-preview" class:compact>
  {#if isLoading}
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading text file...</span>
    </div>
  {:else if error && !fileContent}
    <div class="error-container">
      <svg class="error-icon" width="16" height="16" viewBox="0 0 16 16">
        <path fill="currentColor" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 13a6 6 0 110-12 6 6 0 010 12zm1-6V4H7v4h2zm0 3V9H7v2h2z"/>
      </svg>
      <span>{error}</span>
    </div>
  {:else if compact}
    <div class="compact-preview">
      <div class="file-icon text">
        <span>📝</span>
      </div>
      <div class="compact-info">
        <div class="file-name" title={fileName}>{fileName}</div>
        <div class="file-size">{formattedSize}</div>
      </div>
    </div>
  {:else}
    <div class="preview-container">
      <div class="preview-header">
          <div class="file-info">
            <span class="file-name">{fileName}</span>
            <span class="file-meta">
              {formattedSize}
              {#if lineCount > 0}
                • {lineCount} lines
              {/if}
              {#if isTruncated}
                • <span class="truncated-badge">Truncated</span>
              {/if}
            </span>
          </div>
          <div class="preview-actions">
            <button
              class="action-btn"
              on:click={copyToClipboard}
              title="Copy to clipboard"
              disabled={!fileContent || fileContent.includes('[Preview not available')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16">
                <path fill="currentColor" d="M10 3H6C4.9 3 4 3.9 4 5v9c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2V8l-5-5zm4 11c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h3v3c0 .55.45 1 1 1h3v6zm-4-8V3.5L13.5 7H10z"/>
              </svg>
            </button>
            <button
              class="action-btn primary"
              on:click={handleDownload}
              disabled={isDownloading}
              title="Download file"
            >
              {#if isDownloading}
                <div class="spinner small"></div>
              {:else}
                <svg width="14" height="14" viewBox="0 0 16 16">
                  <path fill="currentColor" d="M8 11L4 7h2.5V2h3v5H12L8 11zm-6 3v1h12v-1H2z"/>
                </svg>
              {/if}
            </button>
          </div>
        </div>

      <div class="text-content">
        {#if shouldHighlight && highlightedContent}
          <div class="highlighted-code">
            {@html highlightedContent}
          </div>
        {:else}
          <pre>{fileContent}</pre>
        {/if}
      </div>

      {#if isTruncated && !compact}
        <div class="truncation-notice">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7zm0 13c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6zm-.75-3.5h1.5V6h-1.5v4.5zm0-5.5h1.5v-1.5h-1.5V5z"/>
          </svg>
          <span>
            Preview shows first {MAX_PREVIEW_LINES} lines.
            <button class="download-link" on:click={handleDownload}>
              Download full file
            </button>
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .text-preview {
    width: 100%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    overflow: auto;
  }

  .text-preview.compact {
    border-radius: 0.375rem;
    max-width: 100px;
    background: transparent;
    border: none;
  }

  .compact-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .file-icon {
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 2rem;
  }

  .file-icon.text {
    border-color: #586069;
    background: rgba(88, 96, 105, 0.1);
  }

  .compact-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
  }

  .compact-info .file-name {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
  }

  .compact-info .file-size {
    font-size: 0.6875rem;
    color: var(--color-text-secondary);
  }

  .loading-container {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-container {
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-error);
    background: var(--color-error-bg);
  }

  .error-icon {
    flex-shrink: 0;
  }

  .preview-container {
    display: flex;
    flex-direction: column;
  }

  .preview-header {
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-header-bg);
  }

  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .file-name {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .truncated-badge {
    padding: 0.125rem 0.375rem;
    background: var(--color-warning-bg);
    color: var(--color-warning);
    border-radius: 0.25rem;
    font-weight: 500;
  }

  .preview-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.375rem;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-hover-bg);
    border-color: var(--color-border-hover);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
  }

  .text-content {
    padding: 1rem;
    max-height: 600px;
    overflow: auto;
    background: var(--color-code-bg);
  }

  .compact .text-content {
    max-height: 200px;
    padding: 0.75rem;
  }

  /* When used in lightbox (no compact mode), allow full height and disable nested scrolling */
  .text-preview:not(.compact) {
    height: 100%;
  }

  .text-preview:not(.compact) .text-content {
    max-height: none;
    height: 100%;
    overflow: visible;
  }

  pre {
    margin: 0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    white-space: pre-wrap;
    color: var(--color-text-primary);
  }

  .truncation-notice {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--color-warning-bg);
    color: var(--color-warning-text);
    border-top: 1px solid var(--color-border);
    font-size: 0.875rem;
  }

  .download-link {
    background: none;
    border: none;
    color: var(--color-primary);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }

  .download-link:hover {
    color: var(--color-primary-hover);
  }

  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.1);
    --color-header-bg: rgba(255, 255, 255, 0.03);
    --color-code-bg: #0d0e0f;
    --color-hover-bg: rgba(255, 255, 255, 0.08);
    --color-border-hover: #707070;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-warning: #d4a72c;
    --color-warning-bg: rgba(212, 167, 44, 0.1);
    --color-warning-text: #f5e3a3;
  }

  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-error: #e01e5a;
    --color-error-bg: rgba(224, 30, 90, 0.05);
    --color-header-bg: #f8f8f8;
    --color-code-bg: #f6f6f6;
    --color-hover-bg: rgba(0, 0, 0, 0.05);
    --color-border-hover: #bbbbbb;
    --color-primary: #1264a3;
    --color-primary-hover: #0d4f8b;
    --color-warning: #d4a72c;
    --color-warning-bg: rgba(212, 167, 44, 0.1);
    --color-warning-text: #7a5f1a;
  }

  /* シンタックスハイライト用スタイル */
  .highlighted-code {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    overflow-x: auto;
    /* Enable horizontal scrolling by forcing content width */
    width: max-content;
    min-width: 100%;
  }

  .highlighted-code :global(pre) {
    margin: 0;
    padding: 0;
    background: transparent !important;
    /* Force width expansion for horizontal scrolling */
    width: max-content;
    min-width: 100%;
  }

  .highlighted-code :global(code) {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .highlighted-code :global(.line) {
    display: inline-block;
    min-height: 1.5em;
  }

  /* Shikiフォールバック用スタイル */
  .shiki-fallback {
    margin: 0;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    white-space: pre-wrap;
    color: var(--color-text-primary);
  }

  /* 行番号のスタイル調整 */
  .highlighted-code :global(.line-number) {
    color: var(--color-text-secondary);
    user-select: none;
    padding-right: 1rem;
    margin-right: 1rem;
    text-align: right;
    min-width: 2.5rem;
    display: inline-block;
    opacity: 0.6;
    border-right: 1px solid var(--color-border);
  }

  .highlighted-code :global(.line-number):hover {
    opacity: 1;
  }
</style>