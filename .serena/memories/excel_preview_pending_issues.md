# Excel Preview 機能の残課題

## 実装状況
Excel プレビュー機能は基本的に実装完了し、コミット済み（9b72042）。
- SheetJS（xlsx）を使用した Excel ファイル解析
- メッセージリストでのプレビュー表示
- Lightbox での全画面プレビュー表示
- 複数シートのタブ表示
- キーボードナビゲーション（j/k, h/l, Page Up/Down等）

## 残っている課題

### 1. Lightbox でヘッダーが表示されていない問題
**症状**: イメージプレビュー（Lightbox）で展開したときにテーブルのヘッダー行が表示されていない

**影響範囲**: `src/lib/components/files/Lightbox.svelte`

**推測される原因**:
- ExcelPreview コンポーネント内のヘッダー表示ロジックに問題がある可能性
- Lightbox の zoom スタイルがヘッダーの表示に影響している可能性
- CSS の問題（ヘッダーが隠れている、position 指定の問題等）

**確認すべきファイル**:
- `src/lib/components/files/ExcelPreview.svelte` - ヘッダーのレンダリングロジック
- `src/lib/components/files/Lightbox.svelte` - Excel プレビューのラッパースタイル

**修正方針**:
1. ExcelPreview コンポーネントのヘッダーテーブル（`.table-header`）が正しくレンダリングされているか確認
2. Lightbox での表示時に固定ヘッダーが適切に表示されるよう CSS を調整
3. `compact` プロパティの影響を確認（Lightbox では `compact={false}` を渡している）

### 2. シート移動のショートカットキーが未実装
**症状**: 複数のシートタブは表示・クリック可能だが、キーボードショートカットでシート間を移動できない

**期待される動作**: 
- `Ctrl+Tab`: 次のシートに移動
- `Ctrl+Shift+Tab`: 前のシートに移動

**影響範囲**: 
- `src/lib/components/files/ExcelPreview.svelte` - シート切り替えロジック
- `src/lib/components/files/Lightbox.svelte` - キーボードイベントハンドリング

**実装方針**:
1. **ExcelPreview コンポーネント側**:
   - シート切り替え関数（`nextSheet()`, `previousSheet()`）を追加
   - これらの関数を外部から呼び出せるようにエクスポート（`export function` または親から渡す ref 経由）
   
2. **Lightbox コンポーネント側**:
   - 既存の `handleKeyDown` 関数内に Ctrl+Tab/Ctrl+Shift+Tab のハンドリングを追加
   - `isExcel` の場合のみ、ExcelPreview のシート切り替え関数を呼び出す
   - 実装例:
     ```typescript
     function handleKeyDown(event: KeyboardEvent) {
       if (event.ctrlKey && event.key === 'Tab') {
         event.preventDefault();
         if (isExcel) {
           if (event.shiftKey) {
             // 前のシートへ移動
             excelPreviewRef?.previousSheet();
           } else {
             // 次のシートへ移動
             excelPreviewRef?.nextSheet();
           }
         }
       }
       // ... 既存のハンドリング
     }
     ```

3. **ExcelPreview コンポーネントの修正**:
   ```typescript
   export function nextSheet() {
     if (currentSheetIndex < sheetNames.length - 1) {
       switchSheet(currentSheetIndex + 1);
     }
   }
   
   export function previousSheet() {
     if (currentSheetIndex > 0) {
       switchSheet(currentSheetIndex - 1);
     }
   }
   ```

4. **Lightbox から ExcelPreview への参照**:
   ```svelte
   <script>
     let excelPreviewRef: any;
   </script>
   
   {:else if isExcel}
     <div class="excel-preview-wrapper" style="zoom: {zoomLevel};">
       <ExcelPreview
         bind:this={excelPreviewRef}
         file={file.file}
         workspaceId={$activeWorkspace?.id || 'default'}
         compact={false}
       />
     </div>
   ```

## 関連ファイル
- `src/lib/components/files/ExcelPreview.svelte` - Excel プレビューコンポーネント本体
- `src/lib/components/files/Lightbox.svelte` - 全画面プレビューコンポーネント
- `src/lib/components/files/FileAttachments.svelte` - ファイル添付表示（メッセージリスト）

## 参考情報
- 現在の Excel プレビュー実装では、スクロール機能のキーボードショートカットは完全に実装済み
- Lightbox の `handleKeyDown` 関数では、j/k/h/l/Page Up/Down/Home/End が既に実装されている
- CSV プレビューも同様の固定ヘッダー構造を使用しているため、参考になる可能性がある

## 次のアクション
1. Lightbox でのヘッダー表示問題をデバッグ・修正
2. シート移動ショートカットキーを実装
3. 動作確認後、コミット

## テスト方法
1. Excel ファイルを含む Slack メッセージを開く
2. Excel ファイルをクリックして Lightbox で開く
3. ヘッダー行が表示されているか確認
4. 複数シートのある Excel ファイルで Ctrl+Tab/Ctrl+Shift+Tab を試す
5. キーボードナビゲーション（スクロール）が正常に動作するか確認
