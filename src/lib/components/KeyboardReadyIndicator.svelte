<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isKeyboardServiceReady, onKeyboardServiceReady, getKeyboardService } from '../services/keyboardService';
  
  let isReady = false;
  let handlerCount = 0;
  let showDetails = false;
  let registeredKeys: string[] = [];
  let updateInterval: number;
  
  onMount(() => {
    // Check initial state
    isReady = isKeyboardServiceReady();
    updateHandlerInfo();
    
    // Setup ready callback
    onKeyboardServiceReady(() => {
      isReady = true;
      updateHandlerInfo();
    });
    
    // Update handler count periodically to show registration progress
    updateInterval = setInterval(updateHandlerInfo, 100);
    
    // Stop updating after 5 seconds to avoid unnecessary polling
    setTimeout(() => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    }, 5000);
  });
  
  onDestroy(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
  
  function updateHandlerInfo() {
    const service = getKeyboardService();
    if (service) {
      const status = service.getHandlerStatus();
      handlerCount = status.count;
      registeredKeys = status.keys;
    }
  }
  
  function toggleDetails() {
    showDetails = !showDetails;
  }
</script>

<div class="keyboard-ready-indicator" class:ready={isReady} class:not-ready={!isReady}>
  <button class="indicator-button" on:click={toggleDetails} title="Keyboard shortcuts status">
    <div class="status-icon">
      {#if isReady}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="m9 12 2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12h8"/>
        </svg>
      {/if}
    </div>
    <span class="status-text">
      {isReady ? 'Shortcuts Ready' : 'Loading...'}
    </span>
    <span class="handler-count">({handlerCount})</span>
  </button>
  
  {#if showDetails}
    <div class="details-tooltip">
      <div class="tooltip-header">
        <strong>Keyboard Shortcuts Status</strong>
      </div>
      <div class="status-info">
        <div class="status-row">
          <span class="label">Status:</span>
          <span class="value" class:ready={isReady} class:loading={!isReady}>
            {isReady ? '✓ Ready' : '⏳ Loading'}
          </span>
        </div>
        <div class="status-row">
          <span class="label">Handlers:</span>
          <span class="value">{handlerCount} registered</span>
        </div>
      </div>
      {#if registeredKeys.length > 0}
        <div class="registered-keys">
          <div class="keys-header">Active Shortcuts:</div>
          <div class="keys-list">
            {#each registeredKeys as key}
              <span class="key-item">{key}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .keyboard-ready-indicator {
    position: relative;
    display: inline-block;
  }
  
  .indicator-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: none;
    border-radius: 12px;
    background: var(--bg-hover);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
  }
  
  .indicator-button:hover {
    background: var(--bg-secondary);
    border-color: var(--border);
  }
  
  .ready .indicator-button {
    background: var(--success-bg);
    color: var(--success);
  }
  
  .ready .indicator-button:hover {
    background: var(--success-bg);
    border-color: var(--success);
  }
  
  .not-ready .indicator-button {
    background: var(--warning-bg);
    color: var(--warning);
  }
  
  .status-icon {
    display: flex;
    align-items: center;
  }
  
  .status-text {
    font-weight: 500;
  }
  
  .handler-count {
    opacity: 0.7;
    font-size: 0.7rem;
  }
  
  .details-tooltip {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1000;
    width: 280px;
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin-top: 0.25rem;
  }
  
  .tooltip-header {
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }
  
  .status-info {
    margin-bottom: 0.5rem;
  }
  
  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.125rem 0;
    font-size: 0.75rem;
  }
  
  .label {
    color: var(--text-secondary);
  }
  
  .value {
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .value.ready {
    color: var(--success);
  }
  
  .value.loading {
    color: var(--warning);
  }
  
  .registered-keys {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }
  
  .keys-header {
    font-size: 0.7rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }
  
  .keys-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    max-height: 100px;
    overflow-y: auto;
  }
  
  .key-item {
    padding: 0.125rem 0.375rem;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.65rem;
    color: var(--text-secondary);
    font-family: monospace;
  }

  /* CSS variables for colors (add these if not already defined) */
  :root {
    --success: #10b981;
    --success-bg: #ecfdf5;
    --warning: #f59e0b;
    --warning-bg: #fef3c7;
  }

  /* Dark theme adjustments */
  @media (prefers-color-scheme: dark) {
    :root {
      --success-bg: #064e3b;
      --warning-bg: #451a03;
    }
  }
</style>