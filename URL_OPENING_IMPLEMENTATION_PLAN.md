# URL開く機能 実装計画書

## 1. 機能概要

Slackメッセージ内のURLを自動抽出し、キーボードショートカット（Alt+Enter）で適切に開く機能を実装する。

### 主要機能
- メッセージからURL自動抽出
- Slack URLは最初の1つのみ開く
- 外部URLはすべて開く
- Alt+Enterで一括処理

## 2. 要件定義

### 2.1 機能要件
- **URL抽出**: メッセージテキストからすべてのHTTP/HTTPS URLを抽出
- **URL分類**: Slack archive URLと外部URLを区別
- **開く動作**:
  - Slack URL: 最初の1つのみ
  - 外部URL: すべて
- **キーボードショートカット**: Alt+Enter（設定可能）

### 2.2 非機能要件
- **パフォーマンス**: URL開く際に200ms間隔
- **安全性**: 5個以上の外部URL時に確認ダイアログ
- **互換性**: Windows/Mac/Linux対応

## 3. 技術設計

### 3.1 URL検出パターン

```typescript
// Slack Archive URL (クエリパラメータ含む)
const SLACK_URL_PATTERN = /https:\/\/[\w-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+(\?[^\s<>"{}|\\^`\[\]]*)?/gi;

// 一般的なURL
const GENERAL_URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
```

### 3.2 アーキテクチャ

```
┌─────────────────┐
│  MessageItem    │
│  ThreadView     │
└────────┬────────┘
         │ Alt+Enter
         ▼
┌─────────────────┐
│  URLService     │ ← URL抽出・分類
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tauri Command  │ ← open_urls_smart
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Browser        │ ← タブで開く
└─────────────────┘
```

## 4. 実装フェーズ

### フェーズ1: URL抽出サービス（1日）

#### 4.1.1 新規ファイル作成
**`src/lib/services/urlService.ts`**

```typescript
export interface ExtractedUrls {
  slackUrls: string[];
  externalUrls: string[];
}

export class UrlService {
  extractUrls(text: string): ExtractedUrls {
    // URL抽出ロジック
  }
  
  isSlackArchiveUrl(url: string): boolean {
    // Slack URL判定
  }
}
```

#### 4.1.2 Rustバックエンド
**`src-tauri/src/commands/url.rs`**

```rust
#[tauri::command]
pub async fn open_urls_smart(
    slack_url: Option<String>,
    external_urls: Vec<String>,
    delay_ms: Option<u64>
) -> Result<OpenUrlsResult, String>
```

### フェーズ2: フロントエンド統合（1日）

#### 4.2.1 型定義追加
**`src/lib/types/slack.ts`**
- `KeyboardShortcuts`に`openUrls?: string`追加

#### 4.2.2 コンポーネント更新
**`src/lib/components/MessageItem.svelte`**
**`src/lib/components/ThreadView.svelte`**

```typescript
// キーボードハンドラー登録
keyboardService.registerHandler('openUrls', {
  action: async () => {
    const urls = urlService.extractUrls(message.text);
    await openUrlsSmart(
      urls.slackUrls[0],
      urls.externalUrls
    );
  },
  allowInInput: false
});
```

### フェーズ3: UX改善（0.5日）

#### 4.3.1 通知システム
- トースト通知実装
- 確認ダイアログ実装

#### 4.3.2 設定UI
- KeyboardSettings.svelteに追加

## 5. API仕様

### 5.1 フロントエンドAPI

```typescript
// URL抽出
function extractUrls(text: string): ExtractedUrls

// URL開く
async function openUrlsSmart(
  slackUrl: string | null,
  externalUrls: string[]
): Promise<void>
```

### 5.2 バックエンドAPI

```rust
// Tauriコマンド
#[tauri::command]
pub async fn open_urls_smart(
    slack_url: Option<String>,
    external_urls: Vec<String>,
    delay_ms: Option<u64>
) -> Result<OpenUrlsResult, String>

pub struct OpenUrlsResult {
    opened_slack: bool,
    opened_external_count: usize,
    errors: Vec<String>
}
```

## 6. URL処理詳細

### 6.1 サポートするSlack URLパターン

1. **基本形**: 
   ```
   https://workspace.slack.com/archives/C123/p456789
   ```

2. **スレッド参照付き**:
   ```
   https://workspace.slack.com/archives/C123/p456789?thread_ts=123.456&cid=C123
   ```

### 6.2 処理フロー

```javascript
function processMessageUrls(text: string) {
  const allUrls = extractAllUrls(text);
  
  const slackUrls = allUrls.filter(isSlackArchiveUrl);
  const externalUrls = allUrls.filter(url => !isSlackArchiveUrl(url));
  
  return {
    slackToOpen: slackUrls[0] || null,  // 最初の1つ
    externalsToOpen: externalUrls       // すべて
  };
}
```

## 7. ユーザー体験

### 7.1 基本フロー
1. メッセージ選択
2. Alt+Enter押下
3. URL自動検出・分類
4. 開く処理:
   - Slack: 1つ
   - 外部: すべて
5. フィードバック表示

### 7.2 フィードバック例

```
「Opening 1 Slack link and 3 external URLs...」
「Opened successfully」
「Warning: Opening 8 external URLs. Continue?」
```

## 8. エラーハンドリング

### 8.1 エラーケース
- URL開けない場合
- ブラウザ起動失敗
- ポップアップブロッカー
- 不正なURL形式

### 8.2 エラー処理

```typescript
try {
  await openUrlsSmart(slackUrl, externalUrls);
  showToast('URLs opened successfully');
} catch (error) {
  showToast(`Failed to open URLs: ${error.message}`, 'error');
  console.error('URL opening error:', error);
}
```

## 9. テスト戦略

### 9.1 単体テスト
- URL抽出関数
- Slack URL判定
- URL分類ロジック

### 9.2 統合テスト
- キーボードショートカット動作
- Tauriコマンド実行
- エラーハンドリング

### 9.3 テストケース例

```typescript
describe('UrlService', () => {
  test('extracts multiple Slack URLs', () => {
    const text = `
      Check https://workspace.slack.com/archives/C123/p456
      Also https://workspace.slack.com/archives/C789/p012
    `;
    const urls = urlService.extractUrls(text);
    expect(urls.slackUrls).toHaveLength(2);
  });
  
  test('handles query parameters', () => {
    const url = 'https://workspace.slack.com/archives/C123/p456?thread_ts=123&cid=C123';
    expect(urlService.isSlackArchiveUrl(url)).toBe(true);
  });
});
```

## 10. 開発スケジュール

### タイムライン（合計: 2.5日）

| フェーズ | 作業内容 | 工数 |
|---------|----------|------|
| フェーズ1 | URL抽出サービス実装 | 1日 |
| フェーズ2 | フロントエンド統合 | 1日 |
| フェーズ3 | UX改善・テスト | 0.5日 |

### マイルストーン
- Day 1: URL抽出・分類機能完成
- Day 2: キーボードショートカット統合
- Day 2.5: テスト完了・リリース準備

## 11. 追加考慮事項

### 11.1 将来の拡張
- URL プレビュー機能
- ドメインホワイトリスト
- 開いたURL履歴

### 11.2 設定オプション
```typescript
interface UrlOpeningConfig {
  maxExternalUrls: number;      // デフォルト: 10
  delayBetweenUrls: number;      // デフォルト: 200ms
  confirmThreshold: number;      // デフォルト: 5
  shortcut: string;              // デフォルト: 'Alt+Enter'
}
```

---

これで実装に必要なすべての情報が揃いました。この計画書に基づいて開発を進めることができます。