# 初期化問題クイックリファレンス

## 🚨 白い画面が表示されたら

### 1. 即座の確認事項（30秒）
```bash
# コンソールでエラー確認
F12 → Console → エラーメッセージを確認

# よくあるエラー
"Cannot read property of undefined" → 初期化順序の問題
"Module not found" → インポートエラー
"Timeout" → 初期化タイムアウト
```

### 2. 基本的な対処法（2分）
```bash
# キャッシュクリアして再起動
rm -rf node_modules/.vite
npm run dev

# 強制リロード
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

### 3. デバッグモード起動（5分）
```javascript
// main.tsに追加
window.DEBUG_INIT = true;

// App.svelteに追加
if (window.DEBUG_INIT) {
  console.log('[DEBUG] Init stage:', initStage);
  console.log('[DEBUG] Error:', initError);
}
```

## ⚡ よくある原因と解決策

### 原因1: モジュールレベルの初期化
```javascript
// ❌ 悪い例
export const service = new Service(); // 即座に実行される

// ✅ 良い例
let service: Service | null = null;
export function getService(): Service {
  if (!service) service = new Service();
  return service;
}
```

### 原因2: 循環依存
```javascript
// ❌ 悪い例
// fileA.ts
import { b } from './fileB';
export const a = b + 1;

// fileB.ts
import { a } from './fileA';
export const b = a + 1;

// ✅ 良い例
// 初期化を遅延させる
export function getA() { return b() + 1; }
export function getB() { return a() + 1; }
```

### 原因3: 同期的な待機
```javascript
// ❌ 悪い例
const data = await longRunningOperation(); // タイムアウトなし

// ✅ 良い例
const data = await Promise.race([
  longRunningOperation(),
  timeout(5000) // 5秒でタイムアウト
]);
```

## 🛠️ 必須の初期化パターン

### パターン1: タイムアウト付き初期化
```typescript
async function initWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  } catch (error) {
    console.warn('Init failed, using fallback:', error);
    return fallback;
  }
}
```

### パターン2: 段階的初期化
```typescript
// App.svelte
onMount(async () => {
  // 1. 即座にUIを表示
  appReady = true;
  
  // 2. コア機能を初期化（タイムアウト付き）
  await initCore().catch(console.error);
  
  // 3. 追加機能をバックグラウンドで
  initExtras(); // awaitしない
});
```

### パターン3: エラーバウンダリ
```typescript
try {
  await riskyInitialization();
} catch (error) {
  console.error('Init failed:', error);
  // デフォルト値で継続
  useDefaults();
}
```

## 📝 チェックリスト

### 新機能追加時
- [ ] モジュールレベルで初期化していない？
- [ ] 外部依存を考慮している？
- [ ] タイムアウトを設定している？
- [ ] エラーハンドリングがある？
- [ ] デフォルト値を用意している？

### デバッグ時
- [ ] コンソールログを確認した？
- [ ] ネットワークタブを確認した？
- [ ] localStorageをクリアした？
- [ ] 別ブラウザで試した？
- [ ] シークレットモードで試した？

## 🔍 デバッグコマンド集

```javascript
// コンソールで実行

// 1. 現在の初期化状態を確認
console.table({
  DOM: document.readyState,
  Storage: !!localStorage,
  Tauri: '__TAURI__' in window,
  Settings: !!window.settings
});

// 2. パフォーマンス計測
performance.mark('init-start');
// ... 初期化処理 ...
performance.mark('init-end');
performance.measure('init', 'init-start', 'init-end');
console.log(performance.getEntriesByType('measure'));

// 3. メモリ使用量確認
console.log({
  used: performance.memory.usedJSHeapSize / 1048576,
  total: performance.memory.totalJSHeapSize / 1048576
});

// 4. 初期化タイミング確認
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(`${entry.name}: ${entry.startTime}ms`);
  }
}).observe({ entryTypes: ['measure'] });
```

## 💊 緊急対処法

### アプリが全く起動しない場合
```html
<!-- index.htmlに追加 -->
<script>
  // 緊急フォールバック
  window.addEventListener('error', (e) => {
    if (!document.getElementById('emergency-ui')) {
      document.body.innerHTML = `
        <div id="emergency-ui">
          <h1>Loading Error</h1>
          <p>${e.message}</p>
          <button onclick="location.reload()">Reload</button>
        </div>
      `;
    }
  });
  
  // 10秒後に強制表示
  setTimeout(() => {
    if (!document.querySelector('.app-loaded')) {
      console.error('App failed to load in 10 seconds');
      document.body.innerHTML = '<h1>Timeout - Please reload</h1>';
    }
  }, 10000);
</script>
```

## 🎯 最重要ルール

1. **コンストラクタで外部依存しない**
2. **すべての非同期処理にタイムアウトを設定**
3. **エラーでもUIを表示する**
4. **デフォルト値を必ず用意**
5. **初期化は段階的に実行**

## 📊 パフォーマンス目標

| 段階 | 目標時間 | 内容 |
|------|----------|------|
| DOM Ready | < 100ms | HTML/CSS表示 |
| 基本UI | < 500ms | ローディング画面 |
| コア機能 | < 2s | 主要機能利用可能 |
| 完全初期化 | < 5s | すべての機能 |

## 🔗 関連ドキュメント

- [WHITE_SCREEN_DEEP_ANALYSIS.md](./WHITE_SCREEN_DEEP_ANALYSIS.md) - 詳細な問題分析
- [INITIALIZATION_BEST_PRACTICES.md](./INITIALIZATION_BEST_PRACTICES.md) - ベストプラクティス集
- [COLD_START_FIX_COMPLETE.md](./COLD_START_FIX_COMPLETE.md) - コールドスタート問題の解決

---

**最終更新**: 2025-09-12  
**バージョン**: 1.0.0

> 💡 **ヒント**: 問題が解決しない場合は、`git log --oneline | grep "fix:"` で過去の修正を確認