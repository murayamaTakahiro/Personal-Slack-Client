# Word ファイルプレビュー - 正確な現状

## 📌 重要な訂正

前回の引き継ぎ書に **誤りがありました**:
- ❌ 誤: ".docファイルはOfficePreviewでサムネイル表示可能"
- ✅ 正: ".docファイルは **Slackからサムネイルが提供されている場合のみ** 表示可能"

## 現在の実装状態

### ファイルタイプ別ルーティング（完全に正常動作）

#### .docx ファイル
- **コンポーネント**: WordPreview.svelte
- **方式**: Mammoth.js による HTML 変換
- **表示**: 完全なプレビュー（フォーマット付き）
- **制約**: Mammoth.js が対応するのは .docx のみ

#### .doc ファイル  
- **コンポーネント**: OfficePreview.svelte
- **方式**: Slack API が提供するサムネイル画像を表示
- **表示**: 
  - ✅ Slack がサムネイルを提供している場合 → 画像表示
  - ❌ Slack がサムネイルを提供していない場合 → 汎用アイコン表示
- **制約**: **Slack API 依存** - ローカルでプレビュー生成できない

### OfficePreview.svelte の動作詳細

**サムネイル取得ロジック** (src/lib/components/files/OfficePreview.svelte:31-41):
```javascript
onMount(() => {
  // Slack API からサムネイルを取得試行
  thumbnailUrl = getBestThumbnailUrl(file, 360);
  
  // フォールバック: thumb_360 または thumb_480
  if (!thumbnailUrl && file.thumb_360) {
    thumbnailUrl = file.thumb_360;
  } else if (!thumbnailUrl && file.thumb_480) {
    thumbnailUrl = file.thumb_480;
  }
});
```

**表示ロジック** (src/lib/components/files/OfficePreview.svelte:93-109):
```svelte
{#if thumbnailUrl && !thumbnailError}
  <!-- サムネイル画像を表示 -->
  <img src={thumbnailUrl} alt={fileName} class="thumbnail" />
{:else}
  <!-- 汎用ドキュメントアイコンを表示 -->
  <div class="file-icon">
    <span class="icon-emoji">{fileIcon}</span>
    <span class="file-ext">{fileExtension}</span>
  </div>
{/if}
```

### Lightbox.svelte のルーティングロジック

**ファイルタイプ判定** (src/lib/components/files/Lightbox.svelte:60-61):
```javascript
// .docx のみ Mammoth.js でプレビュー
$: isWord = file.type === 'word' && 
  (file.file.name?.toLowerCase().endsWith('.docx') || 
   file.file.mimetype?.includes('openxmlformats'));

// .doc と PowerPoint は OfficePreview へ
$: isOffice = file.type === 'powerpoint' || 
  (file.type === 'word' && !isWord);
```

## スクリーンショットで確認された事実

添付画像 (20251004194224_Aqua_Voice.png) が示すこと:
- 2つの .doc ファイルが表示されている
- 両方とも **汎用アイコン + "Full preview not available"** メッセージ
- これは **正常な動作** - Slack API がこれらのファイルのサムネイルを提供していない

## 技術的制約

### なぜ .doc ファイルはローカルプレビューできないのか

1. **Mammoth.js の制約**
   - .docx (Office Open XML) 形式のみ対応
   - .doc (バイナリ形式) は非対応

2. **代替ライブラリの問題**
   - .doc 変換には LibreOffice や専用パーサーが必要
   - Tauri デスクトップアプリで重すぎる
   - 依存関係が複雑

3. **現実的な対応**
   - Slack API のサムネイルに依存するのが最善
   - ユーザーはダウンロードして Office で開く必要がある

## 解決済み問題

### ✅ 問題1: ArrayBuffer エラー（解決済み）
- **症状**: "Could not find the body element"
- **原因**: ArrayBuffer の扱いが不適切
- **修正**: `uint8Array.buffer` を正しく渡すように修正

### ✅ 問題2: .doc/.docx の分離（解決済み）
- **実装**: .docx → WordPreview、.doc → OfficePreview
- **結果**: 正常に動作中

## 未解決問題

### ❓ 問題3: 非表示コンテンツの表示（WordPreview 固有）
- **対象**: .docx ファイルのみ（Mammoth.js 使用時）
- **症状**: 「申請書と同じ日付を記入してください。」等が表示される
- **現状**: styleMap が効いていない
- **次のステップ**:
  1. Mammoth.js の変換メッセージ確認
  2. Word 文書の XML 構造解析
  3. transformDocument による カスタムフィルタリング

## 今後の対応方針

### .doc ファイルについて
**現状維持を推奨** - これは仕様であり、バグではない
- Slack がサムネイルを提供 → 表示
- Slack がサムネイルを提供しない → アイコン + ダウンロードボタン

### .docx ファイルについて
**非表示コンテンツ問題に注力**
- Mammoth.js のデバッグ継続
- カスタム変換ロジックの実装検討

## 参考情報

### 関連ファイル
- `src/lib/components/files/WordPreview.svelte` - .docx プレビュー
- `src/lib/components/files/OfficePreview.svelte` - .doc/.ppt プレビュー
- `src/lib/components/files/Lightbox.svelte` - ルーティング
- `src/lib/components/files/FileAttachments.svelte` - 添付ファイル表示

### Slack API の制約
- **サムネイル提供**: Slack が自動生成（すべてのファイルではない）
- **取得方法**: `thumb_360`, `thumb_480`, `thumb_720` 等
- **制御不可**: クライアント側で生成できない
