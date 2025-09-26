<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  export let fallback = 'Something went wrong';
  export let showDetails = false;
  
  let hasError = false;
  let errorMessage = '';
  let errorStack = '';
  
  function handleError(event: ErrorEvent) {
    // Prevent cascading errors
    if (hasError) return;

    // Check if this error originated from this error boundary's children
    const target = event.target as HTMLElement;
    const errorBoundaryElement = target?.closest?.('.error-boundary-wrapper');
    if (!errorBoundaryElement) return;

    hasError = true;
    errorMessage = event.error?.message || 'Unknown error';
    errorStack = event.error?.stack || '';

    // Log errors appropriately
    const logMessage = `[ErrorBoundary] Caught error in "${fallback}":`;
    if (import.meta.env.DEV) {
      console.error(logMessage, event.error);
    } else {
      console.warn(logMessage, errorMessage);
    }

    // Prevent the error from bubbling up
    event.preventDefault();
    event.stopPropagation();
  }
  
  function handleRejection(event: PromiseRejectionEvent) {
    // Prevent cascading errors
    if (hasError) return;
    
    hasError = true;
    errorMessage = event.reason?.message || event.reason || 'Promise rejected';
    errorStack = event.reason?.stack || '';
    
    // Log promise rejections appropriately
    const logMessage = `[ErrorBoundary] Unhandled promise rejection in "${fallback}":`;
    if (import.meta.env.DEV) {
      console.error(logMessage, event.reason);
    } else {
      console.warn(logMessage, errorMessage);
    }
    
    // Prevent the error from bubbling up
    event.preventDefault();
  }
  
  // Handle Svelte component errors
  function handleSvelteError(error: Error, info?: any) {
    if (hasError) return;
    
    hasError = true;
    errorMessage = error?.message || 'Svelte component error';
    errorStack = error?.stack || '';
    
    const logMessage = `[ErrorBoundary] Svelte error in "${fallback}":`;
    if (import.meta.env.DEV) {
      console.error(logMessage, error, info);
    } else {
      console.warn(logMessage, errorMessage);
    }
  }
  
  function retry() {
    hasError = false;
    errorMessage = '';
    errorStack = '';
    // Force re-render of children
    window.location.reload();
  }
  
  function reset() {
    hasError = false;
    errorMessage = '';
    errorStack = '';
  }
  
  onMount(() => {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
  });
  
  onDestroy(() => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  });
</script>

{#if hasError}
  <div class="error-boundary" role="alert" aria-live="assertive">
    <div class="error-icon">
      ⚠️
    </div>
    <h3>Component Error</h3>
    <p class="error-message">{fallback}</p>
    
    {#if showDetails && errorMessage}
      <details class="error-details">
        <summary>Technical details (click to expand)</summary>
        <p class="error-text">{errorMessage}</p>
        {#if import.meta.env.DEV && errorStack}
          <pre class="error-stack">{errorStack}</pre>
        {/if}
      </details>
    {/if}
    
    <div class="error-actions">
      <button on:click={reset} class="reset-button">
        Retry Component
      </button>
      {#if showDetails}
        <button on:click={retry} class="retry-button">
          Reload Page
        </button>
      {/if}
    </div>
  </div>
{:else}
  <!-- Wrap slot in try-catch equivalent -->
  <div class="error-boundary-wrapper">
    <slot />
  </div>
{/if}

<style>
  .error-boundary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    text-align: center;
    min-height: 120px;
    background: var(--bg-secondary, #f6f6f6);
    border: 1px solid var(--border-color, #e1e4e8);
    border-radius: 6px;
    margin: 0.5rem 0;
  }
  
  .error-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  h3 {
    color: var(--text-primary, #1d1c1d);
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
  
  .error-boundary-wrapper {
    /* Flex container for proper scroll handling in thread view */
    display: flex;
    flex-direction: column;
    /* WARNING: DO NOT UNCOMMENT flex: 1 globally - This causes scroll issues in result list */
    /* flex: 1; */
    min-height: 0; /* Critical for nested flex scrolling */
    overflow: hidden; /* Prevent expansion beyond allocated space */
  }

  /* Special handling for ThreadView which needs flex: 1 to scroll properly */
  .thread-panel .error-boundary-wrapper {
    flex: 1; /* ThreadView requires this for scrolling */
  }
  
  .error-message {
    color: var(--text-secondary, #616061);
    margin: 0.5rem 0 1rem 0;
  }
  
  .error-details {
    width: 100%;
    max-width: 600px;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--bg-primary, white);
    border: 1px solid var(--border-color, #e1e4e8);
    border-radius: 4px;
    text-align: left;
  }
  
  .error-details summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--text-primary, #1d1c1d);
  }
  
  .error-text {
    margin: 0.5rem 0;
    color: #d73a49;
  }
  
  .error-stack {
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: #f6f8fa;
    border-radius: 4px;
    font-size: 0.875rem;
    overflow-x: auto;
    color: #586069;
  }
  
  .error-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }
  
  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .retry-button {
    background: #007a5a;
    color: white;
    border: none;
  }
  
  .retry-button:hover {
    background: #005a41;
  }
  
  .reset-button {
    background: transparent;
    color: #007a5a;
    border: 1px solid #007a5a;
  }
  
  .reset-button:hover {
    background: #f0f8f5;
  }
</style>
