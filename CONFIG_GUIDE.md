# 絵文字リアクション設定ガイド

## 設定方法

絵文字リアクションの設定は、`public/config.json`ファイルで管理されます。

### 1. 設定ファイルの作成

```bash
# サンプルファイルをコピー
cp public/config.example.json public/config.json
```

### 2. 設定ファイルの編集

`public/config.json`を編集して、好きな絵文字を設定します：

```json
{
  "reactionMappings": [
    { 
      "shortcut": 1,           // 数字キー
      "emoji": "thumbsup",     // Slack絵文字名（:を除く）
      "display": "👍"          // 表示用の絵文字
    },
    { "shortcut": 2, "emoji": "arigataya", "display": "🙏" },
    { "shortcut": 3, "emoji": "smile", "display": "😄" }
    // ... 最大9まで設定可能
  ]
}
```

### 3. 設定の反映

- **開発環境**: 設定ファイルを保存すると、5秒ごとに自動的に再読み込みされます
- **本番環境**: アプリを再起動すると設定が反映されます

## Slack絵文字名の調べ方

1. Slackでメッセージにマウスオーバー
2. 絵文字リアクションボタン（😊）をクリック
3. 使いたい絵文字にマウスオーバー
4. 表示される `:emoji_name:` から `:` を除いた部分が絵文字名です

例：
- `:thumbsup:` → `"emoji": "thumbsup"`
- `:+1:` → `"emoji": "+1"`
- `:white_check_mark:` → `"emoji": "white_check_mark"`

## カスタム絵文字

Slackワークスペースのカスタム絵文字も使用できます：

```json
{
  "shortcut": 2, 
  "emoji": "arigataya",      // カスタム絵文字名
  "display": "🙏"             // 適当な代替表示
}
```

## トラブルシューティング

### 設定が反映されない場合

1. ブラウザのコンソール（F12）を開く
2. `[ConfigService]`のログを確認
3. `config.json`が正しいJSON形式か確認（[JSONLint](https://jsonlint.com/)でチェック）

### エラーが出る場合

- JSONの構文エラー（カンマ忘れ、引用符忘れなど）を確認
- 最後の要素の後ろにカンマがないか確認

## 設定例

### 日本語ワークスペース向け設定

```json
{
  "reactionMappings": [
    { "shortcut": 1, "emoji": "ok", "display": "👌" },
    { "shortcut": 2, "emoji": "arigatou", "display": "🙏" },
    { "shortcut": 3, "emoji": "otukare", "display": "💪" },
    { "shortcut": 4, "emoji": "iine", "display": "👍" },
    { "shortcut": 5, "emoji": "eyes", "display": "👀" },
    { "shortcut": 6, "emoji": "kanryou", "display": "✅" },
    { "shortcut": 7, "emoji": "onegai", "display": "🙇" },
    { "shortcut": 8, "emoji": "thinking_face", "display": "🤔" },
    { "shortcut": 9, "emoji": "sweat", "display": "😅" }
  ]
}
```

### 開発チーム向け設定

```json
{
  "reactionMappings": [
    { "shortcut": 1, "emoji": "shipit", "display": "🚢" },
    { "shortcut": 2, "emoji": "lgtm", "display": "✅" },
    { "shortcut": 3, "emoji": "bug", "display": "🐛" },
    { "shortcut": 4, "emoji": "fire", "display": "🔥" },
    { "shortcut": 5, "emoji": "eyes", "display": "👀" },
    { "shortcut": 6, "emoji": "rocket", "display": "🚀" },
    { "shortcut": 7, "emoji": "question", "display": "❓" },
    { "shortcut": 8, "emoji": "thinking_face", "display": "🤔" },
    { "shortcut": 9, "emoji": "x", "display": "❌" }
  ]
}
```