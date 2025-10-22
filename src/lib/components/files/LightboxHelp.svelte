<script lang="ts">
  import { fade } from 'svelte/transition';
  
  export let isOpen = false;
  export let onClose: () => void;
  
  const shortcuts = [
    { category: 'Navigation', items: [
      { key: '←', description: 'Previous file/page' },
      { key: '→', description: 'Next file/page' },
      { key: 'Tab', description: 'Next file' },
      { key: 'Shift+Tab', description: 'Previous file' },
      { key: 'PageUp', description: 'Previous page (PDF) / Scroll page up' },
      { key: 'PageDown', description: 'Next page (PDF) / Scroll page down' }
    ]},
    { category: 'Scrolling', items: [
      { key: '↑ / k', description: 'Scroll up (all file types)' },
      { key: '↓ / j', description: 'Scroll down (all file types)' },
      { key: 'h', description: 'Scroll left' },
      { key: 'l', description: 'Scroll right' },
      { key: 'Home', description: 'First page (PDF) / Scroll to top' },
      { key: 'End', description: 'Last page (PDF) / Scroll to bottom' }
    ]},
    { category: 'Zoom', items: [
      { key: '+ / =', description: 'Zoom in (all file types)' },
      { key: '-', description: 'Zoom out (all file types)' },
      { key: 'Ctrl+0', description: 'Reset zoom' },
      { key: 'f', description: 'Fit to viewport' },
      { key: 'Double-click', description: 'Toggle zoom (images only)' },
      { key: 'Scroll wheel', description: 'Zoom in/out (images only)' }
    ]},
    { category: 'Download', items: [
      { key: 'd', description: 'Download file (or all attachments for email)' },
      { key: '1-9', description: 'Download specific email attachment by number' }
    ]},
    { category: 'Text Files', items: [
      { key: 'c / Shift+c', description: 'Copy text content to clipboard' }
    ]},
    { category: 'General', items: [
      { key: 'ESC', description: 'Close lightbox' },
      { key: '?', description: 'Show/hide this help' }
    ]}
  ];
  
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div 
    class="help-backdrop" 
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
  >
    <div class="help-container" transition:fade={{ duration: 200 }}>
      <div class="help-header">
        <h2>Keyboard Shortcuts</h2>
        <button class="close-btn" on:click={onClose} aria-label="Close help">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path fill="currentColor" d="M14.95 5.05a.75.75 0 00-1.06 0L10 8.94 6.11 5.05a.75.75 0 00-1.06 1.06L8.94 10l-3.89 3.89a.75.75 0 101.06 1.06L10 11.06l3.89 3.89a.75.75 0 001.06-1.06L11.06 10l3.89-3.89a.75.75 0 000-1.06z"/>
          </svg>
        </button>
      </div>
      
      <div class="help-content">
        {#each shortcuts as section}
          <div class="shortcut-section">
            <h3>{section.category}</h3>
            <div class="shortcut-list">
              {#each section.items as item}
                <div class="shortcut-item">
                  <span class="shortcut-key">{item.key}</span>
                  <span class="shortcut-description">{item.description}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      
      <div class="help-footer">
        <p>Press <kbd>?</kbd> to toggle this help</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .help-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .help-container {
    background: var(--color-surface);
    border-radius: 8px;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }
  
  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  
  .help-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--color-text-primary);
  }
  
  .close-btn {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }
  
  .close-btn:hover {
    background: var(--color-hover);
    color: var(--color-text-primary);
  }
  
  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }
  
  .shortcut-section {
    margin-bottom: 2rem;
  }
  
  .shortcut-section:last-child {
    margin-bottom: 0;
  }
  
  .shortcut-section h3 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
  }
  
  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .shortcut-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem;
    border-radius: 4px;
    background: var(--color-bg-secondary);
  }
  
  .shortcut-key {
    flex: 0 0 120px;
    font-family: monospace;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    text-align: right;
  }
  
  .shortcut-description {
    flex: 1;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }
  
  .help-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    text-align: center;
  }
  
  .help-footer p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }
  
  .help-footer kbd {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    font-family: monospace;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    color: var(--color-text-primary);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  }
  
  :global([data-theme="dark"]) {
    --color-surface: #1a1d21;
    --color-border: #565856;
    --color-text-primary: #d1d2d3;
    --color-text-secondary: #ababad;
    --color-hover: rgba(255, 255, 255, 0.08);
    --color-bg-secondary: rgba(255, 255, 255, 0.04);
    --color-bg-tertiary: rgba(255, 255, 255, 0.08);
  }
  
  :global([data-theme="light"]) {
    --color-surface: #ffffff;
    --color-border: #dddddd;
    --color-text-primary: #1d1c1d;
    --color-text-secondary: #616061;
    --color-hover: rgba(0, 0, 0, 0.05);
    --color-bg-secondary: rgba(0, 0, 0, 0.02);
    --color-bg-tertiary: rgba(0, 0, 0, 0.04);
  }
</style>