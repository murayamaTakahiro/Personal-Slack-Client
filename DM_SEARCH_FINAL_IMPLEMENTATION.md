# DM検索機能 - 最終実装ドキュメント

## 概要
Slack Personal ClientにDM（ダイレクトメッセージ）検索機能を実装しました。この実装では、DMチャンネルを通常のチャンネルリストに統合し、シームレスな検索体験を提供します。

## 実装アプローチ

### 問題と解決策
- **問題**: Slack APIの`search.messages`エンドポイントはDMチャンネルID（D...）での検索をサポートしていない
- **解決策**: DMチャンネルの検索には`conversations.history` APIを使用

## 主要な実装内容

### 1. バックエンド（Rust）

#### DMチャンネル取得機能
- `src-tauri/src/commands/search.rs`の`get_user_channels`関数を拡張
- `include_dms`パラメータを追加し、DMチャンネルを含めるかを制御
- DMチャンネルは`@ユーザー名`形式で表示

#### DM専用検索処理
```rust
// src-tauri/src/commands/search.rs
if ch.starts_with("D") && ch.len() > 8 {
    // DMチャンネルと判定
    let dm_messages = client.search_dm_messages(
        ch,
        query_str,
        limit.unwrap_or(100),
    ).await?;
}
```

#### conversations.history APIの使用
- `src-tauri/src/slack/client.rs`の`search_dm_messages`関数
- `search.messages`の代わりに`conversations.history`を使用
- ローカルでクエリフィルタリング（フェーズ2アプローチ）

### 2. フロントエンド（JavaScript/Svelte）

#### チャンネルセレクターの拡張
- `src/lib/components/ChannelSelector.svelte`
- DMチャンネル用に適切なIDとディスプレイ名の処理
- `@`プレフィックスでDMを識別

#### 設定の統合
- `src/lib/components/ExperimentalSettings.svelte`
- DM機能の有効/無効を制御
- デフォルトでは無効（安全性重視）

#### APIクライアントの更新
- `src/lib/api/slack.ts`
- `getUserChannels`関数に`includeDMs`パラメータを追加
- パラメータ名の修正（`includeDms`をキャメルケースで統一）

## 必要な権限

Slackトークンには以下のスコープが必要です：
- `channels:read` - チャンネル情報の読み取り
- `im:read` - DMチャンネルのリスト取得
- `im:history` - DMメッセージ履歴の読み取り
- `search:read` - 検索機能の基本権限

## 使用方法

1. **設定で機能を有効化**
   - Settings → Experimental Features
   - 「Enable DM Channels」をオンにする

2. **DMチャンネルの選択**
   - チャンネルセレクターを開く
   - `@ユーザー名`形式のDMチャンネルを選択

3. **検索の実行**
   - 通常のチャンネルと同様に検索
   - 日付フィルタなども使用可能

## 技術的な詳細

### チャンネルIDの処理
- DMチャンネルID: `D`で始まる（例: D096JP29HQH）
- グループDM: `G`で始まる（フェーズ4で対応予定）
- 検索時は実際のチャンネルIDを使用

### パフォーマンス対策
- レート制限：DMアクセスは通常の2倍の遅延
- メッセージ数制限：最大100件
- ローカルフィルタリングで効率化

## 既知の制限事項

1. **検索精度**: `conversations.history`を使用するため、全文検索ではなく履歴取得後のローカルフィルタリング
2. **メッセージ数**: 一度に取得できるメッセージは最大100件
3. **グループDM**: 現在は個別DMのみサポート（グループDMは今後の実装予定）

## トラブルシューティング

### DMが表示されない場合
1. Experimental Featuresで機能が有効になっているか確認
2. トークンに`im:read`権限があるか確認
3. アプリケーションを再起動

### 検索結果が0件の場合
1. トークンに`im:history`権限があるか確認
2. 日付フィルタが適切か確認
3. PowerShellのログで`Detected DM channel search`を確認

## 今後の拡張予定

- **フェーズ3**: 複数DM同時検索
- **フェーズ4**: グループDM（MPIM）のサポート
- **最適化**: search.messages APIの代替手段の調査

## 変更履歴

- 2025-01-22: フェーズ1実装 - DMチャンネル一覧表示
- 2025-01-22: フェーズ2実装 - 単一DM内検索機能
- 2025-01-22: conversations.history APIへの切り替え
