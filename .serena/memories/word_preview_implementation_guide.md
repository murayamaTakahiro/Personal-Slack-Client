# Word プレビュー実装ガイド（Excel実装経験からの引き継ぎ）

## 現状分析

### 現在のWord対応状況
- **ファイル**: `src/lib/components/files/OfficePreview.svelte`
- **タイプ判定**: `file.type === 'word'` で判定（Lightbox.svelte:58）
- **現在の表示**: サムネイル画像 or ファイルアイコン + ダウンロードボタンのみ
- **制限**: 「Full preview not available. Download to open in Office application.」と表示

### Excelで実装した機能（参考）
1. ✅ SheetJS (xlsx) を使用したファイル解析
2. ✅ テーブル形式でのデータ表示（固定ヘッダー + スクロール可能なボディ）
3. ✅ 複数シートのタブ表示とシート切り替え
4. ✅ Ctrl+Tab/Ctrl+Shift+Tab によるシート移動
5. ✅ Lightbox での全画面プレビュー対応
6. ✅ `transform: scale()` を使用したズーム対応
7. ✅ キーボードナビゲーション（j/k, h/l, Page Up/Down等）

## Word実装の方針

### アプローチ1: Mammoth.js を使用（推奨）
**ライブラリ**: [Mammoth.js](https://www.npmjs.com/package/mammoth)
- .docx ファイルを HTML に変換
- フォーマットをある程度保持
- ブラウザで直接表示可能

**実装手順**:
1. `npm install mammoth` でインストール
2. WordPreview.svelte コンポーネントを作成
3. Tauri バックエンドでファイルをダウンロード
4. Mammoth で HTML に変換
5. 変換された HTML を表示（sanitize 必須）

**メリット**:
- フォーマットがある程度保持される
- テキストが選択可能
- スクロール可能なプレビュー

**デメリット**:
- 完全な再現は不可能（レイアウト崩れの可能性）
- 複雑な書式や画像の扱いに制限

### アプローチ2: サムネイル画像の活用（現状の拡張）
**現在の実装を拡張**:
- Slack が提供する `thumb_*` 画像を使用
- ページネーション形式で複数ページを表示
- PDF のようなページ送り機能を追加

**メリット**:
- 実装が比較的簡単
- ビジュアルの再現度が高い

**デメリット**:
- Slack がサムネイルを提供していない場合は表示不可
- テキスト選択不可
- 検索不可

## 推奨実装プラン（Mammoth.js使用）

### フェーズ1: 基本プレビュー機能
**ファイル**: `src/lib/components/files/WordPreview.svelte` を新規作成

**必要な機能**:
1. ファイルダウンロード（Tauri経由）
2. Mammoth.js での HTML 変換
3. 変換された HTML の表示（DOMPurify でサニタイズ）
4. ローディング状態の表示
5. エラーハンドリング

**コンポーネント構造（Excel参考）**:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { SlackFile } from '$lib/types/slack';
  import { invoke } from '@tauri-apps/api/core';
  import mammoth from 'mammoth';
  import DOMPurify from 'dompurify';
  
  export let file: SlackFile;
  export let workspaceId: string;
  export let compact: boolean = false;
  
  let isLoading = true;
  let error: string | null = null;
  let htmlContent: string = '';
  let contentContainer: HTMLDivElement;
  
  const MAX_PREVIEW_SIZE = 10 * 1024 * 1024; // 10MB
  
  async function loadWordContent() {
    isLoading = true;
    error = null;
    
    try {
      const url = file.url_private_download || file.url_private;
      
      // Download via Tauri
      const arrayBuffer = await invoke<number[]>('download_file_binary', {
        workspaceId,
        url
      });
      
      // Convert to Uint8Array
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to HTML using Mammoth
      const result = await mammoth.convertToHtml({ arrayBuffer: uint8Array.buffer });
      
      // Sanitize HTML
      htmlContent = DOMPurify.sanitize(result.value);
      
      // Log warnings if any
      if (result.messages.length > 0) {
        console.warn('[WordPreview] Conversion warnings:', result.messages);
      }
      
    } catch (err) {
      console.error('[WordPreview] Error:', err);
      error = err instanceof Error ? err.message : 'Failed to load Word file';
    } finally {
      isLoading = false;
    }
  }
  
  onMount(() => {
    loadWordContent();
  });
</script>

<div class="word-preview" class:compact>
  {#if isLoading}
    <div class="loading">Loading Word document...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="content-container" bind:this={contentContainer}>
      {@html htmlContent}
    </div>
  {/if}
</div>

<style>
  .word-preview {
    width: 100%;
    background: white;
    padding: 2rem;
    overflow: auto;
  }
  
  .content-container {
    max-width: 800px;
    margin: 0 auto;
    font-family: 'Calibri', 'Arial', sans-serif;
    line-height: 1.6;
  }
  
  /* Style converted HTML */
  .content-container :global(p) {
    margin-bottom: 1em;
  }
  
  .content-container :global(h1) {
    font-size: 2em;
    margin-bottom: 0.5em;
  }
  
  /* ... その他のスタイル */
</style>
```

### フェーズ2: Lightbox統合
**ファイル**: `src/lib/components/files/Lightbox.svelte` を更新

1. `isWord` の判定を追加（既に存在: Line 58）
2. WordPreview コンポーネントをインポート
3. レンダリングブロックを追加:
```svelte
{:else if isWord}
  <div class="word-preview-wrapper" style="transform: scale({zoomLevel}); transform-origin: top left;">
    <WordPreview
      file={file.file}
      workspaceId={$activeWorkspace?.id || 'default'}
      compact={false}
    />
  </div>
```

4. スクロール関数を更新（Excel と同じパターン）:
```typescript
// scrollUp(), scrollDown() など
else if (isWord) {
  const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
  if (wrapper) {
    wrapper.scrollTop = Math.max(0, wrapper.scrollTop - scrollSpeed);
  }
}
```

### フェーズ3: 高度な機能（オプション）
1. **検索機能**: HTML 内テキスト検索
2. **目次の抽出**: ヘッダータグ（h1-h6）から自動生成
3. **ページ分割**: 長文書を仮想ページに分割
4. **スタイル改善**: Word らしい見た目の再現

## Excel実装から学んだ重要ポイント

### 1. `zoom` vs `transform: scale()` の違い
- **Excel で発生した問題**: `zoom` から `transform: scale()` に変更時、スクロールが機能しなくなった
- **原因**: `transform: scale()` は視覚的にスケールするが、レイアウトサイズは変更しない
- **解決策**: スクロール対象を**親要素**（`.word-preview-wrapper`）に変更

**Wordでの対応**:
```typescript
// スクロール対象は wrapper（親要素）にする
const wrapper = containerDiv?.querySelector('.word-preview-wrapper');
if (wrapper) {
  wrapper.scrollTop = ...;
}
```

### 2. ファイルダウンロードの統一パターン
Excel で使用している Tauri 経由のダウンロード方法を踏襲:
```typescript
const arrayBuffer = await invoke<number[]>('download_file_binary', {
  workspaceId,
  url: file.url_private_download || file.url_private
});
const uint8Array = new Uint8Array(arrayBuffer);
```

### 3. エラーハンドリングとローディング状態
- `isLoading` と `error` state を必ず用意
- Toast 通知でユーザーにフィードバック
- ファイルサイズ制限（MAX_PREVIEW_SIZE）の実装

### 4. compact モードの対応
- メッセージリスト用の compact 表示
- Lightbox 用の全画面表示
- CSS で切り替え

## 実装チェックリスト

### 必須項目
- [ ] Mammoth.js のインストール (`npm install mammoth`)
- [ ] DOMPurify のインストール (`npm install dompurify @types/dompurify`)
- [ ] WordPreview.svelte の作成
- [ ] Lightbox.svelte への統合（レンダリング部分）
- [ ] スクロール関数の更新（8箇所: scrollUp/Down, scrollLeft/Right, PageUp/Down, ToTop/Bottom）
- [ ] エラーハンドリングとローディング状態
- [ ] ダウンロード機能（既存の OfficePreview と同様）

### 推奨項目
- [ ] ファイルサイズ制限の実装
- [ ] HTML サニタイズ（XSS対策）
- [ ] スタイルの調整（Word らしい見た目）
- [ ] compact モードの実装
- [ ] テスト（.docx ファイルでの動作確認）

### オプション項目
- [ ] 検索機能
- [ ] 目次の自動生成
- [ ] ページ分割表示
- [ ] 画像の処理改善

## 既知の制約と注意点

1. **フォーマットの制限**: Mammoth.js は完全な再現ができない
   - 複雑なレイアウトは崩れる可能性
   - 一部のフォントや色が失われる
   - テーブルの複雑な罫線は簡略化される

2. **ファイル形式**: .docx のみ対応（.doc は非対応）
   - .doc ファイルは別の変換ライブラリが必要
   - または「ダウンロードのみ」に留める

3. **パフォーマンス**: 大きなファイルは変換に時間がかかる
   - ファイルサイズ制限を設定
   - 進捗表示の検討

4. **セキュリティ**: HTML インジェクションのリスク
   - DOMPurify で必ずサニタイズ
   - `@html` ディレクティブ使用時は慎重に

## 関連ファイル

### 既存ファイル（参考）
- `src/lib/components/files/ExcelPreview.svelte` - 実装パターンの参考
- `src/lib/components/files/OfficePreview.svelte` - 現在のWord対応（置き換え対象）
- `src/lib/components/files/Lightbox.svelte` - 統合先
- `src/lib/components/files/CsvPreview.svelte` - テーブル表示の参考

### 新規作成ファイル
- `src/lib/components/files/WordPreview.svelte` - メインコンポーネント

## 次のステップ

1. **パッケージインストール**:
   ```bash
   npm install mammoth dompurify @types/dompurify
   ```

2. **WordPreview.svelte 作成**: 基本的なプレビュー機能を実装

3. **Lightbox 統合**: `isWord` 条件分岐を追加

4. **スクロール対応**: 8箇所のスクロール関数を更新

5. **テスト**: .docx ファイルで動作確認

6. **スタイル調整**: Word らしい見た目に調整

7. **エラーハンドリング**: エッジケースのテスト

## まとめ

Excel プレビュー実装で学んだ教訓を活かし、Word プレビューを効率的に実装できます：

✅ **成功パターン**:
- Tauri 経由のファイルダウンロード
- `transform: scale()` + 親要素スクロール
- ローディング/エラー状態の管理
- compact/full モードの切り替え

⚠️ **注意すべき点**:
- HTML サニタイズ（セキュリティ）
- ファイルサイズ制限（パフォーマンス）
- フォーマット制限の明示（UX）

このガイドに従えば、Excel と同等の品質で Word プレビュー機能を実装できます。
