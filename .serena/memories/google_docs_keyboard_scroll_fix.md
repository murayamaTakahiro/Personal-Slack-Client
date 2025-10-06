# Google Docs/Sheets キーボードスクロール修正

**修正完了日**: 2025-10-06  
**問題**: Google Docs/Sheetsのプレビューでキーボードによるスクロールができない

## 🔍 問題の原因

LightboxのスクロールハンドラーにGoogle Docs/Sheets用の処理が**完全に欠けていた**。

他のファイルタイプ（PDF、Image、Text、CSV、Excel、Word、Office）には全て対応していたが、`isGoogleFile`の分岐が存在しなかった。

## 📝 修正内容

**ファイル**: `src/lib/components/files/Lightbox.svelte`

### 修正した関数（6つ）:

#### 1. scrollUp() (306-312行目)
```typescript
} else if (isGoogleFile) {
  // For Google Docs/Sheets, scroll the thumbnail wrapper
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollTop = Math.max(0, wrapper.scrollTop - scrollSpeed);
  }
}
```

#### 2. scrollDown() (379-387行目)
```typescript
} else if (isGoogleFile) {
  // For Google Docs/Sheets, scroll the thumbnail wrapper
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollTop = Math.min(
      wrapper.scrollHeight - wrapper.clientHeight,
      wrapper.scrollTop + scrollSpeed
    );
  }
}
```

#### 3. scrollLeft() (444-450行目)
```typescript
} else if (isGoogleFile) {
  // For Google Docs/Sheets, scroll the thumbnail wrapper horizontally
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - scrollSpeed);
  }
}
```

#### 4. scrollRight() (527-535行目)
```typescript
} else if (isGoogleFile) {
  // For Google Docs/Sheets, scroll the thumbnail wrapper horizontally
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollLeft = Math.min(
      wrapper.scrollWidth - wrapper.clientWidth,
      wrapper.scrollLeft + scrollSpeed
    );
  }
}
```

#### 5. scrollPageUp() (580-585行目)
```typescript
} else if (isGoogleFile) {
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollTop = Math.max(0, wrapper.scrollTop - wrapper.clientHeight);
  }
}
```

#### 6. scrollPageDown() (650-657行目)
```typescript
} else if (isGoogleFile) {
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollTop = Math.min(
      wrapper.scrollHeight - wrapper.clientHeight,
      wrapper.scrollTop + wrapper.clientHeight
    );
  }
}
```

#### 7. scrollToTop() (691-696行目)
```typescript
} else if (isGoogleFile) {
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollTop = 0;
  }
}
```

#### 8. scrollToBottom() (742-747行目)
```typescript
} else if (isGoogleFile) {
  const wrapper = containerDiv?.querySelector('.google-thumbnail-wrapper');
  if (wrapper) {
    wrapper.scrollTop = wrapper.scrollHeight - wrapper.clientHeight;
  }
}
```

## 🎯 対応したキーボード操作

### 縦スクロール
- **↑ / k**: 上にスクロール
- **↓ / j**: 下にスクロール
- **PageUp**: 1ページ分上にスクロール
- **PageDown**: 1ページ分下にスクロール
- **Home**: 最上部にスクロール
- **End**: 最下部にスクロール

### 横スクロール
- **h**: 左にスクロール
- **l**: 右にスクロール

### ズーム（既存機能）
- **+**: ズームイン
- **-**: ズームアウト
- **0**: リセット

### その他
- **ダブルクリック**: ズームトグル
- **Esc**: Lightboxを閉じる
- **d**: ダウンロード

## 🔧 技術的なポイント

### スクロール対象要素
```css
.google-thumbnail-wrapper {
  overflow: auto;
  max-height: calc(90vh - 8rem);
}
```

この要素を`querySelector`で取得してスクロールを制御。

### スクロール速度
```typescript
let scrollSpeed = 50; // pixels per key press
```

他のファイルタイプと同じ速度で統一。

### 境界チェック
- **上方向**: `Math.max(0, scrollTop - scrollSpeed)`
- **下方向**: `Math.min(scrollHeight - clientHeight, scrollTop + scrollSpeed)`

スクロール範囲を超えないように制御。

## ✅ テスト項目

### 基本スクロール
- ✅ ↑キーで上にスクロール
- ✅ ↓キーで下にスクロール
- ✅ hキーで左にスクロール
- ✅ lキーで右にスクロール

### ページスクロール
- ✅ PageUpで1ページ分上にスクロール
- ✅ PageDownで1ページ分下にスクロール

### ジャンプ
- ✅ Homeで最上部にジャンプ
- ✅ Endで最下部にジャンプ

### vimキーバインド
- ✅ jキーで下にスクロール
- ✅ kキーで上にスクロール

### マウス操作（既存）
- ✅ マウスホイールでスクロール
- ✅ スクロールバーをドラッグ

## 🎉 結果

**完全なキーボードナビゲーションサポート**を実現！

- マウス操作: ✅ 動作（前から）
- キーボード操作: ✅ 動作（今回修正）
- ズーム: ✅ 動作（既存）

他のファイルタイプと同等の操作性を提供。

---

**修正完了日**: 2025-10-06  
**作成者**: Claude (Serena MCP)
