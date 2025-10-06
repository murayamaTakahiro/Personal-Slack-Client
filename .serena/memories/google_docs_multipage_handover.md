# Google Docs/Sheets マルチページプレビュー - 引き継ぎ書

**作成日**: 2025-10-06  
**ステータス**: 調査中・実装待ち  
**優先度**: 中

## 🎯 課題

現在のGoogle Docs/Sheetsプレビューは**1ページ目のサムネイルのみ**を表示している。本家Slackではスクロールすることで全ページを閲覧できる。

### ユーザーからのフィードバック

> 「本家Slackでは、GoogleドキュメントやGoogleスプレッドシートを開いた際、1ページに収まらない部分もスクロールによって表示できます。このアプリケーションでは、1ページ目しか表示されません。これは本家Slackに比べ、結構見劣りします。」

**提供されたスクリーンショット**: 
- `C:\Users\tmura\OneDrive\ドキュメント\ShareX\Screenshots\2025-10\20251006125724_personal-slack-client.png`
- Google Docsの1ページ目のみが表示されている様子

## 📊 現在の実装状況

### ✅ 完成している機能

1. **基本サムネイル表示** (Phase 1)
   - `google-sheets`, `google-docs` ファイルタイプ判定
   - GoogleDocsPreview.svelte コンポーネント
   - FileAttachments.svelte でのルーティング

2. **Lightbox対応** (Phase 2)
   - 大きなサムネイル表示（960px）
   - メタデータパネル（右側320px）
   - "Open in Google Sheets/Docs" ボタン
   - ローディング・エラー状態

3. **インタラクティブズーム** (Phase 3)
   - ダブルクリックズーム
   - ツールバーズームボタン (+, -, 1:1)
   - キーボードショートカット (+, -, 0)
   - スクロール対応（マウス・キーボード両方）

### 🔍 調査が必要な項目

#### 1. 本家Slackの実装方式

以下のいずれかの方式を使用している可能性：

**Option A: 複数ページのサムネイル方式**（PDFライク）
- 各ページのサムネイルを縦に並べて表示
- ページネーション付き
- Slack APIが複数のサムネイルURLを提供

**Option B: 1つの大きな縦長画像**
- 全ページを1枚の大きな画像として提供
- スクロールで全体を見る
- Slack APIが1つの大きなサムネイルを提供

**Option C: iframe埋め込み**
- Google Docs Viewer APIを使用
- 実際のドキュメントを埋め込み
- 認証・セキュリティが複雑

#### 2. Slack APIのデータ構造

**確認が必要な情報**:
- `SlackFile`オブジェクトに複数ページのサムネイルURLがあるか？
- `thumb_pdf`のような特殊なプロパティがあるか？
- ページ数情報が含まれているか？

**現在のSlackFile型定義** (`src/lib/types/slack.ts:251-307`):
```typescript
interface SlackFile {
  // Thumbnails
  thumb_64?: string;
  thumb_80?: string;
  thumb_160?: string;
  thumb_360?: string;
  thumb_480?: string;
  thumb_720?: string;
  thumb_960?: string;
  thumb_1024?: string;
  thumb_pdf?: string;  // ← PDFで使用、Google Docsでも？
  thumb_video?: string;
  // ...
}
```

## 🔧 次のセッションでの調査手順

### Step 1: 本家Slackの動作確認

**必要な情報**:
1. 本家Slackで複数ページのGoogle Docsを開く
2. スクロールしたときのUIの様子をスクリーンショットで記録
3. 以下を確認：
   - 複数のサムネイル画像が表示されるか？
   - 1つの大きな画像をスクロールしているか？
   - ページ番号やページネーションがあるか？

### Step 2: Slack APIレスポンスの確認

**デバッグ方法**:
```javascript
// GoogleDocsPreview.svelte または Lightbox.svelte に追加
console.log('Full file object:', JSON.stringify(file, null, 2));
```

**確認すべき項目**:
- [ ] `thumb_*` プロパティに複数のURLがあるか
- [ ] 特殊なプロパティ（`thumb_pdf`のような）があるか
- [ ] ページ数や追加のメタデータがあるか
- [ ] `preview`プロパティに何か情報があるか

### Step 3: 実装方式の決定

調査結果に基づいて、以下のいずれかを選択：

#### 方式A: 複数サムネイル表示（推奨）
**条件**: Slack APIが複数ページのサムネイルを提供している場合

**実装**:
```svelte
<!-- 複数のサムネイルを縦に並べる -->
<div class="google-pages-container">
  {#each thumbnailPages as pageUrl, index}
    <div class="google-page">
      <img src={pageUrl} alt="Page {index + 1}" />
    </div>
  {/each}
</div>
```

**参考実装**: PDFプレビュー（複数ページ対応済み）

#### 方式B: 大きな画像スクロール（シンプル）
**条件**: 1つの大きな縦長画像が提供されている場合

**実装**: 現在の実装をそのまま使用（すでにスクロール対応済み）

**改善点**:
- 画像の高さ制限を解除
- スクロールエリアを最適化

#### 方式C: Google Docs Viewer埋め込み（非推奨）
**条件**: サムネイルが不十分な場合の最終手段

**理由**:
- 認証が複雑（OAuth必要）
- セキュリティリスク（CORS、CSP）
- パフォーマンスが悪い
- 本家Slackも使っていない可能性が高い

## 📝 関連ファイル

### 実装済みファイル
- `src/lib/components/files/GoogleDocsPreview.svelte` - サムネイル表示
- `src/lib/components/files/Lightbox.svelte` - Lightboxプレビュー
- `src/lib/services/fileService.ts` - ファイルタイプ判定
- `src/lib/types/slack.ts` - SlackFile型定義

### 参考にできる実装
- `src/lib/components/files/PdfRenderer.svelte` - 複数ページ対応の参考
- `src/lib/components/files/ExcelPreview.svelte` - 複数シート対応の参考

## 💡 実装のヒント

### PDFの複数ページ実装から学べること

**PdfRenderer.svelte** は複数ページを以下のように処理：
```typescript
let pdfCurrentPage = 1;
let pdfTotalPages = 0;

function pdfNextPage() { /* ... */ }
function pdfPreviousPage() { /* ... */ }
```

**Lightbox.svelte** のPDFナビゲーション:
```svelte
{#if isPdf && pdfTotalPages > 1}
  <div class="lightbox-navigation">
    <button on:click={pdfPreviousPage}>Previous</button>
    <span>{pdfCurrentPage} / {pdfTotalPages}</span>
    <button on:click={pdfNextPage}>Next</button>
  </div>
{/if}
```

同様のアプローチをGoogle Docsに適用可能。

### 潜在的な課題

1. **Slack APIの制限**
   - 複数ページのサムネイルを提供していない可能性
   - その場合は1ページ目のみの表示が最善

2. **パフォーマンス**
   - 複数の大きな画像を読み込むと遅い
   - 遅延読み込み（lazy loading）が必要

3. **認証**
   - 複数のサムネイルURLに認証が必要
   - `createFileDataUrl()`で各URLを処理

## ✅ 次のセッションでやること

1. **本家Slackの動作確認**（スクリーンショット）
2. **Slack APIレスポンスのデバッグ**（console.log）
3. **実装方式の決定**（A, B, or C）
4. **実装開始**（選択した方式に基づいて）
5. **テスト**（動作確認）

## 🚫 現時点での制約

- Google Docs APIへの直接アクセスは不可
- Slack APIの提供するデータに依存
- 実データがないと実装方針を決められない

## 📚 参考メモリファイル

- `google_docs_sheets_implementation_complete.md` - Phase 1-3の完了記録
- `google_docs_keyboard_scroll_fix.md` - キーボードスクロール修正
- `google_docs_sheets_implementation_plan.md` - 元の実装計画

---

**作成日**: 2025-10-06  
**次回セッション**: 本家Slackの動作確認 + Slack APIデータ調査  
**作成者**: Claude (Serena MCP)
