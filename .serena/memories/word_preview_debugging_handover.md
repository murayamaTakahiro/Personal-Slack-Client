# Word プレビュー機能デバッグ - 引き継ぎ書

## 🚨 現状の問題

### 問題1: 非表示コンテンツが表示される（未解決）
- **症状**: 「申請書と同じ日付を記入してください。」「印鑑登録された実印を押印してください。」等、Wordで開いたときには表示されない文言が表示される
- **実施した対策**: Mammoth.js の `styleMap` オプションで非表示コンテンツをフィルタリング
- **結果**: **変化なし** - 対策が効いていない

### 問題2: .doc ファイルのプレビュー（部分的に解決）
- **現状**: OfficePreview.svelte で Slack サムネイル表示に対応済み
- **制約**: Mammoth.js は .docx のみ対応、.doc は非対応

## 📋 実施した変更内容

### 1. WordPreview.svelte の修正
**ファイル**: `src/lib/components/files/WordPreview.svelte`

**変更箇所**: Line 59-76
```javascript
// Convert to HTML using Mammoth with options to filter hidden content
const result = await mammoth.convertToHtml({
  arrayBuffer: arrayBuffer
}, {
  // Ignore empty paragraphs (default: true)
  ignoreEmptyParagraphs: true,
  // Custom style map to ignore common hidden content patterns
  styleMap: [
    // Ignore comment references (Word comments/annotations)
    "comment-reference => !",
    // Ignore common placeholder/instruction styles
    "p[style-name='Comment'] => !",
    "p[style-name='Balloon Text'] => !",
    "p[style-name='Instruction'] => !",
    "p[style-name='Placeholder'] => !",
    "p[style-name='Form Field Help Text'] => !"
  ]
});
```

**意図**: フォームフィールドのヘルプテキストやコメントを非表示にする

**結果**: **効果なし** - 依然として非表示コンテンツが表示される

### 2. ArrayBuffer 修正（完了）
**ファイル**: `src/lib/components/files/WordPreview.svelte`

**変更前**:
```javascript
const arrayBuffer = await invoke<number[]>('download_file_binary', {...});
const uint8Array = new Uint8Array(arrayBuffer);
const result = await mammoth.convertToHtml({
  arrayBuffer: uint8Array.buffer  // ❌
});
```

**変更後**:
```javascript
const numberArray = await invoke<number[]>('download_file_binary', {...});
const uint8Array = new Uint8Array(numberArray);
const arrayBuffer = uint8Array.buffer;
const result = await mammoth.convertToHtml({
  arrayBuffer: arrayBuffer  // ✅
});
```

**結果**: ✅ "Could not find the body element" エラーは解決

### 3. .doc/.docx ファイルの分離（完了）
**ファイル**: `src/lib/components/files/Lightbox.svelte` (Line 60-61)

```javascript
$: isWord = file.type === 'word' && 
  (file.file.name?.toLowerCase().endsWith('.docx') || 
   file.file.mimetype?.includes('openxmlformats'));
$: isOffice = file.type === 'powerpoint' || 
  (file.type === 'word' && !isWord);
```

**ファイル**: `src/lib/components/files/FileAttachments.svelte` (Line 216-235)

```svelte
{:else if group.type === 'word'}
  {#if metadata.file.name?.toLowerCase().endsWith('.docx') || 
       metadata.file.mimetype?.includes('openxmlformats')}
    <WordPreview file={metadata.file} {workspaceId} {compact} />
  {:else}
    <OfficePreview file={metadata.file} {workspaceId} {compact} />
  {/if}
{:else if group.type === 'powerpoint'}
  <OfficePreview file={metadata.file} {workspaceId} {compact} />
{/if}
```

**結果**: ✅ .docx は WordPreview、.doc は OfficePreview に振り分け成功

## 🔍 デバッグの次のステップ

### 優先度1: 非表示コンテンツの原因特定

#### 仮説1: スタイル名が一致していない
- Mammoth.js の `styleMap` で指定したスタイル名が、実際のWord文書のスタイル名と一致していない可能性
- **検証方法**:
  1. Mammoth.js の変換メッセージ（`result.messages`）をコンソールに出力
  2. 実際のスタイル名を確認
  3. 正しいスタイル名で `styleMap` を更新

**デバッグコード例**:
```javascript
const result = await mammoth.convertToHtml({...}, {...});

// すべてのメッセージを詳細にログ出力
console.log('[WordPreview] Conversion messages:', JSON.stringify(result.messages, null, 2));

// 変換された HTML を確認
console.log('[WordPreview] HTML output:', result.value);
```

#### 仮説2: フォームフィールドの構造が異なる
- 非表示コンテンツがフォームフィールドのヘルプテキストではなく、別の構造（例: SDT - Structured Document Tags）の可能性
- **検証方法**:
  1. Word 文書を XML として開く（.docx を .zip に変更して解凍）
  2. `document.xml` を確認し、問題のテキストがどの要素に含まれているか特定

#### 仮説3: Mammoth.js の変換ロジックの制約
- Mammoth.js が特定の要素（SDT、フォームフィールド等）を標準テキストとして抽出している
- **対策**:
  1. `transformDocument` オプションを使用してカスタム変換ロジックを実装
  2. または、変換後の HTML から不要なコンテンツを正規表現で削除

**transformDocument 例**:
```javascript
const result = await mammoth.convertToHtml({
  arrayBuffer: arrayBuffer
}, {
  transformDocument: mammoth.transforms.paragraph(element => {
    // 特定の条件でパラグラフを除外
    if (element.styleId === 'FormFieldHelpText' || 
        element.text?.includes('記入してください')) {
      return null; // 除外
    }
    return element;
  }),
  styleMap: [...]
});
```

### 優先度2: 実際のファイル構造を調査

#### 手順:
1. 問題の .docx ファイルを取得
2. `.docx` を `.zip` にリネームして解凍
3. `word/document.xml` を開く
4. 「申請書と同じ日付を記入してください。」等のテキストを検索
5. 該当テキストがどの XML 要素に含まれているか確認

**よくあるパターン**:
- `<w:instrText>` - フィールドコード
- `<w:sdt>` - Structured Document Tag（コンテンツコントロール）
- `<w:fldChar>` - フィールド文字
- `<w:hint>` - ヒントテキスト

### 優先度3: 代替アプローチの検討

#### オプション1: HTML後処理でフィルタリング
```javascript
const result = await mammoth.convertToHtml({...}, {...});

// 不要なパターンを正規表現で削除
let cleanedHtml = result.value;
cleanedHtml = cleanedHtml.replace(/申請書と同じ日付を記入してください。/g, '');
cleanedHtml = cleanedHtml.replace(/印鑑登録された実印を押印してください。/g, '');
// または、より汎用的なパターン
cleanedHtml = cleanedHtml.replace(/[^>]*してください。[^<]*/g, '');

htmlContent = DOMPurify.sanitize(cleanedHtml, {...});
```

#### オプション2: extractRawText を試す
```javascript
// HTML 変換の代わりにプレーンテキスト抽出
const result = await mammoth.extractRawText({
  arrayBuffer: arrayBuffer
});
// フォーマットは失われるが、不要なコンテンツも除外される可能性
```

## 🧪 テスト手順

1. **ビルド**:
   ```bash
   npm run build
   ```

2. **起動**:
   ```bash
   npm run tauri:dev
   ```

3. **確認**:
   - ブラウザの開発者ツールを開く
   - Console タブで `[WordPreview]` のログを確認
   - 問題の .docx ファイルを開く
   - 非表示コンテンツが表示されるか確認

## 📝 関連ファイル

### 修正済みファイル
- ✅ `src/lib/components/files/WordPreview.svelte` - Mammoth.js オプション追加
- ✅ `src/lib/components/files/Lightbox.svelte` - .doc/.docx 分離
- ✅ `src/lib/components/files/FileAttachments.svelte` - WordPreview 統合

### 参考ファイル
- `src/lib/components/files/ExcelPreview.svelte` - 類似実装パターン
- `src/lib/components/files/OfficePreview.svelte` - .doc ファイル対応
- `src/lib/types/slack.ts` - SlackFile 型定義

## 🔗 参考リソース

### Mammoth.js ドキュメント
- **Style Mapping**: https://github.com/mwilliamson/mammoth.js#writing-style-maps
- **Transform Document**: https://github.com/mwilliamson/mammoth.js#document-transforms
- **API Reference**: https://github.com/mwilliamson/mammoth.js#api

### 重要な Mammoth.js オプション
```javascript
{
  // スタイルマッピング（要素を無視: => !）
  styleMap: [
    "p[style-name='IgnoreThis'] => !",
    "comment-reference => !"
  ],
  
  // デフォルトスタイルマップを含めない
  includeDefaultStyleMap: false,
  
  // 埋め込みスタイルマップを含めない
  includeEmbeddedStyleMap: false,
  
  // 空の段落を無視
  ignoreEmptyParagraphs: true,
  
  // カスタム変換
  transformDocument: customTransformFunction
}
```

## ⚠️ 既知の課題

1. **styleMap が効いていない**
   - 原因不明、スタイル名が一致していない可能性が高い
   - 実際のスタイル名の確認が必要

2. **フォームフィールドの扱い**
   - Mammoth.js がフォームフィールドをどう処理しているか不明
   - ドキュメント構造の詳細調査が必要

3. **.doc ファイルの制約**
   - Mammoth.js は .docx のみ対応
   - .doc は変換不可（サムネイル表示のみ）

## 🎯 次セッションでの推奨アクション

1. **デバッグログの追加**
   ```javascript
   console.log('[WordPreview] result.messages:', result.messages);
   console.log('[WordPreview] HTML sample:', result.value.substring(0, 500));
   ```

2. **実際のファイル構造を調査**
   - .docx を解凍して XML を確認
   - 非表示コンテンツがどの要素に含まれているか特定

3. **transformDocument の実装**
   - カスタムロジックで不要な要素を除外

4. **HTML後処理の実装**
   - 正規表現で不要なテキストを削除

5. **ユーザーに確認**
   - 非表示コンテンツの具体的なパターンを教えてもらう
   - サンプルファイルを提供してもらう

## 💡 成功の鍵

- **実際のWord文書の構造を理解する** - XML解析が最も確実
- **Mammoth.js のログを詳細に確認** - `result.messages` に重要な情報がある可能性
- **段階的にアプローチを試す** - styleMap → transformDocument → HTML後処理
