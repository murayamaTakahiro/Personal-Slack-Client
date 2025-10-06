# Excel Preview 回帰問題の修正

## 発生した問題

前回の修正後、2つの回帰問題が発生：

1. **j/k キーでの上下スクロールができない**
2. **シート切り替え時に再展開されず、最初のシートの内容のみ表示される**

## 根本原因分析

### 問題1: j/k スクロールの問題
**原因**: `zoom` CSS プロパティから `transform: scale()` に変更したことで、スクロール対象が変わった
- `zoom`: 要素のレイアウトサイズも視覚サイズも変更される
- `transform: scale()`: 視覚的にスケールされるが、レイアウトサイズは元のまま

このため、内部の `.table-body-wrapper` をスクロールしようとしても、スケールされた要素内でオーバーフローが発生せず、スクロールできなくなった。

### 問題2: シート切り替えの問題
**原因**: `loadExcelContent()` 関数が常に最初のシート（`sheetNames[0]`）をロードしていた
- Line 142: `loadSheet(workbook.Sheets[sheetNames[0]]);`
- `currentSheetIndex` の値を無視していた

## 修正内容

### 修正1: スクロール対象の変更
**ファイル**: `src/lib/components/files/Lightbox.svelte`

Excel の場合、内部の `.table-body-wrapper` ではなく、外側の `.excel-preview-wrapper` をスクロールするように変更：

- `scrollUp()` - Line 261-266
- `scrollDown()` - Line 313-321
- `scrollPageUp()` - Line 478-482
- `scrollPageDown()` - Line 529-536
- `scrollToTop()` - Line 576-580
- `scrollToBottom()` - Line 617-621

**理由**: `transform: scale()` を使用している親要素をスクロールすることで、正しくスクロール可能になる。

**注意**: 水平スクロール（`scrollLeft()`/`scrollRight()`）は、ヘッダーと本体を同期する必要があるため、内部要素のまま維持。

### 修正2: 現在のシートインデックスを使用
**ファイル**: `src/lib/components/files/ExcelPreview.svelte` (Line 141-143)

```typescript
// 変更前
loadSheet(workbook.Sheets[sheetNames[0]]);

// 変更後
const sheetIndex = Math.min(currentSheetIndex, sheetNames.length - 1);
loadSheet(workbook.Sheets[sheetNames[sheetIndex]]);
```

**効果**: `switchSheet()` で設定された `currentSheetIndex` を使用して正しいシートをロードするようになった。

## テスト結果
✅ ビルド成功（エラーなし、アクセシビリティ警告のみ）

## 動作確認ポイント
1. Lightbox で Excel ファイルを開く
2. j/k キーで上下にスクロールできるか確認
3. Page Up/Down、Home/End も動作するか確認
4. 複数シートのある Excel ファイルで：
   - タブクリックでシート切り替え → 正しい内容が表示されるか
   - Ctrl+Tab/Ctrl+Shift+Tab でシート移動 → 正しい内容が表示されるか
5. h/l キーで左右にスクロールできるか確認（ヘッダーと同期しているか）

## 関連ファイル
- `src/lib/components/files/ExcelPreview.svelte`
- `src/lib/components/files/Lightbox.svelte`

## 学んだこと
- `zoom` と `transform: scale()` は見た目は似ているが、レイアウト動作が大きく異なる
- `transform: scale()` を使う場合、スクロール可能な要素の選択に注意が必要
- 特に、スケールされた要素の**親要素**をスクロール対象にする必要がある
