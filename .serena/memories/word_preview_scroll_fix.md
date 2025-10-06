# Word Preview Scroll 問題修正

## 発生した問題

Word プレビュー（.docx）をLightboxで拡大表示したときに2つの問題が発生：

1. **拡大表示時に表示されなくなる範囲がある**
2. **H/L キーでの左右スクロールができない**

## 根本原因分析

### 問題の原因
Excelと同じ問題パターン。`transform: scale()` を使用している場合の典型的な症状。

**WordPreview.svelte の問題点**:
1. `.content-container` に `overflow-x: auto` しか設定されていなかった
2. 縦方向の高さ制限や overflow 設定がなかった
3. コンテンツが長い場合、`.word-preview-wrapper` の外に溢れ出してしまう
4. `.word-preview` 自体に高さ制限がなかった

**Lightbox での transform: scale() の影響**:
- Lightbox は `.word-preview-wrapper` に `transform: scale()` を適用
- スケールされた要素の内部スクロールは正しく動作しない
- **親要素（`.word-preview-wrapper`）をスクロールする必要がある**

### Excel との違い
- **Excel**: 内部に `.table-body-wrapper` があり、それ自体がスクロール可能な構造
- **Word**: 内部の `.content-container` には縦スクロール設定がなく、コンテンツが自由に拡大

## 修正内容

### 修正1: `.word-preview` に最小高さを設定
**ファイル**: `src/lib/components/files/WordPreview.svelte` (Lines 208-211)

```css
/* Non-compact mode: set reasonable min-height to ensure scrollability */
.word-preview:not(.compact) {
  min-height: 500px;
}
```

**効果**: Lightbox 表示時（非compactモード）に、十分な高さを確保して `.word-preview-wrapper` がスクロール可能になる。

### 修正2: `.content-container` のoverflow設定を削除
**ファイル**: `src/lib/components/files/WordPreview.svelte` (Lines 284-295)

```css
/* 変更前 */
.content-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-family: 'Calibri', 'Arial', sans-serif;
  line-height: 1.6;
  color: #000;
  overflow-x: auto;  /* この設定が問題 */
}

/* 変更後 */
.content-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  font-family: 'Calibri', 'Arial', sans-serif;
  line-height: 1.6;
  color: #000;
  /* Content should expand naturally, wrapper will handle scrolling */
}
```

**効果**: コンテンツは自然に拡大し、外側の `.word-preview-wrapper` がスクロールを担当する。

## Lightbox のスクロール実装（既に正しい）

Lightbox.svelte では、すでに Word プレビュー用の正しいスクロール実装がある：

- `scrollUp()` - Line 270-275: `.word-preview-wrapper` をスクロール ✅
- `scrollDown()` - Line 331-339: `.word-preview-wrapper` をスクロール ✅
- `scrollLeft()` - Line 393-398: `.word-preview-wrapper` をスクロール ✅
- `scrollRight()` - Line 464-472: `.word-preview-wrapper` をスクロール ✅
- `scrollPageUp()` - Line 516-520: `.word-preview-wrapper` をスクロール ✅
- `scrollPageDown()` - Line 575-582: `.word-preview-wrapper` をスクロール ✅
- `scrollToTop()` - Line 627-631: `.word-preview-wrapper` をスクロール ✅
- `scrollToBottom()` - Line 673-677: `.word-preview-wrapper` をスクロール ✅

## テスト結果
✅ ビルド成功（エラーなし、アクセシビリティ警告のみ）

## 動作確認ポイント
1. Lightbox で .docx ファイルを開く
2. j/k キーで上下にスクロールできるか確認
3. h/l キーで左右にスクロールできるか確認
4. Page Up/Down、Home/End も動作するか確認
5. 拡大（+/-）しても全コンテンツが表示されるか確認
6. スクロール時に表示範囲が失われないか確認

## 関連ファイル
- `src/lib/components/files/WordPreview.svelte` - 修正済み
- `src/lib/components/files/Lightbox.svelte` - 変更なし（スクロールロジックは既に正しい）

## 参考事例
- Excel の同様の問題と修正 → `excel_regression_fixes` メモリ参照
- `transform: scale()` 使用時は親要素をスクロールする必要がある

## 学んだこと
- `transform: scale()` を使う場合、**スケールされた要素の親要素**をスクロール対象にする
- 内部要素に overflow を設定しても、scale の影響で期待通りに動作しない
- コンテンツは自然に拡大させ、外側のラッパーでスクロールを制御する
