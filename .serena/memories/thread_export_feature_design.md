# スレッドエクスポート機能 設計書

## 概要

スレッド一覧にフォーカスがある状態で、キーボードショートカット（Ctrl+E）によりスレッドの全メッセージ・添付ファイル情報をTSV/Markdownファイルに出力する機能。

## 目的

- スレッド内の情報をLLMに渡しやすくする
- マニュアル作成などのドキュメント生成を容易にする
- 投稿者情報を含めた完全なコンテキストを保存

## 技術的な懸念事項と解決策

### 1. キーボードショートカットの競合

**懸念:** 既存の "E" キー（最後のメッセージへ移動）と "Ctrl+E" が競合しないか

**調査結果:**
- `ThreadView.svelte` の `handleKeyDown()` 関数（389-400行目）で "E" キーを処理
- 現在は修飾キーなしの単独 "E" キーのみをチェック
- Alt+Enter（317-324行目）の実装例から、修飾キーとの組み合わせチェックが可能

**解決策:**
```typescript
// handleKeyDown() 内、switch文の前に追加
if (event.key.toLowerCase() === 'e' && event.ctrlKey && !event.altKey && !event.metaKey) {
  event.preventDefault();
  event.stopPropagation();
  handleExportThread();
  return;
}

// 既存の "E" キー処理はそのまま
switch (event.key) {
  case 'e':
  case 'E':
    // 最後のメッセージへ移動（既存機能）
    break;
}
```

**結論:** 競合なし。Ctrl+E を先にチェックすることで安全に実装可能。

### 2. 添付ファイルURLのアクセス可能性

**懸念:** エクスポートしたURLが実際に閲覧可能か

**調査結果:**
- `SlackFile` インターフェース（types/slack.ts 250-306行目）:
  - `url_private`: 認証必要
  - `url_private_download`: 認証必要
  - `permalink`: Slackログイン必要
- 既存の `getAuthenticatedFileUrl()` 関数（files.ts 15-22行目）が利用可能

**解決策（3つのオプション）:**

1. **認証付きURL生成**（推奨デフォルト）
   - `getAuthenticatedFileUrl()` を使用
   - 一定期間（数時間）有効なトークン付きURL
   - 短期間の閲覧・LLMへの即時入力に最適

2. **ファイルダウンロード**（オプション）
   - 既存の `downloadFile()` を使用
   - 完全オフライン利用可能
   - LLMへのアップロードに最適

3. **Slackパーマリンク**（常に併記）
   - 永続的アクセス用
   - 長期参照に有用

**実装方針:** ユーザーに選択させる形式

## アーキテクチャ設計

### ファイル構成

```
src/lib/
├── services/
│   └── threadExportService.ts      (新規) エクスポートロジック
├── components/
│   ├── ThreadView.svelte           (変更) Ctrl+E ハンドラ追加
│   └── ThreadExportDialog.svelte   (新規) エクスポート設定UI
├── stores/
│   └── settings.ts                 (変更) exportThread: 'Ctrl+E' 追加
└── types/
    └── export.ts                   (新規) エクスポート関連の型定義

src-tauri/src/
├── commands/
│   └── export.rs                   (新規) ファイル保存コマンド
└── main.rs                         (変更) export コマンド登録
```

## データ構造

### TypeScript 型定義 (src/lib/types/export.ts)

```typescript
export interface ExportOptions {
  format: 'tsv' | 'markdown';
  attachmentHandling: 'authenticated-url' | 'download' | 'permalink-only';
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
  authenticatedUrl?: string;
  downloadedPath?: string;
  permalink: string;
  slackMessageLink: string;
}

export interface ExportedReaction {
  emoji: string;
  count: number;
  users: string[];
}
```

## 実装詳細

### 1. threadExportService.ts

```typescript
import type { ThreadMessages } from '../types/slack';
import type { ExportOptions, ExportedThread } from '../types/export';
import { decodeSlackText } from '../utils/htmlEntities';
import { getAuthenticatedFileUrl } from '../api/files';
import { downloadFile } from '../api/files';

export class ThreadExportService {
  /**
   * スレッドをTSV形式に変換
   */
  async exportToTSV(
    thread: ThreadMessages, 
    options: ExportOptions
  ): Promise<string> {
    const exported = await this.prepareExport(thread, options);
    return this.formatAsTSV(exported);
  }

  /**
   * スレッドをMarkdown形式に変換
   */
  async exportToMarkdown(
    thread: ThreadMessages, 
    options: ExportOptions
  ): Promise<string> {
    const exported = await this.prepareExport(thread, options);
    return this.formatAsMarkdown(exported);
  }

  /**
   * エクスポート用データ準備
   */
  private async prepareExport(
    thread: ThreadMessages,
    options: ExportOptions
  ): Promise<ExportedThread> {
    // メッセージ変換処理
    // 添付ファイルURL処理
    // リアクション情報処理
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
      'Text',
      'Attachment Count',
      'Attachment Names',
      'Attachment URLs',
      'Slack Link'
    ];
    
    // TSV生成ロジック
  }

  /**
   * Markdownフォーマット生成
   */
  private formatAsMarkdown(data: ExportedThread): string {
    // Markdown生成ロジック
  }

  /**
   * 添付ファイルURL処理
   */
  private async processAttachments(
    files: SlackFile[],
    handling: ExportOptions['attachmentHandling']
  ): Promise<ExportedAttachment[]> {
    switch (handling) {
      case 'authenticated-url':
        return await this.getAuthenticatedUrls(files);
      case 'download':
        return await this.downloadAttachments(files);
      case 'permalink-only':
        return this.getPermalinks(files);
    }
  }
}
```

### 2. ThreadView.svelte の変更

```typescript
// <script> 内に追加
import { ThreadExportService } from '../services/threadExportService';
import ThreadExportDialog from './ThreadExportDialog.svelte';

let showExportDialog = false;
let exportService = new ThreadExportService();

/**
 * スレッドエクスポート処理
 */
async function handleExportThread() {
  if (!thread) {
    showError('No thread', 'No thread is currently loaded');
    return;
  }
  
  showExportDialog = true;
}

/**
 * エクスポート実行（ダイアログからの呼び出し）
 */
async function executeExport(options: ExportOptions) {
  try {
    showInfo('Exporting...', 'Preparing thread export');
    
    let content: string;
    let extension: string;
    
    if (options.format === 'tsv') {
      content = await exportService.exportToTSV(thread!, options);
      extension = 'tsv';
    } else {
      content = await exportService.exportToMarkdown(thread!, options);
      extension = 'md';
    }
    
    // Tauriバックエンドでファイル保存
    const result = await invoke('save_thread_export', {
      content,
      defaultName: `thread_${thread!.parent.ts}.${extension}`,
      extension
    });
    
    if (result.success) {
      showSuccess('Export complete', `Thread exported to ${result.path}`);
    }
  } catch (error) {
    showError('Export failed', error instanceof Error ? error.message : String(error));
  } finally {
    showExportDialog = false;
  }
}

// handleKeyDown() 関数内に追加（switch文の前）
function handleKeyDown(event: KeyboardEvent) {
  // ... 既存のコード ...
  
  // Ctrl+E でエクスポート
  if (event.key.toLowerCase() === 'e' && event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    handleExportThread();
    return;
  }
  
  switch (event.key) {
    // 既存の処理
  }
}
```

### 3. ThreadExportDialog.svelte

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ExportOptions } from '../types/export';
  
  export let visible = false;
  
  let format: 'tsv' | 'markdown' = 'markdown';
  let attachmentHandling: ExportOptions['attachmentHandling'] = 'authenticated-url';
  let includeReactions = true;
  let includeUserInfo = true;
  
  const dispatch = createEventDispatcher<{
    export: ExportOptions;
    cancel: void;
  }>();
  
  function handleExport() {
    dispatch('export', {
      format,
      attachmentHandling,
      includeReactions,
      includeUserInfo
    });
  }
  
  function handleCancel() {
    dispatch('cancel');
  }
</script>

{#if visible}
  <div class="export-dialog-overlay" on:click={handleCancel}>
    <div class="export-dialog" on:click|stopPropagation>
      <h2>Export Thread</h2>
      
      <div class="option-group">
        <label>Format:</label>
        <select bind:value={format}>
          <option value="markdown">Markdown (readable)</option>
          <option value="tsv">TSV (data processing)</option>
        </select>
      </div>
      
      <div class="option-group">
        <label>Attachments:</label>
        <select bind:value={attachmentHandling}>
          <option value="authenticated-url">Authenticated URLs (recommended)</option>
          <option value="download">Download files</option>
          <option value="permalink-only">Slack permalinks only</option>
        </select>
      </div>
      
      <div class="option-group">
        <label>
          <input type="checkbox" bind:checked={includeReactions} />
          Include reactions
        </label>
      </div>
      
      <div class="option-group">
        <label>
          <input type="checkbox" bind:checked={includeUserInfo} />
          Include user information
        </label>
      </div>
      
      <div class="button-group">
        <button class="btn-cancel" on:click={handleCancel}>Cancel</button>
        <button class="btn-export" on:click={handleExport}>Export</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ダイアログスタイル */
</style>
```

### 4. Tauri バックエンド (src-tauri/src/commands/export.rs)

```rust
use tauri::command;
use std::fs::File;
use std::io::Write;
use rfd::FileDialog;

#[derive(serde::Serialize)]
pub struct ExportResult {
    success: bool,
    path: Option<String>,
    error: Option<String>,
}

#[command]
pub async fn save_thread_export(
    content: String,
    default_name: String,
    extension: String,
) -> Result<ExportResult, String> {
    // ファイル保存ダイアログを表示
    let file_path = FileDialog::new()
        .set_file_name(&default_name)
        .add_filter(&format!("{} files", extension.to_uppercase()), &[&extension])
        .save_file();
    
    if let Some(path) = file_path {
        // ファイルに書き込み
        match File::create(&path) {
            Ok(mut file) => {
                match file.write_all(content.as_bytes()) {
                    Ok(_) => Ok(ExportResult {
                        success: true,
                        path: Some(path.to_string_lossy().to_string()),
                        error: None,
                    }),
                    Err(e) => Ok(ExportResult {
                        success: false,
                        path: None,
                        error: Some(format!("Failed to write file: {}", e)),
                    }),
                }
            }
            Err(e) => Ok(ExportResult {
                success: false,
                path: None,
                error: Some(format!("Failed to create file: {}", e)),
            }),
        }
    } else {
        // ユーザーがキャンセル
        Ok(ExportResult {
            success: false,
            path: None,
            error: Some("User cancelled".to_string()),
        })
    }
}
```

### 5. settings.ts の変更

```typescript
// defaultKeyboardShortcuts に追加
const defaultKeyboardShortcuts: KeyboardShortcuts = {
  // ... 既存のショートカット ...
  exportThread: 'Ctrl+E',  // 追加
};
```

## 出力フォーマット仕様

### Markdown形式

```markdown
# Thread Export: #channel-name

**Exported:** 2024-01-15 14:30:00  
**Parent Message:** 2024-01-15 10:30:45

---

## Message 1/5 - 山田太郎 (@yamada_taro)

**Posted:** 2024-01-15 10:30:45 JST  
**User ID:** U123ABC456

メッセージ本文がここに入ります。
複数行のテキストも正しく表示されます。

**Attachments (2):**
- 📎 [document.pdf](https://files.slack.com/files-pri/T123-F456/document.pdf?t=xoxe-...) (1.2 MB) | [View in Slack](https://workspace.slack.com/archives/C123/p1705305045)
- 🖼️ [screenshot.png](https://files.slack.com/files-pri/T123-F789/screenshot.png?t=xoxe-...) (245 KB) | [View in Slack](https://workspace.slack.com/archives/C123/p1705305045)

**Reactions:**
- 👍 (3): @user1, @user2, @user3
- 👀 (1): @user4

**Slack Link:** https://workspace.slack.com/archives/C123/p1705305045

---

## Message 2/5 - 佐藤花子 (@sato_hanako)

...

```

### TSV形式

```tsv
Index	Timestamp	ISO DateTime	User ID	User Name	Real Name	Text	Attachment Count	Attachment Names	Attachment URLs	Attachment Sizes	Reaction Summary	Slack Link
1	1705305045.123456	2024-01-15T10:30:45+09:00	U123ABC456	yamada_taro	山田太郎	メッセージ本文がここに入ります。	2	document.pdf,screenshot.png	https://files.slack.com/...,https://files.slack.com/...	1258291,250880	👍(3),👀(1)	https://workspace.slack.com/archives/C123/p1705305045
2	1705305120.789012	2024-01-15T10:32:00+09:00	U789DEF012	sato_hanako	佐藤花子	返信メッセージ	0				👍(1)	https://workspace.slack.com/archives/C123/p1705305120
```

## 実装順序

1. **フェーズ1: 基本実装**
   - `threadExportService.ts` 作成
   - 基本的なTSV/Markdown変換機能
   - 認証付きURL生成（デフォルト）

2. **フェーズ2: UI実装**
   - `ThreadExportDialog.svelte` 作成
   - `ThreadView.svelte` にCtrl+Eハンドラ追加
   - `settings.ts` にショートカット追加

3. **フェーズ3: Tauri統合**
   - `export.rs` 実装
   - ファイル保存ダイアログ
   - エラーハンドリング

4. **フェーズ4: 拡張機能**
   - ファイルダウンロードオプション
   - リアクション情報の追加
   - ユーザー情報の詳細化

5. **フェーズ5: テスト・改善**
   - 既存機能のデグレテスト
   - エクスポート品質確認
   - パフォーマンス最適化

## デグレ防止策

### 1. コード分離
- 新機能は完全に独立したサービスとして実装
- 既存コンポーネントへの変更は最小限

### 2. キーボードショートカット
- Ctrl+E を先にチェックすることで、既存の "E" と競合なし
- `event.preventDefault()` と `event.stopPropagation()` で確実に処理を止める

### 3. エラーハンドリング
- すべてのエクスポート処理をtry-catchで囲む
- エラー時も既存のスレッド表示に影響なし

### 4. テスト項目
- [ ] "E" キーで最後のメッセージに移動（既存機能）
- [ ] "Ctrl+E" でエクスポートダイアログ表示
- [ ] スレッドがない状態でCtrl+Eを押してもエラーが出ない
- [ ] エクスポート中も他の操作が可能
- [ ] エクスポートキャンセルが正常に動作
- [ ] 各フォーマット（TSV/Markdown）が正しく出力される
- [ ] 添付ファイルURLが正しく生成される

## 今後の拡張可能性

1. **バッチエクスポート**
   - 複数スレッドを一括エクスポート
   - チャンネル全体のエクスポート

2. **カスタムテンプレート**
   - ユーザー定義のエクスポート形式
   - JSONエクスポート

3. **検索結果エクスポート**
   - 検索結果全体をエクスポート
   - フィルタリングされた結果のみエクスポート

4. **自動エクスポート**
   - 定期的な自動バックアップ
   - 重要スレッドの自動保存

## まとめ

この設計により、既存機能に影響を与えることなく、スレッド情報を効率的にエクスポートできる機能を実装できます。LLMへの入力に最適化された形式で、投稿者情報や添付ファイルも含めた完全なコンテキストを保存可能です。
