<script lang="ts">
  import { settings } from '../stores/settings';
  import { getKeyboardService } from '../services/keyboardService';
  import { onMount } from 'svelte';
  
  export let show = false;
  
  interface ShortcutCategory {
    name: string;
    shortcuts: Array<{
      key: string;
      description: string;
      shortcut: string;
    }>;
  }
  
  let categories: ShortcutCategory[] = [];
  
  onMount(() => {
    const keyboardService = getKeyboardService();
    if (!keyboardService) return;
    
    const shortcuts = $settings.keyboardShortcuts || {};
    
    categories = [
      {
        name: 'Navigation',
        shortcuts: [
          { 
            key: 'focusSearchBar', 
            description: 'Focus Search Bar',
            shortcut: shortcuts.focusSearchBar || 'Ctrl+K'
          },
          { 
            key: 'focusResults', 
            description: 'Focus Results Panel',
            shortcut: shortcuts.focusResults || 'Ctrl+1'
          },
          { 
            key: 'focusThread', 
            description: 'Focus Thread Panel',
            shortcut: shortcuts.focusThread || 'Ctrl+2'
          },
          { 
            key: 'focusUrlInput', 
            description: 'Focus URL Input',
            shortcut: shortcuts.focusUrlInput || 'Ctrl+U'
          },
          { 
            key: 'nextResult', 
            description: 'Next Result',
            shortcut: shortcuts.nextResult || 'ArrowDown'
          },
          { 
            key: 'prevResult', 
            description: 'Previous Result',
            shortcut: shortcuts.prevResult || 'ArrowUp'
          },
          { 
            key: 'openResult', 
            description: 'Open Selected Result',
            shortcut: shortcuts.openResult || 'Enter'
          }
        ]
      },
      {
        name: 'Search',
        shortcuts: [
          { 
            key: 'executeSearch', 
            description: 'Execute Search',
            shortcut: shortcuts.executeSearch || 'Enter'
          },
          { 
            key: 'newSearch', 
            description: 'New Search',
            shortcut: shortcuts.newSearch || 'Ctrl+N'
          },
          { 
            key: 'clearSearch', 
            description: 'Clear Search',
            shortcut: shortcuts.clearSearch || 'Escape'
          },
          { 
            key: 'toggleAdvancedSearch', 
            description: 'Toggle Advanced Search',
            shortcut: shortcuts.toggleAdvancedSearch || 'Ctrl+Shift+F'
          },
          { 
            key: 'toggleChannelSelector', 
            description: 'Toggle Channel Selector',
            shortcut: shortcuts.toggleChannelSelector || 'Ctrl+L'
          }
        ]
      },
      {
        name: 'Application',
        shortcuts: [
          { 
            key: 'toggleSettings', 
            description: 'Toggle Settings',
            shortcut: shortcuts.toggleSettings || 'Ctrl+,'
          }
        ]
      }
    ];
  });
  
  function getShortcutDisplay(shortcut: string): string {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    let display = shortcut;
    
    if (isMac) {
      display = display.replace(/Ctrl/gi, '⌘');
      display = display.replace(/Alt/gi, '⌥');
      display = display.replace(/Shift/gi, '⇧');
    }
    
    display = display.replace(/ArrowUp/gi, '↑');
    display = display.replace(/ArrowDown/gi, '↓');
    display = display.replace(/ArrowLeft/gi, '←');
    display = display.replace(/ArrowRight/gi, '→');
    display = display.replace(/Enter/gi, '⏎');
    display = display.replace(/Escape/gi, 'Esc');
    display = display.replace(/Space/gi, '␣');
    display = display.replace(/Tab/gi, '⇥');
    display = display.replace(/Delete/gi, 'Del');
    display = display.replace(/Backspace/gi, '⌫');
    
    return display;
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === '?') {
      show = !show;
    } else if (event.key === 'Escape' && show) {
      show = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div class="keyboard-help-overlay" on:click={() => show = false}>
    <div class="keyboard-help" on:click|stopPropagation>
      <div class="help-header">
        <h2>Keyboard Shortcuts</h2>
        <button class="btn-close" on:click={() => show = false}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="help-content">
        {#each categories as category}
          <div class="category">
            <h3>{category.name}</h3>
            <div class="shortcuts">
              {#each category.shortcuts as shortcut}
                <div class="shortcut-row">
                  <span class="description">{shortcut.description}</span>
                  <kbd class="key">{getShortcutDisplay(shortcut.shortcut)}</kbd>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      
      <div class="help-footer">
        <p>Press <kbd>?</kbd> to toggle this help • Press <kbd>Esc</kbd> to close</p>
        <p>Customize shortcuts in Settings</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .keyboard-help-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .keyboard-help {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
  }
  
  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  
  .help-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .btn-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }
  
  .help-content::-webkit-scrollbar {
    width: 8px;
  }
  
  .help-content::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }
  
  .help-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .help-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
  
  .category {
    margin-bottom: 1.5rem;
  }
  
  .category:last-child {
    margin-bottom: 0;
  }
  
  .category h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .shortcuts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    transition: background 0.2s;
  }
  
  .shortcut-row:hover {
    background: var(--bg-hover);
  }
  
  .description {
    font-size: 0.875rem;
    color: var(--text-primary);
  }
  
  .key {
    padding: 0.25rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
    white-space: nowrap;
  }
  
  .help-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
    text-align: center;
  }
  
  .help-footer p {
    margin: 0.25rem 0;
    font-size: 0.813rem;
    color: var(--text-secondary);
  }
  
  .help-footer kbd {
    padding: 0.125rem 0.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
  }
</style>