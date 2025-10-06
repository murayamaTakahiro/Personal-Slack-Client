# Word Preview transform: scale() スクロール問題 - 最終修正

## 発生した問題（再発）

前回の修正後も問題が継続：
1. **一定倍率を超えるとスクロールしても全体確認できない**
2. **H/L キーが機能しない（左右スクロール不可）**
3. **左右スクロールバーが表示されない**

## 根本原因の再分析

### 問題の本質
`transform: scale()` と `display: inline-block` の相互作用が原因。

**Lightbox の重要な設定** (`Lightbox.svelte` Line 1636):
```css
.word-preview-wrapper {
  display: inline-block;  /* ← これが重要 */
  overflow: auto;
}
```

このコメント：「Ensure proper scrolling with transform: scale()」

### なぜ inline-block が必要か
1. `inline-block` は中身のサイズに合わせて縮む
2. `transform: scale()` が適用されると、視覚的にスケールされるが**レイアウトサイズは変わらない**
3. スクロールバーは `inline-block` の実際のサイズで判断される
4. スケール後のサイズを正しく認識させるには、コンテンツが**固定幅**を持つ必要がある

### WordPreview の構造的問題
**修正前**:
- `.word-preview`: `width: 100%` → 親（wrapper）の幅に合わせる
- `.content-container`: `max-width: 800px` → 最大800pxまで縮む
- **結果**: wrapper が縮んでコンテンツも縮む → スケール後のサイズが正しく計算されない

**Excel との違い**:
- Excel は内部のテーブル構造が固有の幅を持っている
- Word は柔軟なコンテナ構造で、親要素に依存していた

## 最終修正内容

### 修正1: `.word-preview` の幅設定を変更
**ファイル**: `src/lib/components/files/WordPreview.svelte` (Lines 196-213)

```css
/* 修正前 */
.word-preview {
  width: 100%;  /* 問題の原因 */
  border-radius: 0.375rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.word-preview.compact {
  background: transparent;
  border: none;
}

.word-preview:not(.compact) {
  min-height: 500px;
}

/* 修正後 */
.word-preview {
  border-radius: 0.375rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.word-preview.compact {
  width: 100%;  /* compact時のみ100% */
  background: transparent;
  border: none;
}

/* Non-compact mode: set natural width for proper scaling */
.word-preview:not(.compact) {
  width: fit-content;  /* 中身に合わせる */
  min-width: 800px;    /* 最小幅を保証 */
  min-height: 500px;   /* 最小高さを保証 */
}
```

### 修正2: `.content-container` を固定幅に変更
**ファイル**: `src/lib/components/files/WordPreview.svelte` (Lines 286-297)

```css
/* 修正前 */
.content-container {
  max-width: 800px;  /* 問題の原因 - 可変幅 */
  margin: 0 auto;
  ...
}

/* 修正後 */
.content-container {
  width: 800px;  /* 固定幅に変更 */
  margin: 0 auto;
  ...
  /* Fixed width ensures proper scaling with transform: scale() */
}
```

## 修正の仕組み

### スケールとスクロールの正しい動作
1. `.word-preview` が `width: fit-content` + `min-width: 800px`
2. `.content-container` が固定 `width: 800px`
3. → `.word-preview` のサイズは 800px（+ パディング/ボーダー）
4. → `.word-preview-wrapper` (`inline-block`) もそのサイズに合わせる
5. `transform: scale(2)` が適用される
6. → 視覚的に1600px相当になる
7. → wrapper の `overflow: auto` がスクロールバーを表示
8. → 正しくスクロール可能になる

### コンパクトモードとの互換性
- `compact` 時は `width: 100%` で親要素に合わせる（既存動作を維持）
- `!compact` 時は固定幅で inline-block wrapper と連携

## テスト結果
✅ ビルド成功（エラーなし、アクセシビリティ警告のみ）

## 動作確認ポイント
1. Lightbox で .docx ファイルを開く
2. 拡大（+）を複数回実行 → 2倍、3倍でも全体が見える
3. j/k キーで上下スクロール → 全コンテンツにアクセス可能
4. h/l キーで左右スクロール → 横幅が画面を超える場合にスクロール可能
5. スクロールバーが正しく表示される
6. 拡大時にコンテンツが切れない

## 関連ファイル
- `src/lib/components/files/WordPreview.svelte` - 修正済み
- `src/lib/components/files/Lightbox.svelte` - 変更なし

## 学んだこと（決定版）

### transform: scale() + display: inline-block のベストプラクティス
1. **inline-block 親要素**は中身のサイズに合わせて縮む
2. **固定幅のコンテンツ**が必要（`max-width` ではなく `width` を使う）
3. **fit-content + min-width** の組み合わせで柔軟性を保ちつつ固定幅を確保
4. スケール後のスクロールは**親要素の overflow: auto** で制御
5. コンパクトモードと非コンパクトモードで幅戦略を変える

### 症状から原因を特定する方法
- **スクロールバーが消える** → inline-block のサイズ計算が間違っている
- **一定倍率でコンテンツが切れる** → 固定幅がない、または max-width を使っている
- **H/L キーが効かない** → 横スクロールが発生していない（幅が足りない）

これらの症状は全て、**inline-block + transform: scale() + 可変幅コンテンツ**の組み合わせが原因。
