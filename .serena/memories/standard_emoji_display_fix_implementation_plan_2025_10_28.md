# Standard Emoji Display Fix - Implementation Plan

**作成日:** 2025-10-28  
**ステータス:** 分析完了・実装待ち  
**優先度:** 高  
**複雑度:** 中〜高

---

## 📋 問題の概要

### 現象
Slackで標準的に使える絵文字（`:tea:`, `:man-gesturing-ok:`, `:memo:` など）が、アプリ内で絵文字として表示されず、文字列として表示される。

### スクリーンショット証拠
- **アプリ内:** `:tea:` と `:man-gesturing-ok:` がテキストとして表示
- **Slack公式:** 同じ絵文字が ☕ と 🙆‍♂️ として正しく表示

### ログから見えた問題
```javascript
[EmojiService] Found partial match for "memo": "memo-nya"  
// → 標準絵文字 :memo: がカスタム絵文字 "memo-nya" と誤マッチ

[EmojiService] Custom emoji not found: man-gesturing-ok
// → 標準絵文字なのに「カスタム絵文字が見つからない」と判定
```

---

## 🔍 根本原因

### 原因1: STANDARD_EMOJISの不足
`src/lib/services/emojiService.ts` の `STANDARD_EMOJIS` 辞書に、多くの標準Slack絵文字が登録されていない。

- **現在:** 約150個の絵文字のみ
- **Slack標準:** 1000個以上の絵文字をサポート
- **不足例:** `:tea:`, `:memo:`, `:coffee:`, `:books:`, その他多数

### 原因2: 命名規則の不一致

#### パターンA: ハイフン vs アンダースコア
```typescript
// Slackが使用: ハイフン区切り
:man-gesturing-ok:

// アプリ辞書: アンダースコア区切り
'person_gesturing_ok': '🙆'
```

#### パターンB: 性別特定 vs 性別中立
```typescript
// Slackが使用: 性別特定版
:man-gesturing-ok:    // 男性
:woman-gesturing-ok:  // 女性

// アプリ辞書: 性別中立版のみ
'person_gesturing_ok': '🙆'
```

### 原因3: getEmojiメソッドの検索ロジック

**検索フロー:**
```
1. カスタム絵文字（現在のワークスペース）
   ↓ 見つからない
2. 標準絵文字（STANDARD_EMOJIS） ← ★ここで失敗
   ↓ 見つからない
3. 他ワークスペースのカスタム絵文字
   ↓ 見つからない
4. ハイフン⇔アンダースコア変換を試行
   - man-gesturing-ok → man_gesturing_ok
   ↓ 存在しないため見つからない
5. 部分一致検索（カスタム絵文字のみ対象）
   ↓
   結果: null → テキスト表示
```

**問題点:**
- ステップ2で標準絵文字が見つからない（辞書に未登録）
- ステップ4で変換後の名前も存在しない
- ステップ5は標準絵文字を対象外

---

## 💡 解決策（3段階アプローチ）

### Phase 1: 低リスク修正 🟢
**リグレッション確率: 5-10%**

#### 実装内容
1. STANDARD_EMOJISに明らかに不足している絵文字を追加
   - 食べ物・飲み物: `:tea:`, `:coffee:`, `:cake:`, `:pizza:` など
   - オブジェクト: `:memo:`, `:books:`, `:calendar:`, `:email:` など
   - 自然: `:sunny:`, `:cloud:`, `:rainbow:`, `:snowflake:` など
   - 約100-200個を厳選追加

#### ファイル
- `src/lib/services/emojiService.ts` (lines 25-341)

#### 実装例
```typescript
const STANDARD_EMOJIS: Record<string, string> = {
  // ... 既存の絵文字 ...
  
  // 食べ物・飲み物
  'tea': '☕',
  'coffee': '☕',
  'cake': '🍰',
  'pizza': '🍕',
  'beer': '🍺',
  'wine_glass': '🍷',
  
  // オブジェクト
  'memo': '📝',
  'pencil': '✏️',
  'books': '📚',
  'book': '📖',
  'bookmark': '🔖',
  'calendar': '📅',
  'email': '📧',
  'envelope': '✉️',
  
  // 自然
  'sunny': '☀️',
  'cloud': '☁️',
  'rainbow': '🌈',
  'snowflake': '❄️',
  'umbrella': '☂️',
  
  // ... 他約150個
};
```

#### テストケース
```typescript
// Test 1: 新しい標準絵文字の表示
input: ":tea:"
expected: "☕"
current: null → テキスト表示

// Test 2: カスタム絵文字の優先順位を保持
input: ":memo:" (カスタム "memo-nya" が存在する場合)
expected: "memo-nya" の画像 URL
risk: 標準 "memo" が優先されないこと

// Test 3: 既存の絵文字が壊れないこと
input: ":thumbsup:"
expected: "👍"
current: "👍"
```

#### 実装手順
1. `STANDARD_EMOJIS` オブジェクトに新しい絵文字を追加
2. 既存のカスタム絵文字と名前衝突しないか確認
3. テストケースを実行
4. 実際のメッセージで動作確認

---

### Phase 2: 中リスク修正 🟡
**リグレッション確率: 10-15%**

#### 実装内容
1. 命名規則のバリエーションを追加
   - ハイフン版とアンダースコア版の両方
   - 性別特定版（man-*, woman-*）

#### 実装例
```typescript
const STANDARD_EMOJIS: Record<string, string> = {
  // ... Phase 1の絵文字 ...
  
  // 性別中立版（既存）
  'person_gesturing_ok': '🙆',
  'person_gesturing_no': '🙅',
  'person_raising_hand': '🙋',
  'person_bowing': '🙇',
  'person_facepalming': '🤦',
  'person_shrugging': '🤷',
  
  // ハイフン版を追加
  'person-gesturing-ok': '🙆',
  'person-gesturing-no': '🙅',
  'person-raising-hand': '🙋',
  'person-bowing': '🙇',
  'person-facepalming': '🤦',
  'person-shrugging': '🤷',
  
  // 男性版（アンダースコア）
  'man_gesturing_ok': '🙆‍♂️',
  'man_gesturing_no': '🙅‍♂️',
  'man_raising_hand': '🙋‍♂️',
  'man_bowing': '🙇‍♂️',
  'man_facepalming': '🤦‍♂️',
  'man_shrugging': '🤷‍♂️',
  
  // 男性版（ハイフン）
  'man-gesturing-ok': '🙆‍♂️',
  'man-gesturing-no': '🙅‍♂️',
  'man-raising-hand': '🙋‍♂️',
  'man-bowing': '🙇‍♂️',
  'man-facepalming': '🤦‍♂️',
  'man-shrugging': '🤷‍♂️',
  
  // 女性版（アンダースコア）
  'woman_gesturing_ok': '🙆‍♀️',
  'woman_gesturing_no': '🙅‍♀️',
  'woman_raising_hand': '🙋‍♀️',
  'woman_bowing': '🙇‍♀️',
  'woman_facepalming': '🤦‍♀️',
  'woman_shrugging': '🤷‍♀️',
  
  // 女性版（ハイフン）
  'woman-gesturing-ok': '🙆‍♀️',
  'woman-gesturing-no': '🙅‍♀️',
  'woman-raising-hand': '🙋‍♀️',
  'woman-bowing': '🙇‍♀️',
  'woman-facepalming': '🤦‍♀️',
  'woman-shrugging': '🤷‍♂️',
};
```

#### テストケース
```typescript
// Test 4: ハイフン形式の絵文字
input: ":man-gesturing-ok:"
expected: "🙆‍♂️"
current: null → テキスト表示

// Test 5: アンダースコア形式（既存）が壊れないこと
input: ":person_gesturing_ok:"
expected: "🙆"
current: "🙆"

// Test 6: 性別特定版
input: ":woman-raising-hand:"
expected: "🙋‍♀️"
current: null or "🙋"
```

#### 注意点
- 辞書サイズが2-4倍に増加（~15KB → ~60KB）
- メモリへの影響は軽微（現代のブラウザでは問題なし）
- 既存の変換ロジック（lines 667-684）との相互作用を確認

---

### Phase 3: 高リスク修正 🔴
**リグレッション確率: 30-40%**  
**⚠️ Phase 1, 2で問題が解決しない場合のみ実装**

#### 実装内容
部分一致検索を標準絵文字にも適用（現在はカスタム絵文字のみ）

#### ファイル・行番号
- `src/lib/services/emojiService.ts`
- `getEmoji` メソッド (lines 604-750)
- 部分一致ロジック (lines 712-743)

#### 実装例
```typescript
// 現在の実装 (line 714)
const partialMatches = cleanName.length > 3 ? Object.keys(data.custom).filter(key => {
  return (key.length > 3 && key.includes(cleanName)) || 
         (cleanName.length > 3 && key.length > 3 && cleanName.includes(key));
}) : [];

// 修正後（慎重に！）
const partialMatches = cleanName.length > 3 ? (() => {
  // カスタム絵文字を優先
  const customMatches = Object.keys(data.custom).filter(key => {
    return (key.length > 3 && key.includes(cleanName)) || 
           (cleanName.length > 3 && key.length > 3 && cleanName.includes(key));
  });
  
  // カスタム絵文字が見つかればそれを返す
  if (customMatches.length > 0) {
    return customMatches;
  }
  
  // カスタム絵文字が見つからない場合のみ標準絵文字を検索
  const standardMatches = Object.keys(data.standard).filter(key => {
    // より厳密な条件: 完全一致を優先
    if (key === cleanName) return true;
    return (key.length > 3 && key.includes(cleanName)) || 
           (cleanName.length > 3 && key.length > 3 && cleanName.includes(key));
  });
  
  return standardMatches;
})() : [];
```

#### リスク
- 誤マッチの可能性が大幅に増加
- 例: "tea" → "team" (カスタム絵文字、もし存在すれば)
- 例: "memo" → "memo" (標準) と "memo-nya" (カスタム) の競合

#### テストケース
```typescript
// Test 7: 部分一致でのカスタム絵文字優先
input: ":memo:" (カスタム "memo-nya" と標準 "memo" の両方が存在)
expected: "memo-nya" の画像 URL
risk: 標準 "memo" が優先される

// Test 8: 完全一致の優先
input: ":heart:" (標準 "heart" と カスタム "heart_eyes" が存在)
expected: "❤️" (標準 "heart")
risk: "heart_eyes" が誤って返される

// Test 9: 短いキーの優先
input: ":ok:" (標準 "ok_hand" と カスタム "oka" が存在)
expected: 最も関連性の高いもの
risk: 意図しない絵文字がマッチ
```

---

## 🗂️ 関連ファイルと行番号

### 主要ファイル
1. **`src/lib/services/emojiService.ts`**
   - `STANDARD_EMOJIS` 定義 (lines 25-341)
   - `EmojiService` クラス (lines 355-989)
   - `getEmoji` メソッド (lines 604-750)
   - `initialize` メソッド (lines 372-434)
   - 部分一致ロジック (lines 712-743)

### 依存コンポーネント（影響範囲）
2. **`src/lib/utils/emojiParser.ts`**
   - `parseMessageWithEmojis` 関数 (lines 13-257)
   - `parseEmoji` 関数 (lines 262-297)

3. **Svelteコンポーネント（6個）**
   - `src/lib/components/MessageItem.svelte`
   - `src/lib/components/OptimizedMessageItem.svelte`
   - `src/lib/components/MessagePreview.svelte`
   - `src/lib/components/ReactionPicker.svelte`
   - `src/lib/components/EmojiAutocomplete.svelte`
   - `src/lib/components/EmojiSettings.svelte`

### 検索・参照方法
```typescript
// getEmojiメソッドの使用箇所を検索
grep -r "getEmoji" src/

// STANDARD_EMOJISの使用箇所を検索
grep -r "STANDARD_EMOJIS" src/

// 絵文字関連コンポーネントを検索
find src/ -name "*emoji*.svelte" -o -name "*Emoji*.svelte"
```

---

## 🧪 テスト戦略

### 単体テスト
```typescript
// src/lib/services/emojiService.test.ts (作成推奨)

describe('EmojiService.getEmoji', () => {
  test('標準絵文字を取得できる', () => {
    const emoji = emojiService.getEmoji('tea');
    expect(emoji).toBe('☕');
  });
  
  test('カスタム絵文字が優先される', () => {
    // カスタム絵文字 "memo-nya" をモック
    const emoji = emojiService.getEmoji('memo');
    expect(emoji).toContain('https://'); // カスタム絵文字のURL
  });
  
  test('ハイフン形式の絵文字を取得できる', () => {
    const emoji = emojiService.getEmoji('man-gesturing-ok');
    expect(emoji).toBe('🙆‍♂️');
  });
  
  test('存在しない絵文字はnullを返す', () => {
    const emoji = emojiService.getEmoji('nonexistent-emoji-xyz');
    expect(emoji).toBeNull();
  });
});
```

### 統合テスト
1. **実際のメッセージ表示テスト**
   - ThreadViewで `:tea:` を含むメッセージを表示
   - MessageItemで `:man-gesturing-ok:` を含むメッセージを表示
   - 既存のカスタム絵文字が正しく表示されるか確認

2. **リアクションテスト**
   - ReactionPickerで新しい標準絵文字が選択できるか
   - リアクションが正しく表示されるか

3. **検索・オートコンプリートテスト**
   - EmojiAutocompleteで新しい絵文字が候補に出るか
   - 検索結果の優先順位が正しいか

### 手動テスト手順
1. `npm run dev` でアプリを起動
2. Slackワークスペースに接続
3. 以下の絵文字を含むメッセージを探す・送信する:
   - `:tea:` ☕
   - `:memo:` 📝
   - `:man-gesturing-ok:` 🙆‍♂️
   - `:coffee:` ☕
   - `:books:` 📚
4. 各絵文字が正しく表示されることを確認
5. 既存のカスタム絵文字も正しく表示されることを確認

---

## 📊 リグレッションリスク評価

### Phase別リスク

| Phase | 修正内容 | リスク確率 | 影響度 | 推奨度 |
|-------|---------|-----------|--------|--------|
| Phase 1 | STANDARD_EMOJIS拡充 | 5-10% | 低 | ✅ 強く推奨 |
| Phase 2 | 命名規則バリエーション | 10-15% | 中 | ⚠️ 推奨 |
| Phase 3 | 部分一致検索改善 | 30-40% | 高 | ⛔ 注意が必要 |

### 詳細リスク分析

#### Phase 1のリスク
- **カスタム絵文字との名前衝突:** 5%
  - 例: ユーザーのワークスペースに "tea" という名前のカスタム絵文字が存在
  - 軽減策: getEmojiの検索順序（カスタム→標準）により自動的に回避
  
- **既存動作の破壊:** <1%
  - STANDARD_EMOJISへの追加のみ、既存ロジックは変更なし

#### Phase 2のリスク
- **辞書サイズの増加によるパフォーマンス劣化:** 10%
  - 影響: 初期化時間が数ミリ秒増加、メモリ使用量+50KB
  - 軽減策: 現代のブラウザでは問題にならないレベル

- **既存の変換ロジックとの競合:** 5%
  - 例: "man-gesturing-ok" が辞書に追加されたことで、変換ロジックが不要に
  - 影響: パフォーマンスがわずかに向上（変換試行が不要）

#### Phase 3のリスク
- **誤マッチによる意図しない絵文字表示:** 25-30%
  - 例: ":memo:" → "memo-nya" (カスタム) または "memo" (標準) の選択が不明確
  - 軽減策: 厳密なマッチング条件、カスタム絵文字優先

- **パフォーマンス劣化:** 10%
  - 部分一致検索の対象が1000個以上に増加
  - O(n) 処理が10-20倍遅延する可能性
  - 軽減策: 完全一致を優先、部分一致は最後の手段

---

## 🚀 実装チェックリスト

### Phase 1（必須）

#### 準備
- [ ] 現在のSTANDARD_EMOJISをバックアップ
- [ ] テスト環境を準備

#### 実装
- [ ] STANDARD_EMOJISに新しい絵文字を追加（100-200個）
  - [ ] 食べ物・飲み物カテゴリ
  - [ ] オブジェクトカテゴリ
  - [ ] 自然カテゴリ
  - [ ] 活動カテゴリ
  - [ ] 乗り物カテゴリ

#### テスト
- [ ] 単体テストを作成・実行
- [ ] 統合テストを実行
- [ ] 手動テストを実行
  - [ ] `:tea:` の表示確認
  - [ ] `:memo:` の表示確認
  - [ ] `:coffee:` の表示確認
  - [ ] 既存のカスタム絵文字が壊れていないか確認

#### デプロイ
- [ ] コードレビュー
- [ ] ステージング環境でテスト
- [ ] プロダクションにデプロイ
- [ ] ユーザーフィードバックを収集

---

### Phase 2（推奨）

#### 準備
- [ ] Phase 1が安定稼働していることを確認
- [ ] ユーザーフィードバックを確認

#### 実装
- [ ] 命名規則のバリエーションを追加
  - [ ] ハイフン版（person-gesturing-ok など）
  - [ ] 性別特定版・アンダースコア（man_gesturing_ok など）
  - [ ] 性別特定版・ハイフン（man-gesturing-ok など）

#### テスト
- [ ] ハイフン形式の絵文字テスト
- [ ] 性別特定版の絵文字テスト
- [ ] 既存の変換ロジックとの相互作用テスト
- [ ] パフォーマンステスト（メモリ、初期化時間）

#### デプロイ
- [ ] コードレビュー
- [ ] ステージング環境でテスト
- [ ] プロダクションにデプロイ
- [ ] ユーザーフィードバックを収集

---

### Phase 3（条件付き）

#### 前提条件
- [ ] Phase 1, 2で問題が完全に解決しない
- [ ] ユーザーから特定の絵文字が見つからないという報告がある
- [ ] リスクを受け入れる覚悟がある

#### 実装
- [ ] 部分一致ロジックを慎重に修正
  - [ ] カスタム絵文字優先ロジックを実装
  - [ ] 完全一致優先ロジックを実装
  - [ ] 詳細なログを追加

#### テスト
- [ ] 包括的な単体テスト（30個以上のケース）
- [ ] 統合テスト
- [ ] パフォーマンステスト
- [ ] 長期間の安定性テスト

#### デプロイ
- [ ] 厳密なコードレビュー（複数人）
- [ ] ステージング環境で1週間以上テスト
- [ ] カナリアデプロイ（一部ユーザーのみ）
- [ ] 問題があればすぐにロールバック

---

## 🔄 ロールバック計画

### 即座のロールバック（<5分）
```bash
# Gitで前のコミットに戻す
git revert <commit-hash>
git push origin main

# または直接修正
git checkout HEAD~1 -- src/lib/services/emojiService.ts
git commit -m "Rollback emoji service changes"
git push origin main
```

### 部分的ロールバック
```typescript
// STANDARD_EMOJISの一部のみを削除
const STANDARD_EMOJIS: Record<string, string> = {
  // 問題のある絵文字をコメントアウト
  // 'tea': '☕',  // ← 問題がある場合
  // 'memo': '📝',  // ← 問題がある場合
  
  // 他の絵文字は残す
  'coffee': '☕',
  // ...
};
```

---

## 📈 成功指標

### Phase 1
- [ ] `:tea:`, `:memo:`, `:coffee:` が絵文字として表示される
- [ ] 既存のカスタム絵文字が正しく表示される
- [ ] リグレッションが0件
- [ ] ユーザーからのポジティブフィードバック

### Phase 2
- [ ] `:man-gesturing-ok:` が 🙆‍♂️ として表示される
- [ ] `:woman-raising-hand:` が 🙋‍♀️ として表示される
- [ ] 初期化時間が10ms以内の増加
- [ ] メモリ使用量が100KB以内の増加

### Phase 3
- [ ] 部分一致が正しく動作する
- [ ] カスタム絵文字が優先される
- [ ] 誤マッチが0件
- [ ] パフォーマンス劣化が体感できない

---

## 📚 参考資料

### Slackの絵文字リファレンス
- [Slack Emoji List](https://github.com/iamcal/emoji-data)
- [Unicode Emoji Standard](https://unicode.org/emoji/charts/full-emoji-list.html)

### 関連ドキュメント
- `.serena/memories/project_overview.md` - プロジェクト全体の構造
- `.serena/memories/code_style_and_conventions.md` - コーディング規約

### 関連Issue・PR
- (このセクションは実装時に更新)

---

## 💬 セッション間の引き継ぎ

### 次のセッションで最初に確認すること
1. このメモリファイルを読む
2. 現在のPhaseを確認
3. 前回のセッションで実装した内容を確認
4. テスト結果を確認
5. ユーザーフィードバックを確認

### 各セッションの最後にやること
1. 実装内容をコミット
2. テスト結果を記録
3. 次のセッションでやるべきことをこのドキュメントに追記
4. 問題があればメモを残す

### コマンド
```bash
# このメモリを読む
# (Claude Codeで自動的にメモリとして利用可能)

# 実装状況を確認
git log --oneline -10
git diff HEAD~1

# テストを実行
npm test -- emojiService
```

---

**最終更新:** 2025-10-28  
**次回セッション:** Phase 1の実装から開始  
**担当者メモ:** Phase 1のみで問題が解決する可能性が高い（80%）