import './styles.css';
import App from './App.svelte';

console.log('[Main] Starting application initialization');

// Make sure the DOM is loaded
function initApp() {
  const targetElement = document.getElementById('app');
  
  if (!targetElement) {
    console.error('[Main] Could not find app element!');
    // Create a fallback element if needed
    const fallback = document.createElement('div');
    fallback.id = 'app';
    fallback.innerHTML = '<h1>Error: Application failed to mount</h1>';
    document.body.appendChild(fallback);
    return;
  }

  console.log('[Main] Mounting App to element:', targetElement);
  
  try {
    const app = new App({
      target: targetElement,
    });
    console.log('[Main] App mounted successfully');
    return app;
  } catch (error) {
    console.error('[Main] Failed to mount App:', error);
    targetElement.innerHTML = `<h1>Error: ${error.message}</h1>`;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM is already loaded
  initApp();
}

export default initApp;