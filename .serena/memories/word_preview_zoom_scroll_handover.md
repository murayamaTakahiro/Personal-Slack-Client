# Word Preview ズーム・スクロール問題 - 引き継ぎ書

## ⚠️ 現状：問題未解決

複数回の修正を試みたが、以下の症状が継続中：
1. **一定倍率を超えるとスクロールしても全体確認できない**
2. **H/L キーが機能しない（左右スクロール不可）**
3. **左右スクロールバーが表示されない**

## 📋 試行した修正（すべて効果なし）

### 試行1: .content-container に overflow を追加
- `overflow-x: auto` → `overflow: auto` + `max-height: 60vh`
- **結果**: 効果なし

### 試行2: .word-preview に min-height を追加
- `.word-preview:not(.compact) { min-height: 500px; }`
- `.content-container` の overflow を削除
- **結果**: 効果なし

### 試行3: .word-preview の幅を固定幅に変更（最新）
**変更内容**:
```css
/* .word-preview */
.word-preview:not(.compact) {
  width: fit-content;
  min-width: 800px;
  min-height: 500px;
}

/* .content-container */
.content-container {
  width: 800px;  /* max-width から変更 */
  margin: 0 auto;
  padding: 1.5rem;
  background: white;
  ...
}
```
- **結果**: まだ改善されていない

## 🔍 問題の核心

### 現在の構造
**Lightbox.svelte**:
```html
<div class="word-preview-wrapper" 
     style="transform: scale({zoomLevel}); transform-origin: top left;">
  <WordPreview file={file.file} workspaceId={...} compact={false} />
</div>
```

**CSS** (Lightbox.svelte Lines 1625-1637):
```css
.word-preview-wrapper {
  max-width: 90vw;
  max-height: 70vh;
  overflow: auto;
  background: var(--color-surface);
  border-radius: 8px;
  display: inline-block;  /* ← 重要 */
}
```

### transform: scale() の問題点
1. `display: inline-block` は中身のサイズに合わせて縮む
2. `transform: scale()` は視覚的にスケールするが、**レイアウトサイズは変わらない**
3. スクロールバーはレイアウトサイズで判断される
4. → スケールされた視覚サイズとレイアウトサイズがミスマッチ

### Excel との違い（Excel は動作している）
**Excel の構造**を詳しく確認する必要あり：
- Excel も同じ `.excel-preview-wrapper` + `display: inline-block` を使用
- Excel も `transform: scale()` を使用
- **しかし Excel は正しく動作している**
- → Excel の内部構造に成功の鍵がある

## 🚀 次のセッションでの作業手順

### ステップ1: Excel の成功パターンを徹底分析
```bash
# Excel の DOM 構造を確認
1. ExcelPreview.svelte の HTML 構造を読む
2. Excel の CSS、特に幅・高さの設定を確認
3. Excel のテーブル要素がどのように幅を確保しているか分析
```

**確認ポイント**:
- Excel の `.excel-preview` の幅設定
- テーブル要素の幅設定
- `table-layout` プロパティの有無
- Excel が固有の幅をどう確保しているか

### ステップ2: ブラウザの開発者ツールで実際の動作を確認
```
1. Excel ファイルを Lightbox で開く
2. 開発者ツールで `.excel-preview-wrapper` の computed サイズを確認
3. transform: scale(2) 適用時のサイズ変化を確認
4. Word ファイルで同じことを確認
5. サイズの違いを特定
```

### ステップ3: 代替アプローチの検討

#### オプションA: zoom プロパティに戻す
Excelは元々 `zoom` を使っていたが、sticky position の問題で `transform: scale()` に変更した。
Word には sticky な要素がないので、`zoom` を試す価値あり。

**検証方法**:
```html
<!-- Lightbox.svelte で Word だけ zoom を使う -->
{:else if isWord}
  <div class="word-preview-wrapper" style="zoom: {zoomLevel};">
    <WordPreview ... />
  </div>
{/if}
```

#### オプションB: wrapper の width/height を明示的に計算
```javascript
// Lightbox.svelte で Word 専用の処理
$: if (isWord && zoomLevel > 1) {
  const baseWidth = 800; // WordPreview の実際の幅
  const baseHeight = 1000; // WordPreview の実際の高さ
  wrapperWidth = baseWidth * zoomLevel;
  wrapperHeight = baseHeight * zoomLevel;
}
```

#### オプションC: WordPreview の構造を完全に見直す
Excel のようなテーブル構造を真似て、固有の幅を持つ構造に変更。

### ステップ4: デバッグ用のログ追加
```javascript
// WordPreview.svelte onMount に追加
console.log('[WordPreview] Component mounted');
console.log('[WordPreview] .word-preview size:', 
  document.querySelector('.word-preview')?.getBoundingClientRect());
console.log('[WordPreview] .content-container size:', 
  document.querySelector('.content-container')?.getBoundingClientRect());
```

## 📊 現在のファイル状態

### 変更済みファイル
- **src/lib/components/files/WordPreview.svelte** - 複数回修正済み（未コミット）

### 現在の WordPreview.svelte の重要部分
**Lines 196-213** (.word-preview CSS):
```css
.word-preview {
  border-radius: 0.375rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.word-preview.compact {
  width: 100%;
  background: transparent;
  border: none;
}

.word-preview:not(.compact) {
  width: fit-content;
  min-width: 800px;
  min-height: 500px;
}
```

**Lines 286-297** (.content-container CSS):
```css
.content-container {
  width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-family: 'Calibri', 'Arial', sans-serif;
  line-height: 1.6;
  color: #000;
}
```

### 未変更（既に正しい）
- **src/lib/components/files/Lightbox.svelte** - スクロールロジックは Word 用に実装済み
  - scrollUp/Down/Left/Right 全て `.word-preview-wrapper` をターゲット

## 🔗 参考メモリ
1. `excel_regression_fixes` - Excel の transform: scale() 問題の修正事例
2. `word_preview_scroll_fix` - 最初の試行錯誤
3. `word_preview_scale_scroll_final_fix` - 最新の試行（効果なし）

## 💡 重要な仮説

### 仮説1: Excel のテーブルが鍵
Excel の `<table>` 要素は自動的に固有の幅を持つ。Word の `<div>` ベースの構造では、親要素に依存してしまう。

**検証方法**: ExcelPreview.svelte の table 要素の computed サイズを確認

### 仮説2: inline-block の問題
`display: inline-block` が Word では正しく動作していない可能性。

**検証方法**: Word でも `display: block` を試す、または wrapper に明示的な幅を設定

### 仮説3: content-container の入れ子構造が問題
`.preview-container` > `.content-container` の入れ子が inline-block の計算を妨げている。

**検証方法**: 構造をフラットにする、または Excel の構造を真似る

## 🎯 推奨される次のアクション

1. **最優先**: Excel の実装を徹底的に分析（DOM 構造、CSS、サイズ計算）
2. **次点**: `zoom` プロパティでの実装を試す（Word には sticky 要素がないため）
3. **代替**: wrapper に明示的な width/height を JavaScript で設定
4. **最終手段**: WordPreview の構造を Excel 風のテーブルベースに変更

## ✅ 次セッションのコマンド例

```bash
# Excel の詳細分析
/serena "word_preview_zoom_scroll_handover メモリを読んで、ExcelPreview.svelte の DOM 構造と CSS を詳細に分析し、Word との違いを特定してください"

# zoom プロパティでの試行
/serena "word_preview_zoom_scroll_handover メモリを読んで、Word プレビューで transform: scale() の代わりに zoom プロパティを使う実装を試してください"
```

---

**重要**: この問題は `transform: scale()` + `display: inline-block` + 可変幅コンテンツの組み合わせで発生している。Excel の成功パターンを理解することが解決の鍵。
