# ユーザー名マッピング問題の診断

## 問題の症状
- ユーザーID: `U04F9M6JX2M`
- 期待される表示名: `murayama`
- 現在表示されている名前: `yandt89`

## 可能性のある原因

### 1. フィールドの混同
Slack APIのユーザーオブジェクトには複数の名前フィールドがあります：
- `name`: ユーザー名（@ハンドル、例: yandt89）
- `real_name`: 実名（例: Murayama Takashi）
- `profile.display_name`: 表示名（例: murayama）
- `profile.real_name`: プロフィールの実名

### 2. ユーザーIDの混同
- 別のユーザーのIDと混同している可能性
- DMチャンネルの`user`フィールドが間違っている可能性

### 3. APIレスポンスの問題
- `display_name`が空で、`name`フィールド（yandt89）が使用されている
- `real_name`フィールドが期待と異なる

## デバッグ手順

1. **check-user.shスクリプトを実行**
   ```bash
   ./check-user.sh YOUR_SLACK_TOKEN
   ```
   これにより、実際のAPIレスポンスを確認できます。

2. **アプリケーションログを確認**
   デバッグログを有効にして、以下を確認：
   - `[DEBUG] Relevant user found:` - ユーザー情報の詳細
   - `[DEBUG] User U04F9M6JX2M mapped to display_name:` - マッピング結果
   - `[DEBUG] DM channel ... for user U04F9M6JX2M resulted in name:` - 最終的な表示名

3. **修正の確認**
   現在の優先順位：
   1. `profile.display_name`（設定されていて空でない場合）
   2. `profile.real_name`（設定されていて空でない場合）
   3. `real_name`（トップレベル、設定されていて空でない場合）
   4. `name`（@ハンドル）
   5. `user.id`（フォールバック）

## 解決策

もし`murayama`が`profile.display_name`または`real_name`に設定されているにも関わらず`yandt89`（`name`フィールド）が表示される場合、以下を確認：

1. **フィールドが空文字列でないか**
2. **フィールドがnullでないか**
3. **ユーザーマップの構築が正しいか**

スクリプトの実行結果を基に、実際のフィールド値を確認して修正します。