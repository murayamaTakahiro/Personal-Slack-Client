# Standard Emoji Display Fix - Technical Reference

**作成日:** 2025-10-28  
**関連:** standard_emoji_display_fix_implementation_plan_2025_10_28.md

このドキュメントは、実装時に参照する技術的な詳細情報を提供します。

---

## 🏗️ アーキテクチャ詳細

### EmojiServiceのデータフロー

```
┌─────────────────────────────────────────────────────────┐
│                    EmojiService                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │          initialize(workspaceId)                  │  │
│  │  1. Load workspaceEmojiCache from IndexedDB      │  │
│  │  2. Load emojiData for current workspace         │  │
│  │  3. Check cache freshness (24h)                  │  │
│  │  4. Merge STANDARD_EMOJIS with cached data       │  │
│  │  5. Auto-detect quick reaction emojis            │  │
│  └──────────────────────────────────────────────────┘  │
│                          ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │             emojiData (Svelte Store)              │  │
│  │  {                                                │  │
│  │    custom: { [name: string]: url },              │  │
│  │    standard: { [name: string]: unicode },        │  │
│  │    lastFetched: timestamp                        │  │
│  │  }                                                │  │
│  └──────────────────────────────────────────────────┘  │
│                          ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │          getEmoji(name: string)                   │  │
│  │  1. Check data.custom[cleanName]                 │  │
│  │  2. Check data.standard[cleanName]        ← FIX  │  │
│  │  3. Check other workspaces                       │  │
│  │  4. Try hyphen/underscore conversion             │  │
│  │  5. Try partial matching (custom only)    ← FIX  │  │
│  │  6. Return null if not found                     │  │
│  └──────────────────────────────────────────────────┘  │
│                          ↓                               │
│         string (Unicode emoji or URL) | null             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                UI Components (6 files)                   │
│                                                          │
│  • MessageItem.svelte        - Display messages         │
│  • OptimizedMessageItem.svelte - Virtual scroll         │
│  • MessagePreview.svelte     - Message preview          │
│  • ReactionPicker.svelte     - Reaction UI              │
│  • EmojiAutocomplete.svelte  - Emoji search             │
│  • EmojiSettings.svelte      - Settings UI              │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 データ構造

### STANDARD_EMOJIS
```typescript
// 型定義
type StandardEmojis = Record<string, string>;

// 現在の構造（約150個）
const STANDARD_EMOJIS: StandardEmojis = {
  // Key: Slack emoji name (without colons)
  // Value: Unicode emoji character
  '+1': '👍',
  'thumbsup': '👍',
  'heart': '❤️',
  'fire': '🔥',
  // ...
};

// 修正後の構造（1000個以上）
const STANDARD_EMOJIS: StandardEmojis = {
  // 既存の絵文字
  '+1': '👍',
  'thumbsup': '👍',
  
  // Phase 1: 追加する絵文字
  'tea': '☕',
  'coffee': '☕',
  'memo': '📝',
  'books': '📚',
  
  // Phase 2: バリエーション
  'person_gesturing_ok': '🙆',
  'person-gesturing-ok': '🙆',  // ← ハイフン版
  'man_gesturing_ok': '🙆‍♂️',     // ← 男性版
  'man-gesturing-ok': '🙆‍♂️',     // ← 男性版（ハイフン）
  'woman_gesturing_ok': '🙆‍♀️',   // ← 女性版
  'woman-gesturing-ok': '🙆‍♀️',   // ← 女性版（ハイフン）
  // ...
};
```

### EmojiData (Svelte Store)
```typescript
interface EmojiData {
  custom: Record<string, string>;    // カスタム絵文字（URL）
  standard: Record<string, string>;  // 標準絵文字（Unicode）
  lastFetched?: number;              // キャッシュのタイムスタンプ
}

// 例
{
  custom: {
    'memo-nya': 'https://emoji.slack-edge.com/T1234/memo-nya/abc123.png',
    'kakuninshimasu': 'https://emoji.slack-edge.com/T1234/kakunin/def456.png'
  },
  standard: {
    'thumbsup': '👍',
    'heart': '❤️',
    'tea': '☕',        // ← Phase 1で追加
    'memo': '📝'        // ← Phase 1で追加
  },
  lastFetched: 1730102400000
}
```

### WorkspaceEmojiCache
```typescript
interface WorkspaceEmojiCache {
  [workspaceId: string]: EmojiData;
}

// 例
{
  'T1234ABCD': {
    custom: { 'memo-nya': 'https://...' },
    standard: { ... },
    lastFetched: 1730102400000
  },
  'T5678EFGH': {
    custom: { 'otsukaresamadesu': 'https://...' },
    standard: { ... },
    lastFetched: 1730102300000
  }
}
```

---

## 🔍 getEmojiメソッドの詳細

### 現在の実装（lines 604-750）

```typescript
getEmoji(name: string): string | null {
  const data = get(emojiData);
  
  // 1. クリーンアップ（コロン削除）
  let cleanName = name.replace(/^:/, '').replace(/:$/, '');
  
  // 2. スキントーン削除
  const skinToneMatch = cleanName.match(/^(.+)::?skin-tone-\d$/i);
  if (skinToneMatch) {
    cleanName = skinToneMatch[1];
  }
  
  // 3. カスタム絵文字を検索（優先）
  if (data.custom[cleanName]) {
    return data.custom[cleanName];
  }
  
  // 4. 標準絵文字を検索
  if (data.standard[cleanName]) {
    return data.standard[cleanName];  // ← ここで見つからない！
  }
  
  // 5. 他のワークスペースのカスタム絵文字
  const allWorkspaces = get(workspaceEmojiCache);
  for (const [workspaceId, workspaceData] of Object.entries(allWorkspaces)) {
    if (workspaceData.custom[cleanName]) {
      return workspaceData.custom[cleanName];
    }
  }
  
  // 6. ハイフン⇔アンダースコア変換を試行
  const hyphenToUnderscore = cleanName.replace(/-/g, '_');
  const underscoreToHyphen = cleanName.replace(/_/g, '-');
  
  if (data.standard[hyphenToUnderscore]) {
    return data.standard[hyphenToUnderscore];
  }
  if (data.standard[underscoreToHyphen]) {
    return data.standard[underscoreToHyphen];
  }
  // ... カスタム絵文字でも同様の変換試行
  
  // 7. バリエーション試行
  const variations = [
    cleanName.replace('amadesu', 'ama'),
    cleanName.replace('desu', ''),
    cleanName + '2',
    // ...
  ];
  
  for (const variant of variations) {
    if (data.custom[variant]) {
      return data.custom[variant];
    }
    if (data.standard[variant]) {
      return data.standard[variant];
    }
  }
  
  // 8. 部分一致検索（カスタム絵文字のみ）
  const partialMatches = cleanName.length > 3 
    ? Object.keys(data.custom).filter(key => {
        return (key.length > 3 && key.includes(cleanName)) || 
               (cleanName.length > 3 && key.length > 3 && cleanName.includes(key));
      }) 
    : [];
  
  if (partialMatches.length > 0) {
    return data.custom[partialMatches[0]];
  }
  
  // 9. 見つからない
  return null;
}
```

### 問題箇所の特定

#### 問題1: ステップ4で失敗
```typescript
// ステップ4: 標準絵文字を検索
if (data.standard[cleanName]) {
  return data.standard[cleanName];
}

// 例: cleanName = "tea"
// data.standard = { 'thumbsup': '👍', 'heart': '❤️' }
//                  ↑ "tea" が存在しない！
// → undefined → if文が false → 次のステップへ
```

**解決策（Phase 1）:**
```typescript
// STANDARD_EMOJISに "tea" を追加
const STANDARD_EMOJIS = {
  // ...
  'tea': '☕',  // ← これを追加
  // ...
};

// すると...
// data.standard = { 'thumbsup': '👍', 'heart': '❤️', 'tea': '☕' }
//                                                      ↑ 存在する！
// → if文が true → '☕' を返す
```

#### 問題2: ステップ6でも失敗
```typescript
// ステップ6: ハイフン⇔アンダースコア変換
const hyphenToUnderscore = cleanName.replace(/-/g, '_');
// 例: "man-gesturing-ok" → "man_gesturing_ok"

if (data.standard[hyphenToUnderscore]) {
  return data.standard[hyphenToUnderscore];
}

// data.standard = { 'person_gesturing_ok': '🙆' }
//                   ↑ "man_gesturing_ok" は存在しない！
// → undefined → 見つからない
```

**解決策（Phase 2）:**
```typescript
// STANDARD_EMOJISに両方を追加
const STANDARD_EMOJIS = {
  // 既存
  'person_gesturing_ok': '🙆',
  
  // Phase 2で追加
  'person-gesturing-ok': '🙆',     // ハイフン版
  'man_gesturing_ok': '🙆‍♂️',       // 男性版（アンダースコア）
  'man-gesturing-ok': '🙆‍♂️',       // 男性版（ハイフン）
  'woman_gesturing_ok': '🙆‍♀️',     // 女性版（アンダースコア）
  'woman-gesturing-ok': '🙆‍♀️',     // 女性版（ハイフン）
};

// すると...
// cleanName = "man-gesturing-ok"
// data.standard["man-gesturing-ok"] = "🙆‍♂️"  ← 存在する！
// → ステップ4で直接見つかる（ステップ6は不要に）
```

---

## 🎨 Unicode絵文字の扱い

### 基本的なUnicode絵文字
```typescript
'heart': '❤️',           // U+2764 + U+FE0F
'thumbsup': '👍',        // U+1F44D
'fire': '🔥',            // U+1F525
```

### ZWJ（Zero-Width Joiner）を使った絵文字
```typescript
// 性別特定版は ZWJ + 性別記号 で構成される
'man_gesturing_ok': '🙆‍♂️',
//                   ↑   ↑ ↑
//                   |   | └─ U+2642 (♂️ 男性記号)
//                   |   └─── U+200D (ZWJ)
//                   └─────── U+1F646 (🙆 person gesturing OK)

'woman_gesturing_ok': '🙆‍♀️',
//                     ↑   ↑ ↑
//                     |   | └─ U+2640 (♀️ 女性記号)
//                     |   └─── U+200D (ZWJ)
//                     └─────── U+1F646 (🙆 person gesturing OK)
```

### スキントーン修飾子
```typescript
// Slackはスキントーンを "::skin-tone-N" で表現
// 例: ":thumbsup::skin-tone-2:"

// getEmojiメソッドでスキントーンを削除
const skinToneMatch = cleanName.match(/^(.+)::?skin-tone-\d$/i);
if (skinToneMatch) {
  cleanName = skinToneMatch[1];  // "thumbsup"
}

// その後、通常の絵文字として検索
```

---

## 🧩 Phase 1: 追加する絵文字の完全リスト

### 優先度: 高（最も一般的）

```typescript
// 食べ物・飲み物 (30個)
'tea': '☕', 'coffee': '☕', 'cake': '🍰', 'pizza': '🍕',
'hamburger': '🍔', 'fries': '🍟', 'popcorn': '🍿', 'beer': '🍺',
'wine_glass': '🍷', 'cocktail': '🍹', 'tropical_drink': '🍹',
'champagne': '🍾', 'sake': '🍶', 'ice_cream': '🍨', 'doughnut': '🍩',
'cookie': '🍪', 'chocolate_bar': '🍫', 'candy': '🍬', 'lollipop': '🍭',
'bread': '🍞', 'croissant': '🥐', 'baguette_bread': '🥖',
'pretzel': '🥨', 'bagel': '🥯', 'pancakes': '🥞', 'waffle': '🧇',
'cheese': '🧀', 'meat_on_bone': '🍖', 'poultry_leg': '🍗',
'egg': '🥚',

// オブジェクト・文房具 (25個)
'memo': '📝', 'pencil': '✏️', 'pen': '🖊️', 'paintbrush': '🖌️',
'crayon': '🖍️', 'books': '📚', 'book': '📖', 'bookmark': '🔖',
'notebook': '📓', 'ledger': '📒', 'page_with_curl': '📃',
'scroll': '📜', 'newspaper': '📰', 'calendar': '📅',
'date': '📆', 'card_index': '📇', 'chart_increasing': '📈',
'chart_decreasing': '📉', 'clipboard': '📋', 'pushpin': '📌',
'paperclip': '📎', 'link': '🔗', 'scissors': '✂️',
'triangular_ruler': '📐', 'straight_ruler': '📏',

// 通信・技術 (20個)
'email': '📧', 'envelope': '✉️', 'incoming_envelope': '📨',
'envelope_with_arrow': '📩', 'outbox_tray': '📤', 'inbox_tray': '📥',
'package': '📦', 'mailbox': '📪', 'mailbox_closed': '📪',
'mailbox_with_mail': '📬', 'mailbox_with_no_mail': '📭',
'postbox': '📮', 'telephone': '☎️', 'telephone_receiver': '📞',
'pager': '📟', 'fax': '📠', 'battery': '🔋', 'electric_plug': '🔌',
'laptop': '💻', 'desktop_computer': '🖥️',

// 自然・天気 (20個)
'sunny': '☀️', 'cloud': '☁️', 'partly_sunny': '⛅',
'thunder_cloud_rain': '⛈️', 'sun_small_cloud': '🌤️',
'sun_behind_cloud': '⛅', 'sun_behind_rain_cloud': '🌦️',
'rain_cloud': '🌧️', 'snow_cloud': '🌨️', 'lightning': '⚡',
'snowflake': '❄️', 'snowman': '⛄', 'rainbow': '🌈',
'umbrella': '☂️', 'umbrella_with_rain_drops': '☔',
'fire': '🔥', 'droplet': '💧', 'ocean': '🌊',
'tornado': '🌪️', 'fog': '🌫️',

// 乗り物 (15個)
'car': '🚗', 'taxi': '🚕', 'bus': '🚌', 'train': '🚆',
'bullettrain_side': '🚄', 'airplane': '✈️', 'rocket': '🚀',
'helicopter': '🚁', 'ship': '🚢', 'boat': '⛵', 'sailboat': '⛵',
'bike': '🚲', 'bicycle': '🚲', 'scooter': '🛴', 'motorcycle': '🏍️',

// 場所 (10個)
'house': '🏠', 'house_with_garden': '🏡', 'office': '🏢',
'hospital': '🏥', 'school': '🏫', 'hotel': '🏨', 'bank': '🏦',
'convenience_store': '🏪', 'department_store': '🏬',
'factory': '🏭',
```

### 合計: 約120個（Phase 1）

---

## 🔧 実装のベストプラクティス

### 1. 絵文字の追加順序
```typescript
const STANDARD_EMOJIS: Record<string, string> = {
  // 既存の絵文字（変更しない）
  '+1': '👍',
  'thumbsup': '👍',
  // ... 既存の約150個 ...
  
  // ========================================
  // Phase 1: 追加する標準絵文字
  // ========================================
  
  // --- 食べ物・飲み物 ---
  'tea': '☕',
  'coffee': '☕',
  // ...
  
  // --- オブジェクト・文房具 ---
  'memo': '📝',
  'pencil': '✏️',
  // ...
  
  // --- 通信・技術 ---
  'email': '📧',
  'envelope': '✉️',
  // ...
  
  // --- 自然・天気 ---
  'sunny': '☀️',
  'cloud': '☁️',
  // ...
  
  // --- 乗り物 ---
  'car': '🚗',
  'taxi': '🚕',
  // ...
  
  // --- 場所 ---
  'house': '🏠',
  'office': '🏢',
  // ...
};
```

### 2. カテゴリ別のコメント
```typescript
// カテゴリごとにコメントを追加して可読性を向上
const STANDARD_EMOJIS: Record<string, string> = {
  // ========================================
  // Expressions & Gestures
  // ========================================
  '+1': '👍',
  'thumbsup': '👍',
  '-1': '👎',
  'thumbsdown': '👎',
  'clap': '👏',
  // ...
  
  // ========================================
  // Food & Drink (Phase 1)
  // ========================================
  'tea': '☕',
  'coffee': '☕',
  // ...
};
```

### 3. 重複の回避
```typescript
// 同じUnicode文字を指す異なる名前はOK
'tea': '☕',
'coffee': '☕',  // 同じ絵文字だが、両方とも有効

// ただし、以下のような重複は避ける
// 'tea': '☕',
// 'tea': '🍵',  // ❌ キーの重複！TypeScriptがエラー
```

### 4. TypeScript型チェック
```typescript
// 型定義を明示的に指定
const STANDARD_EMOJIS: Record<string, string> = {
  'tea': '☕',        // ✅ 正しい
  'coffee': '☕',     // ✅ 正しい
  // 'invalid': 123, // ❌ TypeScriptエラー（stringではない）
};
```

---

## 🧪 テストケースの詳細

### Phase 1のテストケース

```typescript
describe('EmojiService - Phase 1', () => {
  beforeEach(() => {
    // テスト環境をクリーンアップ
    emojiData.set({
      custom: {},
      standard: STANDARD_EMOJIS
    });
  });
  
  // Test 1: 新しい標準絵文字（基本）
  test('getEmoji returns new standard emoji: tea', () => {
    const result = emojiService.getEmoji('tea');
    expect(result).toBe('☕');
  });
  
  test('getEmoji returns new standard emoji: memo', () => {
    const result = emojiService.getEmoji('memo');
    expect(result).toBe('📝');
  });
  
  test('getEmoji returns new standard emoji: coffee', () => {
    const result = emojiService.getEmoji('coffee');
    expect(result).toBe('☕');
  });
  
  // Test 2: コロン付きでも動作
  test('getEmoji handles colons: :tea:', () => {
    const result = emojiService.getEmoji(':tea:');
    expect(result).toBe('☕');
  });
  
  // Test 3: カスタム絵文字の優先順位
  test('custom emoji takes precedence over standard', () => {
    // カスタム絵文字 "memo" を設定
    emojiData.set({
      custom: {
        'memo': 'https://example.com/custom-memo.png'
      },
      standard: STANDARD_EMOJIS
    });
    
    const result = emojiService.getEmoji('memo');
    expect(result).toBe('https://example.com/custom-memo.png');
    expect(result).not.toBe('📝');
  });
  
  // Test 4: 存在しない絵文字
  test('getEmoji returns null for nonexistent emoji', () => {
    const result = emojiService.getEmoji('this-emoji-does-not-exist-xyz');
    expect(result).toBeNull();
  });
  
  // Test 5: 既存の絵文字が壊れないこと
  test('existing emojis still work', () => {
    expect(emojiService.getEmoji('thumbsup')).toBe('👍');
    expect(emojiService.getEmoji('+1')).toBe('👍');
    expect(emojiService.getEmoji('heart')).toBe('❤️');
    expect(emojiService.getEmoji('fire')).toBe('🔥');
  });
  
  // Test 6: 大文字・小文字（通常は小文字のみ）
  test('emoji names are case-sensitive', () => {
    const lowercase = emojiService.getEmoji('tea');
    const uppercase = emojiService.getEmoji('TEA');
    
    expect(lowercase).toBe('☕');
    expect(uppercase).toBeNull();  // Slackは小文字のみ
  });
});
```

### Phase 2のテストケース

```typescript
describe('EmojiService - Phase 2', () => {
  // Test 7: ハイフン形式
  test('getEmoji handles hyphenated names', () => {
    expect(emojiService.getEmoji('man-gesturing-ok')).toBe('🙆‍♂️');
    expect(emojiService.getEmoji('woman-raising-hand')).toBe('🙋‍♀️');
  });
  
  // Test 8: アンダースコア形式（既存）
  test('getEmoji handles underscore names', () => {
    expect(emojiService.getEmoji('person_gesturing_ok')).toBe('🙆');
    expect(emojiService.getEmoji('person_raising_hand')).toBe('🙋');
  });
  
  // Test 9: 性別特定版
  test('getEmoji handles gendered variants', () => {
    // 男性版
    expect(emojiService.getEmoji('man_gesturing_ok')).toBe('🙆‍♂️');
    expect(emojiService.getEmoji('man-gesturing-ok')).toBe('🙆‍♂️');
    
    // 女性版
    expect(emojiService.getEmoji('woman_gesturing_ok')).toBe('🙆‍♀️');
    expect(emojiService.getEmoji('woman-gesturing-ok')).toBe('🙆‍♀️');
    
    // 性別中立版
    expect(emojiService.getEmoji('person_gesturing_ok')).toBe('🙆');
    expect(emojiService.getEmoji('person-gesturing-ok')).toBe('🙆');
  });
  
  // Test 10: 変換ロジックが不要になることを確認
  test('direct lookup is faster than conversion', () => {
    const startDirect = performance.now();
    emojiService.getEmoji('man-gesturing-ok');  // 直接ヒット
    const endDirect = performance.now();
    
    // 変換が必要なケース（比較のため、辞書から削除してテスト）
    const tempEmojis = { ...STANDARD_EMOJIS };
    delete tempEmojis['man-gesturing-ok'];
    
    const startConversion = performance.now();
    // 変換ロジックが必要
    const endConversion = performance.now();
    
    expect(endDirect - startDirect).toBeLessThan(endConversion - startConversion);
  });
});
```

---

## 📊 パフォーマンス測定

### ベンチマークコード

```typescript
// src/lib/services/__benchmark__/emojiService.bench.ts

import { emojiService } from '../emojiService';

describe('EmojiService Performance', () => {
  const ITERATIONS = 10000;
  
  test('getEmoji performance: direct hit', () => {
    const emojis = ['thumbsup', 'heart', 'fire', 'tea', 'memo'];
    
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      emojis.forEach(emoji => emojiService.getEmoji(emoji));
    }
    const end = performance.now();
    
    const avgTime = (end - start) / (ITERATIONS * emojis.length);
    console.log(`Average time per getEmoji (direct hit): ${avgTime.toFixed(4)}ms`);
    
    // 期待値: <0.01ms（10マイクロ秒以下）
    expect(avgTime).toBeLessThan(0.01);
  });
  
  test('getEmoji performance: with conversion', () => {
    const emojis = ['man-gesturing-ok', 'woman-raising-hand'];
    
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      emojis.forEach(emoji => emojiService.getEmoji(emoji));
    }
    const end = performance.now();
    
    const avgTime = (end - start) / (ITERATIONS * emojis.length);
    console.log(`Average time per getEmoji (with conversion): ${avgTime.toFixed(4)}ms`);
    
    // Phase 2実装後は、変換が不要になるため高速化
    // Phase 1: ~0.02ms（変換が必要）
    // Phase 2: <0.01ms（直接ヒット）
  });
  
  test('STANDARD_EMOJIS memory usage', () => {
    const sizeInBytes = JSON.stringify(STANDARD_EMOJIS).length;
    const sizeInKB = sizeInBytes / 1024;
    
    console.log(`STANDARD_EMOJIS size: ${sizeInKB.toFixed(2)} KB`);
    
    // Phase 1: ~30-40 KB
    // Phase 2: ~80-100 KB
    // 期待値: <150 KB
    expect(sizeInKB).toBeLessThan(150);
  });
});
```

---

## 🐛 デバッグ方法

### ログの追加（開発時のみ）

```typescript
getEmoji(name: string): string | null {
  const data = get(emojiData);
  let cleanName = name.replace(/^:/, '').replace(/:$/, '');
  
  // デバッグログ（開発時のみ）
  if (import.meta.env.DEV) {
    console.log('[EmojiService][DEBUG] Looking up:', cleanName);
  }
  
  // カスタム絵文字を検索
  if (data.custom[cleanName]) {
    if (import.meta.env.DEV) {
      console.log('[EmojiService][DEBUG] Found in custom:', cleanName);
    }
    return data.custom[cleanName];
  }
  
  // 標準絵文字を検索
  if (data.standard[cleanName]) {
    if (import.meta.env.DEV) {
      console.log('[EmojiService][DEBUG] Found in standard:', cleanName);
    }
    return data.standard[cleanName];
  }
  
  // ... 残りのロジック
  
  if (import.meta.env.DEV) {
    console.log('[EmojiService][DEBUG] Not found:', cleanName);
  }
  return null;
}
```

### ブラウザでのデバッグ

```javascript
// ブラウザのコンソールで実行
// 1. 現在のemojiDataを確認
$emojiData.subscribe(data => {
  console.log('Custom emojis:', Object.keys(data.custom).length);
  console.log('Standard emojis:', Object.keys(data.standard).length);
  console.table(data.standard);
});

// 2. 特定の絵文字を検索
window.emojiService = emojiService;
console.log('tea:', emojiService.getEmoji('tea'));
console.log('memo:', emojiService.getEmoji('memo'));
console.log('man-gesturing-ok:', emojiService.getEmoji('man-gesturing-ok'));

// 3. STANDARD_EMOJISの内容を確認
console.table(STANDARD_EMOJIS);
```

---

## 🚨 トラブルシューティング

### 問題1: 新しい絵文字が表示されない

**症状:**
```
input: ":tea:"
expected: ☕
actual: :tea: (テキスト)
```

**チェックリスト:**
1. STANDARD_EMOJISに追加したか？
   ```typescript
   console.log(STANDARD_EMOJIS['tea']);  // "☕" が表示されるべき
   ```

2. emojiDataに反映されているか？
   ```typescript
   const data = get(emojiData);
   console.log(data.standard['tea']);  // "☕" が表示されるべき
   ```

3. キャッシュが古くないか？
   ```typescript
   // キャッシュをクリア
   await saveToStore('emojiData', null);
   await emojiService.initialize();
   ```

4. 絵文字名が正しいか？
   ```typescript
   // Slackの絵文字名を確認
   // 例: "tea" か "teacup" か？
   ```

### 問題2: カスタム絵文字が優先されない

**症状:**
```
カスタム絵文字 "memo-nya" が存在するのに、標準絵文字 "memo" が表示される
```

**原因:**
検索順序が間違っている

**解決策:**
```typescript
// getEmojiメソッドの検索順序を確認
// 1. カスタム絵文字（現在のワークスペース） ← これが最優先
// 2. 標準絵文字
// 3. 他のワークスペースのカスタム絵文字

// カスタム絵文字が優先されるはず
if (data.custom[cleanName]) {
  return data.custom[cleanName];  // ← ここで返される
}

if (data.standard[cleanName]) {
  return data.standard[cleanName];  // ← ここには到達しない
}
```

### 問題3: パフォーマンスが劣化した

**症状:**
メッセージ表示が遅くなった

**原因:**
- STANDARD_EMOJISが大きすぎる
- 部分一致検索が遅い

**診断:**
```typescript
// パフォーマンス測定
console.time('getEmoji');
emojiService.getEmoji('tea');
console.timeEnd('getEmoji');  // 0.01ms以下であるべき

// STANDARD_EMOJISのサイズ確認
const size = JSON.stringify(STANDARD_EMOJIS).length;
console.log('STANDARD_EMOJIS size:', size / 1024, 'KB');  // <150 KB
```

**解決策:**
- Phase 3（部分一致）の実装を見直す
- 不要な絵文字を削除

---

**最終更新:** 2025-10-28  
**関連ドキュメント:** standard_emoji_display_fix_implementation_plan_2025_10_28.md