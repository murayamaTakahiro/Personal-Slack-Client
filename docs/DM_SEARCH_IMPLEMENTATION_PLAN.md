# DM/グループDM検索機能 実装計画書

## 概要
このドキュメントは、Slack Personal ClientにDM（ダイレクトメッセージ）およびグループDM検索機能を追加するための段階的実装計画です。過去の失敗経験を踏まえ、極めて慎重なアプローチを採用しています。

## 現状分析

### 現在の制限事項
- ✅ パブリックチャンネルの検索: 完全動作
- ✅ プライベートチャンネルの検索: 完全動作
- ❌ DM（ダイレクトメッセージ）の検索: 未対応
- ❌ グループDM（MPIM）の検索: 未対応

### 技術的課題
1. **API制限**: `search.messages` APIはDMに対して特殊な挙動を示す
2. **権限不足**: トークンに`im:read`、`mpim:read`スコープが必要
3. **チャンネル列挙**: 現在DMチャンネルを取得していない
4. **UI複雑性**: DMとチャンネルの区別が必要

## 成功確率評価

### 全体成功率: 65%

### リスク要因別分析
| リスク要因 | 発生確率 | 影響度 | 対策 |
|-----------|---------|--------|------|
| トークン権限不足 | 30% | 高 | 事前検証実装 |
| API挙動の想定外 | 20% | 高 | 段階的テスト |
| UI複雑化 | 15% | 中 | MVP先行実装 |
| パフォーマンス | 10% | 低 | キャッシュ戦略 |

## フェーズ別実装計画

### 🔵 フェーズ1: 読み取り専用DMチャンネル発見
**期間**: 1週目
**成功確率**: 85%
**リスクレベル**: 低

#### 目標
- DMチャンネル一覧を取得・表示（検索機能なし）
- トークン権限の検証

#### 実装タスク
1. **権限検証機能の追加**
   ```rust
   // src-tauri/src/slack/client.rs
   pub async fn verify_dm_permissions(&self) -> Result<bool, String> {
       // im:read, mpim:read スコープの確認
   }
   ```

2. **DMチャンネル取得**
   ```rust
   pub async fn get_dm_channels(&self) -> Result<Vec<Channel>, String> {
       // types: "im" のみ（グループDMは後回し）
   }
   ```

3. **UI表示（読み取り専用）**
   - DMチャンネルリストの表示
   - 検索機能は無効化

#### 検証項目
- [ ] 全DMチャンネルが表示される
- [ ] トークン権限エラーが適切に表示される
- [ ] 既存のチャンネル検索が影響を受けない

#### ロールバック計画
```rust
const DM_FEATURE_ENABLED: bool = false; // 緊急時はこれをfalseに
```

---

### 🔵 フェーズ2: 単一DM検索
**期間**: 2週目
**成功確率**: 70%
**リスクレベル**: 中

#### 目標
- 選択した1つのDM内でメッセージ検索

#### 実装タスク
1. **DM用検索API実装**
   ```rust
   pub async fn search_dm_messages(
       &self,
       dm_channel_id: &str,
       query: &str
   ) -> Result<SearchResult, String> {
       // conversations.history APIを使用
       // search.messages APIは使わない
   }
   ```

2. **UI: DM選択機能**
   ```svelte
   <!-- DMSelector.svelte -->
   <select bind:value={selectedDM}>
     {#each dmChannels as dm}
       <option value={dm.id}>{dm.user_name}</option>
     {/each}
   </select>
   ```

3. **エラーハンドリング**
   - API失敗時のフォールバック
   - ユーザーへの明確なエラーメッセージ

#### 検証項目
- [ ] 既知のメッセージが検索できる
- [ ] 検索結果がSlackと一致する
- [ ] エラー時に適切なメッセージが表示される
- [ ] パフォーマンスが許容範囲内

#### 判断ポイント
- 成功: 次フェーズへ
- 部分成功: 問題解決後に再評価
- 失敗: フェーズ1の機能のみでリリース

---

### 🟡 フェーズ3: 複数DM検索
**期間**: 3週目
**成功確率**: 60%
**リスクレベル**: 高

#### 目標
- 複数のDMを同時検索
- パフォーマンス最適化

#### 実装タスク
1. **並列検索実装**
   ```rust
   pub async fn search_multiple_dms(
       &self,
       dm_channel_ids: Vec<String>,
       query: &str
   ) -> Result<Vec<SearchResult>, String> {
       // 並列処理でレート制限対策
   }
   ```

2. **結果集約**
   - 時系列ソート
   - 重複除去

3. **パフォーマンス対策**
   - 検索結果キャッシュ
   - プログレッシブ表示

#### 検証項目
- [ ] 10個以上のDMで動作確認
- [ ] レート制限エラーが発生しない
- [ ] 検索時間が5秒以内
- [ ] メモリ使用量が適切

---

### 🟡 フェーズ4: グループDM対応（オプション）
**期間**: 4週目
**成功確率**: 65%
**リスクレベル**: 中

#### 目標
- グループDM（MPIM）のサポート

#### 実装タスク
1. **MPIM取得**
   ```rust
   // types に "mpim" を追加
   params.insert("types", "im,mpim".to_string());
   ```

2. **UI表示改善**
   - 参加者リストの表示
   - グループ名の表示

#### 検証項目
- [ ] すべてのグループDMが表示される
- [ ] 参加者情報が正確
- [ ] アーカイブされたグループDMの扱い

---

## 技術的実装詳細

### 必要なSlack APIスコープ
```yaml
必須:
  - search:read     # 検索基本機能
  - im:read        # DM読み取り
  - im:history     # DM履歴取得

オプション（フェーズ4）:
  - mpim:read      # グループDM読み取り
  - mpim:history   # グループDM履歴取得
  - users:read     # ユーザー情報取得
```

### API使用戦略
| フェーズ | 使用API | 理由 |
|---------|---------|------|
| フェーズ1 | conversations.list | DMチャンネル列挙 |
| フェーズ2 | conversations.history | 単一DM内検索 |
| フェーズ3 | conversations.history（並列） | 複数DM検索 |
| フェーズ4 | conversations.list + users.info | グループDM情報取得 |

### コード変更箇所

#### バックエンド（Rust）
- `src-tauri/src/slack/client.rs`: DMチャンネル取得、DM検索
- `src-tauri/src/commands/search.rs`: DM検索コマンド追加
- `src-tauri/src/main.rs`: 新規コマンドの登録

#### フロントエンド（Svelte）
- `src/lib/components/SearchBar.svelte`: DM選択UI追加
- `src/lib/components/DMSelector.svelte`: 新規コンポーネント
- `src/lib/stores/dmChannels.ts`: DM情報管理ストア

## テスト戦略

### フェーズ1テスト
```bash
# DMチャンネル取得テスト
1. トークン権限の確認
2. DMチャンネルリストの取得
3. 結果の検証（DMのIDは'D'で始まる）
```

### フェーズ2テスト
```bash
# 単一DM検索テスト
1. テスト用DMに既知のメッセージを送信
2. そのメッセージを検索
3. 結果が正確に返ることを確認
```

### フェーズ3テスト
```bash
# パフォーマンステスト
1. 10個のDMを同時検索
2. 応答時間を測定（目標: 5秒以内）
3. メモリ使用量を確認
```

## リスク管理

### 機能フラグによる制御
```rust
// src-tauri/src/config.rs
pub struct FeatureFlags {
    pub dm_channels_enabled: bool,      // フェーズ1
    pub dm_search_enabled: bool,        // フェーズ2
    pub multi_dm_search_enabled: bool,  // フェーズ3
    pub group_dm_enabled: bool,         // フェーズ4
}
```

### ロールバック手順
1. 該当機能フラグを`false`に設定
2. アプリケーションを再起動
3. 問題のないバージョンにロールバック

## 成功指標

### MVP成功基準（フェーズ1）
- DMチャンネルが表示される
- 既存機能に影響がない
- エラーが適切に処理される

### 完全実装成功基準（フェーズ4）
- すべてのDM/グループDMが検索可能
- パフォーマンスが実用レベル
- UIが直感的で使いやすい

## 実装スケジュール

| 週 | フェーズ | 成果物 |
|----|---------|--------|
| 1週目 | フェーズ1 | DMチャンネル一覧表示 |
| 2週目 | フェーズ2 | 単一DM検索 |
| 3週目 | フェーズ3 | 複数DM検索 |
| 4週目 | フェーズ4 | グループDM対応 |

## 次のステップ

1. **フェーズ1の実装開始**
   - トークン権限の確認
   - DMチャンネル取得機能の実装
   - 基本的なUI表示

2. **週次レビュー**
   - 各フェーズ完了時に評価
   - 次フェーズへの移行判断

3. **ユーザーフィードバック**
   - 各フェーズでテスト版リリース
   - フィードバックを次フェーズに反映

---

*このドキュメントは実装の進行に応じて更新されます。*
*最終更新: 2025-01-22*