import './styles.css';
import App from './App.svelte';

// Ensure DOM is fully loaded before initializing the app
function initializeApp() {
  const targetElement = document.getElementById('app');
  
  if (!targetElement) {
    console.error('[Main] Critical error: Could not find app element in DOM');
    // Create a fallback element if app div is missing
    const fallback = document.createElement('div');
    fallback.id = 'app';
    document.body.appendChild(fallback);
    console.warn('[Main] Created fallback app element');
    
    // Try to initialize with the fallback
    return new App({
      target: fallback,
    });
  }
  
  console.log('[Main] Initializing Svelte app with target element:', targetElement);
  
  try {
    const app = new App({
      target: targetElement,
    });
    console.log('[Main] Svelte app initialized successfully');
    return app;
  } catch (error) {
    console.error('[Main] Failed to initialize Svelte app:', error);
    // Still try to show a basic app even with errors
    try {
      // Try one more time with a simpler initialization
      const app = new App({
        target: targetElement,
      });
      console.warn('[Main] Svelte app initialized with errors');
      return app;
    } catch (secondError) {
      // Show error message to user only if both attempts fail
      targetElement.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 2rem; text-align: center; background: #f8f9fa;">
          <h1 style="color: #dc3545; margin-bottom: 1rem;">Failed to Initialize Application</h1>
          <p style="color: #6c757d; margin-bottom: 2rem;">An error occurred while starting the Personal Slack Client.</p>
          <pre style="background: #fff; padding: 1rem; border: 1px solid #dee2e6; border-radius: 4px; max-width: 600px; overflow: auto;">${error instanceof Error ? error.message : 'Unknown error'}</pre>
          <button onclick="window.location.reload()" style="margin-top: 2rem; padding: 0.5rem 1rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Reload Page</button>
        </div>
      `;
      throw secondError;
    }
  }
}

// Wait for DOM to be ready
let app: any;

// ⚠️ 重要：この10msの遅延を絶対に削除・変更しないこと！
// Tauri/WebView2の初期化に必要な時間です。
// 削除すると白い画面で起動に失敗します。
// 詳細は CRITICAL_STARTUP_NOTES.md を参照
if (document.readyState === 'loading') {
  console.log('[Main] DOM is still loading, waiting for DOMContentLoaded event...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Main] DOMContentLoaded event fired, initializing app...');
    // ⚠️ CRITICAL: DO NOT REMOVE THIS DELAY
    setTimeout(() => {
      app = initializeApp();
    }, 10);
  });
} else {
  console.log('[Main] DOM is already loaded, initializing app with small delay...');
  // ⚠️ CRITICAL: DO NOT REMOVE THIS DELAY
  setTimeout(() => {
    app = initializeApp();
  }, 10);
}

export default app;