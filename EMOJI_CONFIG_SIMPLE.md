# 絵文字リアクション設定方法（シンプル版）

## 設定を変更する方法

絵文字の設定は `src/lib/services/reactionService.ts` ファイルの7-17行目を直接編集してください。

### 1. ファイルを開く
```
src/lib/services/reactionService.ts
```

### 2. DEFAULT_REACTION_MAPPINGS を編集

```typescript
// Default emoji mappings - EDIT THIS TO CUSTOMIZE YOUR EMOJIS
export const DEFAULT_REACTION_MAPPINGS: ReactionMapping[] = [
  { shortcut: 1, emoji: 'thumbsup', display: '👍' },
  { shortcut: 2, emoji: 'arigataya', display: '🙏' },
  { shortcut: 3, emoji: 'kakuninshimasu', display: '確認' },
  // ... ここを編集
];
```

### 3. 各フィールドの説明

- `shortcut`: 数字キー（1〜9）
- `emoji`: Slack絵文字名（`:thumbsup:` の `:` を除いた部分）
- `display`: アプリ内で表示される絵文字または文字

### 4. 例：2番目の絵文字を変更する

変更前：
```typescript
{ shortcut: 2, emoji: 'arigataya', display: '🙏' },
```

変更後：
```typescript
{ shortcut: 2, emoji: 'heart', display: '❤️' },
```

### 5. アプリを再起動

開発環境：
```bash
npm run tauri:dev
```

本番環境：
アプリを再起動するだけでOK

## よく使うSlack絵文字名

| 絵文字 | Slack名 | 表示 |
|--------|---------|------|
| 👍 | thumbsup または +1 | 👍 |
| ❤️ | heart | ❤️ |
| 😄 | smile | 😄 |
| 🎉 | tada | 🎉 |
| 👀 | eyes | 👀 |
| 🚀 | rocket | 🚀 |
| ✅ | white_check_mark | ✅ |
| 🤔 | thinking_face | 🤔 |
| 👎 | thumbsdown または -1 | 👎 |

## カスタム絵文字の場合

Slackワークスペースのカスタム絵文字も使えます：

```typescript
{ shortcut: 2, emoji: 'arigataya', display: '🙏' },
// arigataya はカスタム絵文字名
```

## トラブルシューティング

### 設定が反映されない場合
1. ファイルを保存したか確認
2. アプリを完全に再起動（開発環境の場合は `Ctrl+C` で停止してから再度 `npm run tauri:dev`）
3. ブラウザのキャッシュをクリア（開発環境の場合）

### エラーが出る場合
- カンマ忘れがないか確認
- 引用符（`'`）が正しく閉じているか確認
- `shortcut` の番号が重複していないか確認

## メリット

✅ **確実に動作** - 複雑な設定読み込みなし
✅ **シンプル** - 1ファイルを編集するだけ
✅ **デバッグ簡単** - 何が設定されているか一目瞭然
✅ **高速** - ファイル読み込みの遅延なし