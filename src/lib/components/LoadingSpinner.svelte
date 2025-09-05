<script lang="ts">
  export let size: 'small' | 'medium' | 'large' = 'medium';
  export let color = '#007a5a';
  export let label = 'Loading...';
</script>

<div class="loading-spinner loading-{size}" role="status" aria-label={label}>
  <div class="spinner" style="border-color: {color}"></div>
  {#if label && size !== 'small'}
    <span class="loading-text">{label}</span>
  {/if}
</div>

<style>
  .loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  
  .loading-small {
    padding: 0.25rem;
  }
  
  .loading-small .spinner {
    width: 16px;
    height: 16px;
    border-width: 2px;
  }
  
  .loading-medium .spinner {
    width: 32px;
    height: 32px;
    border-width: 3px;
  }
  
  .loading-large .spinner {
    width: 48px;
    height: 48px;
    border-width: 4px;
  }
  
  .spinner {
    border-style: solid;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.8;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  
  .loading-text {
    margin-top: 0.5rem;
    color: var(--text-secondary, #616061);
    font-size: 0.875rem;
  }
</style>