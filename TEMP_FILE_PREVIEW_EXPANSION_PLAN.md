# ファイルプレビュー機能拡張 - 実装計画書

**作成日**: 2025-10-02
**ステータス**: 計画中
**注意**: この計画書は開発完了後に削除してください（ファイル名: `TEMP_FILE_PREVIEW_EXPANSION_PLAN.md`）

## 📋 概要

Slack クライアントのファイルプレビュー機能を拡張し、現在の画像・PDF以外のファイルタイプ（txt、csv、tsv、xls*、doc*）もプレビュー可能にする。

## 🎯 目標

### 主要目標
- テキストファイル（txt）のインライン表示
- CSV/TSVファイルのテーブル形式表示
- Microsoft Office ファイル（xlsx、docx）の簡易プレビュー
- 旧形式 Office ファイル（xls、doc）の基本対応

### 制約条件
- **既存機能への影響は厳禁**
- パフォーマンスの維持
- セキュリティの確保

## 📊 現状分析

### 現在サポートされているファイルタイプ
| ファイルタイプ | コンポーネント | 機能 |
|--------------|-------------|-----|
| 画像 (jpg, png, gif等) | `ImagePreview.svelte` | フル機能プレビュー、Lightbox対応 |
| PDF | `PdfPreview.svelte`, `PdfRenderer.svelte` | pdfjs-distによる表示、ページ送り対応 |
| その他 | `GenericFilePreview.svelte` | ダウンロードリンクのみ |

### ファイル処理フロー
1. `FileAttachments.svelte` - メインコンテナ
2. `fileService.ts` - ファイルタイプ判定とメタデータ処理
3. `api/files.ts` - バックエンドとの通信
4. 各プレビューコンポーネント - 実際の表示

## 🏗️ アーキテクチャ設計

### 新規コンポーネント構成

```
src/lib/components/files/
├── existing/
│   ├── ImagePreview.svelte      (変更なし)
│   ├── PdfPreview.svelte        (変更なし)
│   └── GenericFilePreview.svelte (変更なし)
├── new/
│   ├── TextPreview.svelte       (新規)
│   ├── CsvPreview.svelte        (新規)
│   └── OfficePreview.svelte     (新規)
└── FileAttachments.svelte       (最小限の変更)
```

### ファイルタイプ判定の拡張

```typescript
// fileService.ts に追加される新しいタイプ
export type FileType =
  | 'image'
  | 'pdf'
  | 'text'      // 新規: txt, log, md
  | 'csv'       // 新規: csv, tsv
  | 'excel'     // 新規: xlsx, xls
  | 'word'      // 新規: docx, doc
  | 'video'
  | 'audio'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'archive'
  | 'unknown';
```

## 📝 実装詳細

### Phase 1: テキストファイル対応（優先度: 高）

#### 1.1 TextPreview.svelte
```svelte
機能:
- プレーンテキストの表示
- シンタックスハイライト（オプション）
- 文字エンコーディング自動検出
- 大きなファイルの部分表示（最初の1000行）

制限:
- 最大ファイルサイズ: 1MB
- 表示行数: 1000行まで
```

#### 1.2 必要なバックエンド対応
```rust
// src-tauri/src/commands/files.rs
#[tauri::command]
pub async fn get_file_content(
    url: String,
    max_size: usize,
    encoding: Option<String>
) -> Result<FileContent>
```

### Phase 2: CSV/TSV対応（優先度: 高）

#### 2.1 CsvPreview.svelte
```svelte
機能:
- テーブル形式での表示
- ヘッダー行の自動検出
- ソート機能（オプション）
- 大きなファイルのページネーション

使用ライブラリ:
- papaparse (CSVパース)
```

### Phase 3: Office ファイル対応（優先度: 中）

#### 3.1 OfficePreview.svelte
```svelte
機能:
- Slack提供のサムネイル表示（第一選択）
- 簡易テキスト抽出（フォールバック）
- ダウンロードリンク

対応形式:
- xlsx, xls (Excel)
- docx, doc (Word)
- pptx, ppt (PowerPoint) - サムネイルのみ
```

#### 3.2 必要なライブラリ（オプション）
- sheetjs/xlsx - Excel ファイル読み込み
- mammoth - Word ドキュメント変換

## 🔒 セキュリティ対策

### XSS 防止
- すべてのテキストコンテンツをエスケープ
- HTMLレンダリングの禁止
- CSVデータのサニタイゼーション

### ファイルサイズ制限
| ファイルタイプ | プレビュー上限 | アクション |
|-------------|--------------|-----------|
| テキスト | 1MB | 部分表示 + ダウンロードリンク |
| CSV/TSV | 5MB | ページネーション表示 |
| Office | 10MB | サムネイル + ダウンロードリンク |

### エラーハンドリング
- ファイル読み込み失敗 → GenericFilePreview にフォールバック
- エンコーディングエラー → UTF-8 で再試行
- パースエラー → エラーメッセージ表示

## ⚡ パフォーマンス最適化

### 遅延読み込み
- ファイルコンテンツは表示時のみ取得
- Lightbox 開いた時に初めてフル読み込み

### キャッシング戦略
- Tauri バックエンドでファイルキャッシュ
- フロントエンドで処理済みデータキャッシュ
- LRU キャッシュで メモリ使用量制限

### Virtual Scrolling
- 大きなCSVファイル用
- 大きなテキストファイル用

## 🧪 テスト計画

### 単体テスト
- [ ] ファイルタイプ判定ロジック
- [ ] 各プレビューコンポーネント
- [ ] エンコーディング検出
- [ ] CSVパース処理

### 統合テスト
- [ ] FileAttachments → 各プレビューコンポーネント
- [ ] Lightbox での新ファイルタイプ表示
- [ ] ファイルダウンロード機能
- [ ] エラー時のフォールバック

### パフォーマンステスト
- [ ] 1MB テキストファイル
- [ ] 10,000行 CSV ファイル
- [ ] 複数ファイル同時表示

### 回帰テスト
- [ ] 既存の画像プレビュー
- [ ] 既存のPDFプレビュー
- [ ] ダウンロード機能

## 📅 実装スケジュール

### Week 1: 基盤整備
- [x] 計画書作成
- [ ] ファイルタイプ判定の拡張
- [ ] バックエンドAPIの設計

### Week 2: テキストファイル対応
- [ ] TextPreview.svelte 実装
- [ ] バックエンド get_file_content 実装
- [ ] FileAttachments.svelte 統合

### Week 3: CSV/TSV対応
- [ ] CsvPreview.svelte 実装
- [ ] papaparse 統合
- [ ] テーブル表示とページネーション

### Week 4: Office ファイル対応
- [ ] OfficePreview.svelte 実装
- [ ] サムネイル表示
- [ ] フォールバック処理

### Week 5: 最終調整
- [ ] パフォーマンス最適化
- [ ] エラーハンドリング強化
- [ ] ドキュメント更新

## 🚦 リスク管理

### 技術的リスク
| リスク | 影響度 | 対策 |
|-------|-------|-----|
| 大きなファイルでのメモリ不足 | 高 | ストリーミング処理、部分読み込み |
| 文字エンコーディング問題 | 中 | chardet ライブラリ使用、UTF-8 フォールバック |
| Office ファイルの複雑な形式 | 低 | サムネイルのみ表示にフォールバック |

### 実装リスク
| リスク | 影響度 | 対策 |
|-------|-------|-----|
| 既存機能への影響 | 高 | Feature Flag 使用、段階的リリース |
| パフォーマンス劣化 | 中 | プロファイリング、最適化 |
| セキュリティ脆弱性 | 高 | セキュリティレビュー、サニタイゼーション |

## 🔄 ロールバック計画

1. **Feature Flag による制御**
   ```typescript
   // settings.ts
   export const FILE_PREVIEW_EXTENDED = writable(false);
   ```

2. **段階的有効化**
   - Stage 1: 開発環境のみ
   - Stage 2: ベータユーザー
   - Stage 3: 全ユーザー

3. **即座の無効化**
   - 問題発生時は Feature Flag を false に
   - GenericFilePreview へのフォールバック

## ✅ 完了条件

### 機能要件
- [ ] txt ファイルがインラインで表示される
- [ ] csv/tsv ファイルがテーブル表示される
- [ ] xlsx/docx ファイルがプレビュー可能
- [ ] xls/doc ファイルが少なくともダウンロード可能

### 非機能要件
- [ ] 既存機能が正常動作
- [ ] パフォーマンス劣化なし
- [ ] セキュリティ脆弱性なし
- [ ] エラー時の適切なフォールバック

### ドキュメント
- [ ] README.md 更新
- [ ] CHANGELOG.md 更新
- [ ] この計画書の削除

## 📌 メモ・注意事項

- Slack API の制限に注意（レート制限、ファイルサイズ）
- ユーザーのプライバシーを考慮（ファイル内容のログ出力禁止）
- アクセシビリティ対応（スクリーンリーダー対応）
- ダークモード/ライトモード両対応

---

**このドキュメントは開発完了後に削除してください**