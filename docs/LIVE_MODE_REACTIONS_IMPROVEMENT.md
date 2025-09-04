# Liveモード リアクション即時反映機能 - 調査結果と実装計画

## 概要
Personal Slack ClientのLiveモード（リアルタイムモード）において、メッセージに付けられた絵文字リアクションが即時反映されない問題の調査結果と改善計画をまとめます。

## 現状分析

### 1. 現在のLiveモードの仕組み

#### 1.1 アーキテクチャ
- **実装方式**: WebSocketではなく、定期的なポーリング方式を採用
- **更新間隔**: デフォルト30秒（ユーザー設定可能）
- **実装場所**: 
  - メインロジック: `src/App.svelte`
  - 状態管理: `src/lib/stores/realtime.ts`
  - 検索処理: `src/lib/components/SearchBar.svelte`

#### 1.2 動作フロー
```
1. ユーザーがLiveモードを有効化
   ↓
2. App.svelte: startRealtimeUpdates() 実行
   ↓
3. 設定された間隔でperformRealtimeUpdate() を呼び出し
   ↓
4. SearchBar.triggerRealtimeSearch() で検索を実行
   ↓
5. 新しいメッセージを取得・表示
```

#### 1.3 関連ファイル構成
```
src/
├── App.svelte                           # Liveモードの制御ロジック
├── lib/
│   ├── components/
│   │   ├── MessageItem.svelte          # メッセージとリアクション表示
│   │   ├── SearchBar.svelte            # 検索実行
│   │   └── RealtimeSettings.svelte     # Liveモード設定UI
│   ├── stores/
│   │   └── realtime.ts                 # Liveモード状態管理
│   └── services/
│       └── reactionService.ts          # リアクション処理サービス
src-tauri/
├── src/
│   ├── commands/
│   │   ├── search.rs                   # メッセージ検索処理
│   │   └── reactions.rs                # リアクション取得処理
│   └── slack/
│       └── client.rs                   # Slack API クライアント
```

### 2. 現在のリアクション処理

#### 2.1 リアクション取得の仕組み
- **取得タイミング**: ユーザーが手動でリアクションボタンをクリックした時のみ
- **取得方法**: 個別メッセージごとに`reactions.get` APIを呼び出し
- **実装場所**: `MessageItem.svelte:155行目`

```javascript
// MessageItem.svelte
async function handleReactionClick(emoji: string) {
  await reactionService.toggleReaction(message.channel, message.ts, emoji, reactions);
  // リアクション取得（個別）
  reactions = await reactionService.getReactions(message.channel, message.ts);
}
```

#### 2.2 バックエンド実装
```rust
// src-tauri/src/commands/reactions.rs
pub async fn get_reactions(
    channel: String,
    timestamp: String,
) -> AppResult<Vec<SlackReaction>> {
    // reactions.get APIを使用して個別メッセージのリアクションを取得
    client.get_reactions(&channel, &timestamp).await
}
```

### 3. 問題点

#### 3.1 主要な問題
1. **リアクション情報の非同期性**: Liveモードでメッセージ本体は更新されるが、リアクション情報は更新されない
2. **API効率の悪さ**: メッセージごとに個別のAPIコールが必要
3. **ユーザー体験の不整合**: メッセージは自動更新されるのに、リアクションは手動操作が必要

#### 3.2 技術的制約
- Slack APIの`search.messages`はリアクション情報を含まない
- `conversations.history`はリアクション情報を含むが、現在使用していない

## 改善案

### 1. 実装方針

#### Option A: conversations.history APIの活用（推奨）
- **メリット**: 
  - 1回のAPIコールでメッセージとリアクション情報を同時取得
  - APIコール数の削減
  - パフォーマンスの向上
- **デメリット**: 
  - 検索機能との整合性を保つ必要がある
  - チャンネル指定が必須

#### Option B: 個別リアクション取得の並列化
- **メリット**: 
  - 既存の実装を大幅に変更せずに済む
  - 柔軟な制御が可能
- **デメリット**: 
  - APIコール数が多い（レート制限のリスク）
  - 実装が複雑

### 2. 実装計画（Option A採用の場合）

#### Phase 1: バックエンドの改修
1. **search.rsの拡張**
   - Liveモード用の新しい検索関数を追加
   - `conversations.history` APIを使用してリアクション情報を含む完全なメッセージデータを取得

```rust
// src-tauri/src/commands/search.rs
pub async fn search_messages_with_reactions(
    channel: String,
    limit: i32,
    oldest: Option<String>,
) -> AppResult<SearchResult> {
    // conversations.history APIを使用
    // include_all_metadata=true でリアクション情報を含める
}
```

2. **メッセージモデルの拡張**
   - `Message`構造体にリアクション情報フィールドを確実に含める
   - シリアライズ/デシリアライズの対応

#### Phase 2: フロントエンドの改修
1. **SearchBar.svelte**
   - Liveモード時は新しいAPI関数を呼び出すように条件分岐

```javascript
// SearchBar.svelte
async function handleSearch(isRealtimeUpdate: boolean = false) {
  if (isRealtimeUpdate && $realtimeStore.isEnabled) {
    // Liveモード用の検索（リアクション情報込み）
    const result = await searchMessagesWithReactions(params);
  } else {
    // 通常の検索
    const result = await searchMessages(params);
  }
}
```

2. **MessageItem.svelte**
   - リアクティブな更新は既に実装済み（26行目）
   - 追加の修正は不要

```javascript
// 既存のコード（変更不要）
$: reactions = message.reactions || [];
```

#### Phase 3: データマージ処理
1. **App.svelte**
   - 新しいメッセージと既存メッセージのマージロジック
   - リアクション情報の差分検出と通知

```javascript
// App.svelte
function mergeMessages(existingMessages, newMessages) {
  // メッセージIDをキーにマージ
  // リアクション情報の変更を検出
  // 必要に応じて通知を表示
}
```

### 3. 実装スケジュール

| フェーズ | タスク | 優先度 | 推定工数 |
|---------|--------|--------|----------|
| 1 | バックエンドAPI改修 | 高 | 2-3時間 |
| 2 | フロントエンド連携 | 高 | 1-2時間 |
| 3 | データマージ処理 | 中 | 1-2時間 |
| 4 | テスト・デバッグ | 高 | 2-3時間 |
| 5 | パフォーマンス最適化 | 低 | 1-2時間 |

### 4. テスト項目

#### 機能テスト
- [ ] Liveモード有効時、リアクション情報が自動更新される
- [ ] 手動でリアクションを追加/削除した際の動作
- [ ] 複数チャンネルでの同時動作
- [ ] 大量のリアクションがあるメッセージの処理

#### パフォーマンステスト
- [ ] API呼び出し回数の削減確認
- [ ] レスポンス時間の測定
- [ ] メモリ使用量の確認

#### エッジケース
- [ ] ネットワークエラー時の挙動
- [ ] レート制限への対応
- [ ] 古いメッセージのリアクション更新

## 期待される成果

### ユーザー体験の向上
1. **即時性**: 他のユーザーが付けたリアクションがリアルタイムで反映
2. **一貫性**: メッセージとリアクションの更新タイミングが同期
3. **効率性**: 不要な手動操作の削減

### 技術的改善
1. **API効率**: APIコール数の削減（最大50%削減見込み）
2. **パフォーマンス**: レスポンス時間の短縮
3. **保守性**: よりシンプルで理解しやすいコード構造

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| APIレート制限 | 高 | レート制限の実装、キャッシュの活用 |
| 既存機能への影響 | 中 | 段階的な実装、フィーチャーフラグの使用 |
| パフォーマンス劣化 | 低 | 事前のベンチマーク、最適化の実施 |

## 次のステップ

1. **レビューと承認**: この実装計画のレビューと承認
2. **プロトタイプ開発**: Phase 1の最小実装
3. **動作確認**: 基本的な動作の確認
4. **段階的実装**: 各フェーズの順次実装
5. **リリース準備**: テスト完了後のリリース準備

## 参考資料

### Slack API ドキュメント
- [conversations.history](https://api.slack.com/methods/conversations.history)
- [reactions.get](https://api.slack.com/methods/reactions.get)
- [search.messages](https://api.slack.com/methods/search.messages)

### 関連コード
- [MessageItem.svelte](../src/lib/components/MessageItem.svelte)
- [reactionService.ts](../src/lib/services/reactionService.ts)
- [realtime.ts](../src/lib/stores/realtime.ts)
- [search.rs](../src-tauri/src/commands/search.rs)

---

*Document created: 2025-01-04*
*Author: Claude (AI Assistant)*
*Version: 1.0*