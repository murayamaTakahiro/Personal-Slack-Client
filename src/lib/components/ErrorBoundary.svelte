<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  export let fallback = 'Something went wrong';
  export let showDetails = false;
  
  let hasError = false;
  let errorMessage = '';
  let errorStack = '';
  
  function handleError(event: ErrorEvent) {
    hasError = true;
    errorMessage = event.error?.message || 'Unknown error';
    errorStack = event.error?.stack || '';
    
    // Only log errors in development
    if (import.meta.env.DEV) {
      console.error('Error boundary caught:', event.error);
    }
    
    // Prevent the error from bubbling up
    event.preventDefault();
  }
  
  function handleRejection(event: PromiseRejectionEvent) {
    hasError = true;
    errorMessage = event.reason?.message || event.reason || 'Promise rejected';
    errorStack = event.reason?.stack || '';
    
    // Only log errors in development
    if (import.meta.env.DEV) {
      console.error('Unhandled promise rejection:', event.reason);
    }
    
    // Prevent the error from bubbling up
    event.preventDefault();
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
    <h2>Oops! Something went wrong</h2>
    <p class="error-message">{fallback}</p>
    
    {#if showDetails && errorMessage}
      <details class="error-details">
        <summary>Error details</summary>
        <p class="error-text">{errorMessage}</p>
        {#if import.meta.env.DEV && errorStack}
          <pre class="error-stack">{errorStack}</pre>
        {/if}
      </details>
    {/if}
    
    <div class="error-actions">
      <button on:click={retry} class="retry-button">
        Reload Page
      </button>
      <button on:click={reset} class="reset-button">
        Try Again
      </button>
    </div>
  </div>
{:else}
  <slot />
{/if}

<style>
  .error-boundary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    min-height: 200px;
    background: var(--bg-secondary, #f6f6f6);
    border: 1px solid var(--border-color, #e1e4e8);
    border-radius: 8px;
    margin: 1rem;
  }
  
  .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  h2 {
    color: var(--text-primary, #1d1c1d);
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
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