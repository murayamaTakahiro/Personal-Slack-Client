# Standard Emoji Fix - Quick Start Guide

**作成日:** 2025-10-28  
**関連:** 
- standard_emoji_display_fix_implementation_plan_2025_10_28.md（詳細な実装計画）
- standard_emoji_technical_reference_2025_10_28.md（技術詳細）

このガイドは、新しいセッションで作業を再開する際のクイックリファレンスです。

---

## 🚀 30秒でわかる問題と解決策

### 問題
`:tea:`, `:man-gesturing-ok:`, `:memo:` などの標準Slack絵文字がテキストとして表示される

### 原因
`STANDARD_EMOJIS` 辞書に絵文字が不足（150個しかない、Slackは1000個以上）

### 解決策（3段階）
1. **Phase 1（推奨）:** STANDARD_EMOJISに不足している絵文字を追加 → リスク 5-10%
2. **Phase 2（任意）:** ハイフン版・性別版を追加 → リスク 10-15%
3. **Phase 3（高リスク）:** 部分一致を改善 → リスク 30-40%

---

## 📂 ファイル構成

```
src/lib/services/emojiService.ts
├── STANDARD_EMOJIS (line 25-341)    ← ここを編集
├── EmojiService class (355-989)
│   ├── initialize() (372-434)
│   └── getEmoji() (604-750)         ← 検索ロジック
└── emojiData (Svelte Store)
```

---

## ⚡ Phase 1の実装（5分で完了）

### 1. ファイルを開く
```bash
code src/lib/services/emojiService.ts
```

### 2. STANDARD_EMOJISを編集（line 25）
```typescript
const STANDARD_EMOJIS: Record<string, string> = {
  // ... 既存の絵文字（変更しない）...
  
  // ========================================
  // Phase 1: 追加する標準絵文字
  // ========================================
  
  // 食べ物・飲み物
  'tea': '☕',
  'coffee': '☕',
  'cake': '🍰',
  'pizza': '🍕',
  'beer': '🍺',
  
  // オブジェクト
  'memo': '📝',
  'pencil': '✏️',
  'books': '📚',
  'calendar': '📅',
  'email': '📧',
  
  // 自然
  'sunny': '☀️',
  'cloud': '☁️',
  'rainbow': '🌈',
  'snowflake': '❄️',
  'umbrella': '☂️',
  
  // ... 合計100-200個を追加 ...
};
```

### 3. テスト
```bash
npm run dev

# ブラウザのコンソールで確認
emojiService.getEmoji('tea')      // "☕" が返ればOK
emojiService.getEmoji('memo')     // "📝" が返ればOK
```

### 4. 既存機能が壊れていないか確認
```javascript
// ブラウザコンソール
emojiService.getEmoji('thumbsup')  // "👍" が返ればOK
emojiService.getEmoji('heart')     // "❤️" が返ればOK
```

---

## 🧪 簡単なテスト

### ブラウザコンソールでテスト
```javascript
// 1. EmojiServiceにアクセス
window.emojiService = emojiService;

// 2. 新しい絵文字をテスト
console.log('tea:', emojiService.getEmoji('tea'));          // ☕
console.log('memo:', emojiService.getEmoji('memo'));        // 📝
console.log('coffee:', emojiService.getEmoji('coffee'));    // ☕

// 3. 既存の絵文字をテスト（壊れていないか）
console.log('thumbsup:', emojiService.getEmoji('thumbsup')); // 👍
console.log('heart:', emojiService.getEmoji('heart'));       // ❤️

// 4. カスタム絵文字の優先順位をテスト
// （もし "memo-nya" というカスタム絵文字があれば、それが優先されるべき）
console.log('memo (with custom):', emojiService.getEmoji('memo')); // URLが返ればOK
```

### 実際のメッセージで確認
1. Slackで `:tea:` を含むメッセージを探す
2. アプリで表示
3. ☕ が表示されればOK

---

## 🔍 トラブルシューティング（1分で解決）

### 問題: 新しい絵文字が表示されない

**ステップ1: キャッシュをクリア**
```javascript
// ブラウザコンソール
localStorage.clear();
location.reload();
```

**ステップ2: STANDARD_EMOJISを確認**
```javascript
// ブラウザコンソール
console.table(STANDARD_EMOJIS);
// "tea" が存在するか確認
```

**ステップ3: emojiDataを確認**
```javascript
// ブラウザコンソール
$emojiData.subscribe(data => {
  console.log('Standard emojis:', Object.keys(data.standard).length);
  console.log('Has tea?', 'tea' in data.standard);
});
```

---

## 📋 チェックリスト

### 実装前
- [ ] このドキュメントを読んだ
- [ ] 関連ドキュメントの場所を確認した
- [ ] テスト環境を準備した

### 実装中
- [ ] STANDARD_EMOJISに絵文字を追加した
- [ ] コードをフォーマットした（Prettier）
- [ ] TypeScriptエラーがないことを確認した

### 実装後
- [ ] `npm run dev` で動作確認
- [ ] 新しい絵文字が表示されることを確認
- [ ] 既存の絵文字が壊れていないことを確認
- [ ] カスタム絵文字の優先順位を確認

### デプロイ前
- [ ] コードレビューを依頼
- [ ] テストを実行
- [ ] ドキュメントを更新

---

## 🔗 関連リンク

### ドキュメント
- **実装計画（詳細）:** `.serena/memories/standard_emoji_display_fix_implementation_plan_2025_10_28.md`
- **技術リファレンス:** `.serena/memories/standard_emoji_technical_reference_2025_10_28.md`
- **このガイド:** `.serena/memories/standard_emoji_quickstart_2025_10_28.md`

### コード
- **EmojiService:** `src/lib/services/emojiService.ts`
- **EmojiParser:** `src/lib/utils/emojiParser.ts`

### コマンド
```bash
# 開発サーバーを起動
npm run dev

# テストを実行
npm test

# コードをフォーマット
npm run format

# TypeScriptチェック
npm run check
```

---

## 💡 次のセッションで最初にすること

1. **このドキュメントを読む（1分）**
2. **実装計画を確認する（2分）**
   ```bash
   # Serenaメモリから読み込む
   # standard_emoji_display_fix_implementation_plan_2025_10_28
   ```
3. **前回の進捗を確認する（2分）**
   ```bash
   git log --oneline -5
   git diff HEAD~1
   ```
4. **現在のPhaseを確認する（1分）**
   - [ ] Phase 1（STANDARD_EMOJIS拡充）
   - [ ] Phase 2（命名規則バリエーション）
   - [ ] Phase 3（部分一致改善）
5. **作業を開始する**

---

## 🎯 各Phaseの所要時間

| Phase | 実装時間 | テスト時間 | 合計 | リスク |
|-------|---------|-----------|------|--------|
| Phase 1 | 30分 | 30分 | **1時間** | 🟢 5-10% |
| Phase 2 | 1時間 | 1時間 | **2時間** | 🟡 10-15% |
| Phase 3 | 2時間 | 2時間 | **4時間** | 🔴 30-40% |

**推奨:** Phase 1のみ実装し、ユーザーフィードバックを待つ

---

**最終更新:** 2025-10-28  
**ステータス:** ドキュメント作成完了、実装待ち