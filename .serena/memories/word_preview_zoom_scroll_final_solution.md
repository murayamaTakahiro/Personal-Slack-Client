# Word Preview ズーム・スクロール問題 - 最終解決

## ✅ 最終的な解決方法

**`display: inline-block` から `display: block` への変更**

### 変更内容

**ファイル**: `src/lib/components/files/Lightbox.svelte`

#### 1. HTML 構造 (Line 1201)
```html
<div class="word-preview-wrapper" style="transform: scale({zoomLevel}); transform-origin: top left;">
  <WordPreview ... />
</div>
```

#### 2. CSS スタイル (Lines 1638-1649)
```css
.word-preview-wrapper {
  max-width: 90vw;
  max-height: 70vh;
  overflow: auto;
  background: var(--color-surface);
  border-radius: 8px;
  /* Use block to let content determine size naturally */
  display: block;
  /* Let the content flow naturally */
  width: fit-content;
  height: fit-content;
}
```

## 🔍 問題の根本原因

### 試行1: zoom プロパティ (失敗)
**問題**:
- `.word-preview-wrapper` に `max-height: 70vh` が設定
- `zoom` で拡大しても、親コンテナの高さ制限により下部がクリップされる
- `.lightbox-content` の `overflow: hidden` も影響

**なぜ失敗したか**:
- `zoom` はレイアウトサイズを変更するが、親の `max-height` 制約は変わらない
- CSS だけでは Word 専用の条件分岐ができない

### 試行2: transform: scale() + 明示的な width (失敗)
**問題**:
- `transform: scale()` と `width: {800 * zoomLevel}px` を併用
- 二重にスケールされる

**なぜ失敗したか**:
- `transform: scale()` は視覚的なスケールのみ
- 明示的な `width` はレイアウトサイズを変更
- 両方を適用すると矛盾

### 最終解決: display: block + fit-content
**成功の理由**:
1. **`display: block`**: wrapper がブロック要素として振る舞う
2. **`width: fit-content`**: 内部コンテンツ（800px の `.content-container`）のサイズに合わせる
3. **`height: fit-content`**: コンテンツの高さに合わせる
4. **`overflow: auto`**: スクロールバーを適切に表示
5. **`transform: scale()`**: 視覚的にスケール、レイアウトサイズは変わらない

## 📊 display: inline-block vs display: block の違い

### inline-block の問題点
- 子要素のサイズに「完全に」依存
- Word の可変幅構造（`.content-container` が 800px 固定）では、wrapper が正しいサイズを認識できない
- `transform: scale()` との相性が悪い

### block の利点
- `width: fit-content` で明示的にコンテンツ幅を取得
- `height: fit-content` でコンテンツ高さを取得
- より予測可能な挙動

## 🎯 Excel との比較

### Excel が inline-block で動作する理由
- `<table>` 要素が固有の幅を持つ
- テーブル構造が明確な寸法を提供
- `inline-block` でも正しくサイズが計算される

### Word が block を必要とする理由
- `<div>` ベースの構造
- `.content-container` は固定幅だが、可変高さ
- `fit-content` で明示的にサイズを指定する必要がある

## 🔗 関連ファイル

- **Lightbox.svelte** (Lines 1201, 1638-1649): 修正箇所
- **WordPreview.svelte**: 構造は変更不要
- **ExcelPreview.svelte**: 参考（table 構造で inline-block が機能）

## 📝 試行錯誤の履歴

### 前回のセッション（3回の試行、すべて失敗）
1. `.content-container` に `overflow` を追加 → 効果なし
2. `.word-preview` に `min-height` を追加 → 効果なし
3. `.word-preview` を固定幅に変更 → 効果なし

### 今回のセッション（2回の試行）
1. `zoom` プロパティを使用 → max-height 制約で失敗
2. `display: block` + `fit-content` → 成功 ✅

## 🎓 教訓

1. **transform: scale() の特性を理解する**
   - 視覚的にのみスケール
   - レイアウトサイズは変わらない
   - `overflow: auto` と組み合わせるには工夫が必要

2. **display プロパティの重要性**
   - `inline-block` vs `block` で挙動が大きく変わる
   - `fit-content` と組み合わせることで予測可能な挙動を実現

3. **親コンテナの制約に注意**
   - `max-width/max-height` は子要素のスケールに影響
   - `overflow: hidden` は拡大されたコンテンツをクリップ

4. **CSS だけでは限界がある場合もある**
   - 条件分岐が必要な場合は HTML 側で対応
   - JavaScript での動的計算も選択肢

## 🗑️ メモリファイル整理

以下のメモリは役目を終えたため削除可能:
- `word_preview_zoom_scroll_handover` (引き継ぎ書)
- `word_preview_zoom_scroll_solution` (zoom の試行)
- `word_preview_scroll_fix` (最初の試行)
- `word_preview_scale_scroll_final_fix` (失敗した試行)

このメモリ (`word_preview_zoom_scroll_final_solution`) に集約済み。
