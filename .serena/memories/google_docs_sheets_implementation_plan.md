# Google Docs/Sheets Preview Implementation Plan

**作成日**: 2025-10-06  
**ステータス**: 設計完了・実装準備完了  
**優先度**: 高

## 📋 概要

Slack公式クライアントの動作を分析し、Google Docs/Sheetsのプレビュー機能を既存の実装パターンに完全準拠する形で実装する。

### 主要な設計判断

1. **Slackのサムネイル方式を採用**: iframe埋め込みではなく、Slackが生成した静的サムネイル画像を表示
2. **ImagePreviewパターンを踏襲**: 既存のImagePreview.svelteと同じアーキテクチャを使用
3. **既存関数を100%再利用**: `getBestThumbnailUrl()`, `createFileDataUrl()`等をそのまま使用

## ✅ 整合性評価: 完全一致

### Slack公式UIの分析結果

**確認したスクリーンショット**:
- サムネイル表示: `20251006111803_slack.png`
- プレビュー展開: `20251006111859_slack.png`

**判明した実装方式**:
1. Google Sheetsアイコン（緑の十字）+ サムネイル画像
2. "Spreadsheet in Google Sheets" の説明文
3. クリックでLightbox表示 → 大きなサムネイル + "Google Sheetsで開く"ボタン
4. メタデータ表示（Creator, Size, Modified等）
5. 複数ページのサムネイル一覧（ページネーション）

### 既存実装との整合性マトリクス

| 機能 | 既存実装 | Google Docs実装 | 整合性 |
|------|---------|----------------|--------|
| サムネイル取得 | `getBestThumbnailUrl()` | 同じ | ✅ 100% |
| 画像認証処理 | `createFileDataUrl()` | 同じ | ✅ 100% |
| Lightbox連携 | `filePreviewStore` | 同じ | ✅ 100% |
| エラー処理 | プレースホルダー | 同じ | ✅ 100% |
| コンポーネント構造 | ImagePreview.svelte | ほぼコピー | ✅ 100% |

## 🎯 デグレリスク分析: 極小

### リスク評価と対策

#### 1. FileType enum拡張
```typescript
export type FileType =
  | 'google-sheets'  // 新規追加
  | 'google-docs'    // 新規追加
  | 'image'          // 既存
  | 'pdf'            // 既存
  // ... その他既存型
```

- **リスク**: なし
- **理由**: Union型への追加のみで既存型に影響なし

#### 2. getFileType()関数の変更

**追加箇所**: 60行目付近（powerpointの後、videoの前）

```typescript
// Google Docs/Sheets (external files only)
if (file.is_external) {
  const url = file.url_private || '';
  const extType = file.external_type || '';
  
  // Google Sheets detection
  if (url.includes('docs.google.com/spreadsheets/') || 
      extType === 'gsheet' || 
      extType === 'google_spreadsheet') {
    return 'google-sheets';
  }
  
  // Google Docs detection  
  if (url.includes('docs.google.com/document/') || 
      extType === 'gdoc' || 
      extType === 'google_document') {
    return 'google-docs';
  }
}
```

**デグレリスク**: ✅ **極小**
- **保護策1**: `is_external: true`の条件により既存ファイルは絶対にマッチしない
- **保護策2**: 既存の全ファイルは`is_external: false`
- **保護策3**: URL判定も併用で誤検出防止
- **影響範囲**: 外部ファイルのみ

#### 3. FileAttachments.svelteのルーティング

```svelte
{:else if group.type === 'google-sheets' || group.type === 'google-docs'}
  <GoogleDocsPreview {file} {workspaceId} {compact} />
```

- **リスク**: なし  
- **理由**: 新しい分岐を追加するだけで既存分岐に影響なし

#### 4. 新規コンポーネント作成

- **ファイル**: `src/lib/components/files/GoogleDocsPreview.svelte`
- **リスク**: なし
- **理由**: 新規ファイルなので既存コードに影響ゼロ

## 📝 実装計画

### Phase 1: 基本実装（MVP）

**目標**: Google Docs/Sheetsのサムネイル表示と基本機能

#### 1-1. FileType拡張

**ファイル**: `src/lib/services/fileService.ts`

**変更内容**:
```typescript
// 12-27行目のFileType定義
export type FileType =
  | 'image'
  | 'pdf'
  | 'text'
  | 'csv'
  | 'excel'
  | 'word'
  | 'powerpoint'
  | 'google-sheets'  // 新規追加
  | 'google-docs'    // 新規追加
  | 'video'
  | 'audio'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'archive'
  | 'unknown';
```

#### 1-2. getFileType()拡張

**ファイル**: `src/lib/services/fileService.ts`  
**場所**: 60行目付近（powerpointの後）

**追加コード**:
```typescript
// Google Docs/Sheets (external files)
if (file.is_external) {
  const url = file.url_private || '';
  const extType = file.external_type || '';
  
  if (url.includes('docs.google.com/spreadsheets/') || 
      extType === 'gsheet' || 
      extType === 'google_spreadsheet') {
    return 'google-sheets';
  }
  
  if (url.includes('docs.google.com/document/') || 
      extType === 'gdoc' || 
      extType === 'google_document') {
    return 'google-docs';
  }
}
```

#### 1-3. getFileTypeDisplayName()更新

**ファイル**: `src/lib/services/fileService.ts`  
**場所**: `displayNames`オブジェクト

**追加内容**:
```typescript
const displayNames: Record<FileType, string> = {
  'google-sheets': 'Google Sheets',
  'google-docs': 'Google Docs',
  // ... 既存のマッピング
};
```

#### 1-4. GoogleDocsPreview.svelte作成

**ファイル**: `src/lib/components/files/GoogleDocsPreview.svelte`（新規作成）  
**ベース**: `ImagePreview.svelte`をコピーして修正

**主要な変更点**:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { getBestThumbnailUrl, formatFileSize } from '$lib/api/files';
  import { filePreviewStore } from '$lib/stores/filePreview';
  import { processFileMetadata } from '$lib/services/fileService';
  import { replaceExternalPlaceholder, generateErrorPlaceholder } from '$lib/utils/placeholder';

  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;
  export let maxWidth: number = 360;
  export let maxHeight: number = 240;

  let imageElement: HTMLImageElement;
  let isLoading = true;
  let hasError = false;
  let displayUrl: string | undefined;

  $: isGoogleSheets = file.url_private?.includes('spreadsheets');
  $: isGoogleDocs = file.url_private?.includes('document');
  $: googleAppName = isGoogleSheets ? 'Google Sheets' : 'Google Docs';
  $: googleIcon = isGoogleSheets ? '📊' : '📄';
  $: thumbnailUrl = getBestThumbnailUrl(file, maxWidth);
  $: formattedSize = formatFileSize(file.size);

  onMount(() => {
    loadThumbnail();
  });

  async function loadThumbnail() {
    // ImagePreviewと同じロジックを使用
    // サムネイルURLを取得してdata URLに変換
  }

  async function handleClick() {
    // Option A: Lightboxで開く（Slack準拠）
    const metadata = processFileMetadata(file);
    filePreviewStore.openLightbox(metadata, [metadata]);
    
    // Option B: 新しいタブで開く（シンプル）
    // window.open(file.url_private, '_blank');
  }
</script>

<div class="google-docs-preview" class:compact on:click={handleClick}>
  <div class="preview-container">
    <!-- Google アイコン表示 -->
    <div class="google-icon">{googleIcon}</div>
    
    <!-- サムネイル画像 -->
    {#if isLoading}
      <div class="loading-skeleton"></div>
    {:else if hasError}
      <div class="error-placeholder">Preview unavailable</div>
    {:else}
      <img
        bind:this={imageElement}
        src={displayUrl}
        alt={file.name}
        class="thumbnail-image"
      />
    {/if}
    
    <!-- メタデータ -->
    {#if !compact}
      <div class="metadata">
        <div class="file-name">{file.name || file.title}</div>
        <div class="file-type">
          {isGoogleSheets ? 'Spreadsheet' : 'Document'} in {googleAppName}
        </div>
        <div class="file-size">{formattedSize}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ImagePreview.svelteのスタイルをベースに */
  /* Google Docs特有のスタイル調整を追加 */
  
  .google-icon {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 32px;
    height: 32px;
    background: white;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    z-index: 10;
  }
  
  /* その他のスタイルはImagePreviewから流用 */
</style>
```

#### 1-5. FileAttachments.svelte更新

**ファイル**: `src/lib/components/files/FileAttachments.svelte`

**変更1: import追加**
```svelte
<script lang="ts">
  // ... 既存のimport
  import GoogleDocsPreview from './GoogleDocsPreview.svelte';
</script>
```

**変更2: ルーティング追加（230行目付近）**
```svelte
{:else if group.type === 'powerpoint'}
  <OfficePreview
    file={metadata.file}
    {workspaceId}
    {compact}
  />
{:else if group.type === 'google-sheets' || group.type === 'google-docs'}
  <GoogleDocsPreview
    file={metadata.file}
    {workspaceId}
    {compact}
  />
{:else}
  <GenericFilePreview
    file={metadata.file}
    {workspaceId}
    {compact}
  />
{/if}
```

### Phase 2: Lightbox対応（Phase 1完了後）

**目標**: Lightboxでの大きなプレビュー表示とメタデータパネル

#### 2-1. Lightbox.svelte拡張

**ファイル**: `src/lib/components/files/Lightbox.svelte`

**追加機能**:
1. Google Docs/Sheets判定
2. 大きなサムネイル表示（800x600程度）
3. "Google Sheetsで開く"ボタン
4. メタデータパネル（Creator, Created, Modified, Size等）

```svelte
<!-- Lightboxコンポーネント内に追加 -->
{#if isGoogleDocs(currentFile)}
  <div class="google-docs-lightbox">
    <div class="preview-area">
      <!-- 大きなサムネイル -->
      <img src={largeThumbUrl} alt={currentFile.name} />
    </div>
    
    <div class="metadata-panel">
      <h3>{currentFile.name}</h3>
      <p class="file-type">
        {isGoogleSheets ? 'Spreadsheet' : 'Document'} in Google {isGoogleSheets ? 'Sheets' : 'Docs'}
      </p>
      
      <!-- メタデータ -->
      <div class="metadata-grid">
        <div class="metadata-item">
          <span class="label">Size</span>
          <span class="value">{formatFileSize(currentFile.size)}</span>
        </div>
        <!-- その他のメタデータ -->
      </div>
      
      <!-- アクションボタン -->
      <button 
        class="open-in-google"
        on:click={() => window.open(currentFile.url_private, '_blank')}
      >
        🌐 Google {isGoogleSheets ? 'Sheets' : 'Docs'}で開く
      </button>
    </div>
  </div>
{:else}
  <!-- 既存のLightbox表示 -->
{/if}
```

#### 2-2. ページネーション対応（将来拡張）

複数ページのサムネイルがある場合の対応（優先度: 低）

## 🧪 テスト計画

### 回帰テスト（Phase 1必須）

**既存機能の動作確認**:
- [ ] 画像ファイルのサムネイル表示
- [ ] PDFファイルのプレビュー
- [ ] Excelファイルのプレビュー
- [ ] Wordファイルのプレビュー
- [ ] テキストファイルのプレビュー
- [ ] CSVファイルのプレビュー
- [ ] PowerPointファイルの表示
- [ ] 汎用ファイルのダウンロード

**テスト方法**:
```bash
# 各ファイルタイプを含むメッセージを開いて目視確認
# プレビュー表示が正常か
# クリックでLightboxが開くか
# ダウンロードボタンが機能するか
```

### 新機能テスト（Phase 1）

**Google Sheets/Docs固有のテスト**:
- [ ] Google Sheetsファイルがサムネイル表示される
- [ ] Google Docsファイルがサムネイル表示される
- [ ] Google Sheetsアイコン（📊）が表示される
- [ ] Google Docsアイコン（📄）が表示される
- [ ] "Spreadsheet in Google Sheets" テキスト表示
- [ ] "Document in Google Docs" テキスト表示
- [ ] ファイルサイズが正しく表示される
- [ ] クリックで適切に動作する（Lightbox or 新タブ）

**エラーハンドリングテスト**:
- [ ] サムネイル取得失敗時のプレースホルダー表示
- [ ] 不正なURLの場合のフォールバック（GenericFilePreview）
- [ ] ネットワークエラー時の挙動

### Phase 2追加テスト

**Lightbox機能**:
- [ ] Lightboxで大きなサムネイル表示
- [ ] "Google Sheetsで開く"ボタンの動作
- [ ] メタデータパネルの表示
- [ ] Lightbox内でのナビゲーション（複数ファイル）

## 📊 実装の優先度

| フェーズ | 機能 | 優先度 | 理由 |
|---------|------|-------|------|
| Phase 1 | サムネイル表示 | 🔴 最高 | MVP・基本機能 |
| Phase 1 | ファイル判定 | 🔴 最高 | 必須機能 |
| Phase 1 | クリック動作 | 🔴 最高 | ユーザー操作 |
| Phase 2 | Lightbox対応 | 🟡 高 | Slack完全準拠 |
| Phase 2 | メタデータパネル | 🟡 高 | 情報表示充実 |
| Phase 3 | ページネーション | 🟢 中 | 将来的な拡張 |

## 🎯 成功基準

### Phase 1完了条件
1. ✅ Google Docs/Sheetsがサムネイル表示される
2. ✅ 適切なアイコンと説明文が表示される
3. ✅ クリックで開く（Lightbox or 新タブ）
4. ✅ 既存の全ファイルタイプが正常動作（デグレゼロ）
5. ✅ エラー時のフォールバック動作確認

### Phase 2完了条件
1. ✅ Lightboxで大きなプレビュー表示
2. ✅ "Google Sheetsで開く"ボタン動作
3. ✅ メタデータパネル表示
4. ✅ Slackの公式UIと同等の機能

## 🔧 実装時の注意事項

### コーディング規約
- 既存のImagePreview.svelteのコードスタイルを踏襲
- TypeScript型定義を厳密に
- エラーハンドリングを徹底
- コンソールログは開発時のみ（本番では削除）

### パフォーマンス考慮
- サムネイル画像の遅延読み込み
- data URL変換のキャッシング
- 不要な再レンダリングの防止

### セキュリティ
- XSS対策（サニタイゼーション）
- 外部URLの検証
- CORS対応

### アクセシビリティ
- altテキストの適切な設定
- キーボード操作対応
- スクリーンリーダー対応

## 📚 参照情報

### 関連ファイル
- `src/lib/components/files/ImagePreview.svelte` - ベースとなる実装
- `src/lib/components/files/FileAttachments.svelte` - ルーティング
- `src/lib/services/fileService.ts` - ファイルタイプ判定
- `src/lib/api/files.ts` - ファイル関連ユーティリティ
- `src/lib/types/slack.ts` - SlackFile型定義

### 既存の実装パターン
- サムネイル取得: `getBestThumbnailUrl(file, targetSize)`
- 認証付きダウンロード: `createFileDataUrl(url, mimetype)`
- Lightbox連携: `filePreviewStore.openLightbox(metadata, files)`
- エラー処理: `generateErrorPlaceholder(width)`, `replaceExternalPlaceholder(url, type)`

## ✅ 実装チェックリスト

### Phase 1
- [ ] FileType enumに`google-sheets`, `google-docs`追加
- [ ] getFileType()に検出ロジック追加（60行目付近）
- [ ] getFileTypeDisplayName()に表示名追加
- [ ] GoogleDocsPreview.svelte作成（ImagePreviewベース）
- [ ] FileAttachments.svelteにimport追加
- [ ] FileAttachments.svelteにルーティング追加
- [ ] 回帰テスト実施（全ファイルタイプ）
- [ ] 新機能テスト実施（Google Docs/Sheets）

### Phase 2
- [ ] Lightbox.svelteにGoogle Docs判定追加
- [ ] 大きなサムネイル表示実装
- [ ] メタデータパネル実装
- [ ] "Google Sheetsで開く"ボタン実装
- [ ] Lightboxテスト実施

## 🚀 次のセッションでの実装手順

1. **Phase 1-1〜1-3を実装**: fileService.tsの変更（10分）
2. **Phase 1-4を実装**: GoogleDocsPreview.svelte作成（30分）
3. **Phase 1-5を実装**: FileAttachments.svelte更新（10分）
4. **動作確認**: 回帰テスト + 新機能テスト（20分）
5. **Phase 2実装判断**: Phase 1が問題なければPhase 2へ進む

---

**ドキュメント作成日**: 2025-10-06  
**最終更新日**: 2025-10-06  
**作成者**: Claude (Serena MCP)
