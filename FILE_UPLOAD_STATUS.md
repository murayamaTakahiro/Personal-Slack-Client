# ファイルアップロード機能 - 実装状況と残課題

**最終更新**: 2025-01-18
**ステータス**: 部分的に動作（要修正）

## 1. 実装済み機能

### ✅ 完了項目

1. **基本的なアップロード機能**
   - Slack新3ステップAPI（files.getUploadURLExternal）の実装
   - クリップボード画像のペースト機能（Ctrl+V）
   - ドラッグ&ドロップUI（視覚的フィードバック付き）
   - ファイル選択ボタンの配置

2. **技術的実装**
   - Backend (Rust):
     - `src-tauri/src/slack/upload.rs`: 3ステップワークフローの実装
     - `src-tauri/src/commands/upload.rs`: Tauriコマンド
     - APIエンドポイントのフォームデータ形式対応済み
   - Frontend (TypeScript/Svelte):
     - `src/lib/api/upload.ts`: API関数群
     - `src/lib/components/upload/FileUploadManager.svelte`: アップロード管理UI
     - `src/lib/components/PostDialog.svelte`: 統合済み

## 2. 確認済み動作

- ✅ クリップボード画像のペースト認識
- ✅ 画像データのSlackへのアップロード成功
- ✅ UIへのファイル表示とステータス管理

## 3. 未解決の問題

### 🔴 問題1: メッセージと画像の分離投稿

**現象**: テキストメッセージと画像が別々のメッセージとして投稿される

**原因（推測）**:
- 現在の実装では、ファイルアップロードとメッセージ投稿が独立して実行されている
- `files.completeUploadExternal`の`initial_comment`パラメータが正しく設定されていない可能性

**修正案**:
1. PostDialogの`handlePost`関数を修正し、ファイルがある場合：
   - ファイルアップロード時に`initial_comment`としてメッセージテキストを含める
   - メッセージ単体の投稿をスキップ
2. または、メッセージ投稿APIに`files`パラメータを追加

**関連ファイル**:
- `src/lib/components/PostDialog.svelte` (handlePost関数)
- `src-tauri/src/slack/upload.rs` (complete_upload関数)

### 🔴 問題2: ファイルピッカーが機能しない

**現象**: ファイル選択ダイアログで選択してもアップロードされない

**原因（推測）**:
- Tauriのファイルダイアログは**ファイルパスのみ**を返す（File objectではない）
- 現在のFileUploadManagerは`File`オブジェクトを期待している
- パスから直接アップロードする処理が未実装

**修正案**:
1. `FileUploadManager`に`addFilePath`メソッドを追加
2. ファイルパスを受け取り、`upload_file_to_slack`コマンドを直接呼び出す
3. または、`@tauri-apps/plugin-fs`を使用してファイル内容を読み込む

**関連コード箇所**:
```javascript
// src/lib/components/PostDialog.svelte - Line 159-182
async function handleSelectFiles() {
  // 現在: パスのみ取得、File objectではない
  const selected = await open({ multiple: true });
  // TODO: パスから直接アップロードする処理が必要
}
```

## 4. 推奨される次のステップ

### Step 1: メッセージ統合問題の修正
```typescript
// PostDialog.svelte の handlePost 関数を修正
async function handlePost() {
  const hasFiles = fileUploadManager?.hasUploads();

  if (hasFiles) {
    // ファイルアップロード時にメッセージも含める
    await fileUploadManager.uploadAllWithComment(text);
    // メッセージ単体投稿をスキップ
  } else {
    // 通常のメッセージ投稿
    await postToChannel(channelId, formattedText);
  }
}
```

### Step 2: ファイルパス処理の実装
```typescript
// FileUploadManager.svelte に追加
export async function addFilePath(filePath: string) {
  const fileInfo = await getFileInfo(filePath);
  const response = await uploadFileToSlack(
    filePath,
    channelId,
    initialComment,
    threadTs
  );
  // ...
}
```

## 5. テスト手順

1. **クリップボード画像 + メッセージ**:
   - テキストを入力
   - 画像をペースト
   - 送信して、1つのメッセージになることを確認

2. **ファイルピッカー**:
   - ファイル選択ボタンをクリック
   - ファイルを選択
   - アップロードされることを確認

3. **ドラッグ&ドロップ**:
   - 実装後にテスト予定

## 6. 参考情報

### Slack API仕様
- `files.completeUploadExternal`の`initial_comment`パラメータでメッセージ付きアップロードが可能
- `chat.postMessage`の`attachments`や`blocks`でファイル参照も可能

### Tauri制限事項
- ファイルダイアログは**パスのみ**返す（ブラウザのFile APIとは異なる）
- ファイル読み込みには`@tauri-apps/plugin-fs`または直接Rustコマンドが必要

## 7. コミット履歴
- `5a12bf9`: feat: ファイルアップロード機能の実装（基本実装）
- `f04e277`: docs: ファイルアップロード機能実装計画書を追加

---

**次回作業時の優先順位**:
1. 🔴 メッセージ統合問題の修正（高優先度）
2. 🔴 ファイルピッカー機能の修正（高優先度）
3. 🟡 複数ファイル同時アップロードのテスト
4. 🟡 エラーハンドリングの改善

**推定作業時間**: 2-3時間