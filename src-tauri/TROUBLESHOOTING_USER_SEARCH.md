# ユーザー検索機能のトラブルシューティング記録

## 問題の概要
プライベートチャンネルでユーザーを指定した検索が失敗する問題の調査・修正記録

**症状**:
- ユーザー指定なしの検索: ✅ 動作する
- 自分自身を指定した検索: ✅ 動作する
- 他のユーザーを指定した検索: ❌ 失敗する（特にプライベートチャンネル）

## 実施した修正内容

### 1. 日付調整ロジックの修正
**ファイル**: `src/slack/client.rs` (973行目付近)

**変更前**:
```rust
let adjusted_date = date - chrono::Duration::days(1);
```

**変更後**:
```rust
let formatted_date = date.format("%Y-%m-%d");
```

**理由**: Slack APIの`after:`演算子はinclusiveなので1日前調整は不要

### 2. conversations.history APIを使用する実装
**ファイル**: `src/slack/client.rs`, `src/commands/search.rs`

**実装内容**:
1. チャンネル+ユーザー指定時に`USE_CONVERSATIONS_HISTORY`フラグを返す
2. チャンネル名からチャンネルIDへの変換機能を追加（`resolve_channel_id`関数）
3. conversations.historyでメッセージ取得後、クライアント側でユーザーフィルタリング

### 3. レスポンス構造体の修正
**ファイル**: `src/slack/client.rs` (467行目付近)

**変更内容**:
```rust
struct ConversationsHistoryResponse {
    ok: bool,
    messages: Option<Vec<SlackMessage>>,
    error: Option<String>,
    oldest: Option<String>,  // channelフィールドは存在しない
}
```

## 確認されたログ

### 成功ログ
```
Resolved channel 'stf-sales' to ID: GKTBNTQN7
Getting channel messages for channel: GKTBNTQN7, limit: 1000
Retrieved X messages from channel GKTBNTQN7
```

### エラーログ（修正前）
```
Failed to get channel messages: error decoding response body: missing field `channel`
```

### APIレスポンスの実際の構造
```json
{
  "ok": true,
  "oldest": "1756684800.000000",
  "messages": [
    {
      "subtype": "bot_message",  // ボットメッセージにはuserフィールドがない
      "text": "...",
      "username": "t_murayama@everyleaf-staff.esa.io",
      ...
    }
  ]
}
```

## 現在の課題

### 1. ボットメッセージの扱い
- ボットメッセージには`user`フィールドがなく、`username`と`subtype`のみ
- 現在のフィルタリングロジックでは除外される

### 2. 他ユーザーの検索制限
- Slack APIの仕様により、`search.messages`で他ユーザーを検索する場合、パブリックチャンネルのメッセージのみ取得可能
- プライベートチャンネルは`conversations.history`を使用する必要がある

## 次に試すべきこと

### 1. デバッグログの追加
```rust
// メッセージ取得成功後のログ
info!("Retrieved {} messages", messages.len());
for msg in messages.iter().take(5) {
    debug!("Message type: {:?}, user: {:?}, username: {:?}",
           msg.subtype, msg.user, msg.username);
}
```

### 2. ユーザーフィルタリングの改善
```rust
// ボットメッセージも考慮
all_slack_messages = all_slack_messages.into_iter()
    .filter(|msg| {
        // 通常メッセージのuser field
        if msg.user.as_ref() == Some(&user_id.to_string()) {
            return true;
        }
        // ボットメッセージのusername field
        if let Some(username) = &msg.username {
            // username からユーザーIDを抽出する処理が必要
        }
        false
    })
    .collect();
```

### 3. SlackMessageモデルの確認
`src/slack/models.rs`の`SlackMessage`構造体に`username`フィールドがあるか確認し、必要に応じて追加

### 4. API権限の確認
必要な権限スコープ:
- `channels:history` - パブリックチャンネル
- `groups:history` - プライベートチャンネル
- `im:history` - ダイレクトメッセージ
- `search:read` - 検索API

## テスト手順

1. アプリケーションの再起動
   ```bash
   npm run tauri dev
   ```

2. ログレベルの設定
   ```bash
   export RUST_LOG=debug
   ```

3. 検索実行とログ確認
   - チャンネル: プライベートチャンネル選択
   - ユーザー: 他のユーザーを選択
   - 日付範囲: 2025-09-01以降

4. 確認ポイント
   - メッセージが取得できているか
   - ユーザーフィルタリングが正しく動作しているか
   - ボットメッセージの扱い

## 関連ファイル
- `src-tauri/src/slack/client.rs` - Slack APIクライアント
- `src-tauri/src/commands/search.rs` - 検索コマンドの実装
- `src-tauri/src/slack/models.rs` - データモデル定義
- `src-tauri/test_private_channel_user_search.md` - テスト仕様書

## 参考リンク
- [Slack API: conversations.history](https://api.slack.com/methods/conversations.history)
- [Slack API: search.messages](https://api.slack.com/methods/search.messages)