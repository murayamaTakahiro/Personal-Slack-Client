# Excel Preview 修正完了

## 修正内容

### 1. Lightbox でヘッダーが表示されない問題を修正
**原因**: `.excel-preview-wrapper` に `zoom` CSS プロパティを使用していたため、sticky positioning が正しく動作しなかった

**修正内容**:
- `zoom: {zoomLevel}` を `transform: scale({zoomLevel}); transform-origin: top left;` に変更
- Office プレビューと同じアプローチを採用

**変更ファイル**: `src/lib/components/files/Lightbox.svelte` (Line 1124)

### 2. シート移動ショートカットキーを実装
**実装内容**:
- `Ctrl+Tab`: 次のシートに移動
- `Ctrl+Shift+Tab`: 前のシートに移動

**変更ファイル**:
1. `src/lib/components/files/ExcelPreview.svelte`:
   - `export function nextSheet()` を追加 (Line 211-215)
   - `export function previousSheet()` を追加 (Line 217-221)

2. `src/lib/components/files/Lightbox.svelte`:
   - `excelPreviewRef` 変数を追加 (Line 49)
   - ExcelPreview コンポーネントに `bind:this={excelPreviewRef}` を追加 (Line 1126)
   - `handleKeydown` 関数の Tab キー処理を更新 (Line 136-153):
     - Ctrl+Tab が押された場合、Excel プレビュー用のシート移動を優先
     - それ以外は既存のファイル移動ロジックを維持

## テスト方法
1. Excel ファイルを含む Slack メッセージを開く
2. Excel ファイルをクリックして Lightbox で開く
3. ヘッダー行が正しく表示されているか確認
4. 複数シートのある Excel ファイルで:
   - `Ctrl+Tab` で次のシートに移動できるか確認
   - `Ctrl+Shift+Tab` で前のシートに移動できるか確認
5. キーボードナビゲーション（j/k, h/l, Page Up/Down等）が正常に動作するか確認

## ビルド結果
✅ ビルド成功（アクセシビリティ警告のみ、エラーなし）

## 次のアクション
実際の Excel ファイルで動作確認を実施
