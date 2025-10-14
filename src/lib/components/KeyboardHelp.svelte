<script lang="ts">
  import { settings } from '../stores/settings';
  import { getKeyboardService } from '../services/keyboardService';
  import { onMount, onDestroy, tick } from 'svelte';
  
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
  let helpContentElement: HTMLElement;
  let dialogElement: HTMLElement;
  let previousActiveElement: HTMLElement | null = null;
  
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
            key: 'nextResult', 
            description: 'Next Result',
            shortcut: shortcuts.nextResult || ['j', 'ArrowDown']
          },
          { 
            key: 'prevResult', 
            description: 'Previous Result',
            shortcut: shortcuts.prevResult || ['k', 'ArrowUp']
          },
          { 
            key: 'openResult', 
            description: 'Open Selected Result',
            shortcut: shortcuts.openResult || 'Enter'
          },
          {
            key: 'jumpToFirst',
            description: 'Jump to First (Results/Thread)',
            shortcut: shortcuts.jumpToFirst || 'h'
          },
          {
            key: 'jumpToLast',
            description: 'Jump to Last (Results/Thread)',
            shortcut: shortcuts.jumpToLast || 'e'
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
            key: 'refreshSearch',
            description: 'Refresh Search (Get New Messages)',
            shortcut: shortcuts.refreshSearch || 'Ctrl+Shift+R'
          },
          {
            key: 'toggleKeywordHistory',
            description: 'Toggle Search Keyword History',
            shortcut: shortcuts.toggleKeywordHistory || 'Ctrl+H'
          },
          {
            key: 'toggleUrlHistory',
            description: 'Toggle URL History',
            shortcut: shortcuts.toggleUrlHistory || 'Ctrl+T'
          },
          {
            key: 'focusUserSelector',
            description: 'Focus User Selector',
            shortcut: shortcuts.focusUserSelector || 'Ctrl+Shift+U'
          },
          {
            key: 'focusFromDate',
            description: 'Focus From Date Filter',
            shortcut: shortcuts.focusFromDate || 'Ctrl+Shift+D'
          }
        ]
      },
      {
        name: 'Saved Searches',
        shortcuts: [
          {
            key: 'toggleSavedSearches',
            description: 'Toggle Saved Searches List',
            shortcut: shortcuts.toggleSavedSearches || 'Ctrl+/'
          },
          {
            key: 'saveCurrentSearch',
            description: 'Save Current Search',
            shortcut: shortcuts.saveCurrentSearch || 'Ctrl+Shift+S'
          },
          {
            key: 'quickSaveSearch',
            description: 'Quick Save Search',
            shortcut: shortcuts.quickSaveSearch || 'Alt+S'
          }
        ]
      },
      {
        name: 'Message Actions',
        shortcuts: [
          {
            key: 'postMessage',
            description: 'Post Message to Channel',
            shortcut: shortcuts.postMessage || 'p'
          },
          {
            key: 'postMessageContinuous',
            description: 'Post Message (Continuous)',
            shortcut: shortcuts.postMessageContinuous || 'Shift+P'
          },
          {
            key: 'replyInThread',
            description: 'Reply in Thread',
            shortcut: shortcuts.replyInThread || 't'
          },
          {
            key: 'replyInThreadContinuous',
            description: 'Reply in Thread (Continuous)',
            shortcut: shortcuts.replyInThreadContinuous || 'Shift+T'
          },
          {
            key: 'quoteMessage',
            description: 'Quote Selected Message',
            shortcut: shortcuts.quoteMessage || 'q'
          },
          {
            key: 'openReactionPicker',
            description: 'Open Reaction Picker',
            shortcut: shortcuts.openReactionPicker || 'r'
          },
          {
            key: 'openUrls',
            description: 'Open URLs in Message',
            shortcut: shortcuts.openUrls || 'Alt+Enter'
          }
        ]
      },
      {
        name: 'Quick Reactions',
        shortcuts: [
          { 
            key: 'reaction1', 
            description: 'Quick Reaction 1',
            shortcut: shortcuts.reaction1 || '1'
          },
          { 
            key: 'reaction2', 
            description: 'Quick Reaction 2',
            shortcut: shortcuts.reaction2 || '2'
          },
          { 
            key: 'reaction3', 
            description: 'Quick Reaction 3',
            shortcut: shortcuts.reaction3 || '3'
          },
          { 
            key: 'reaction4', 
            description: 'Quick Reaction 4',
            shortcut: shortcuts.reaction4 || '4'
          },
          { 
            key: 'reaction5', 
            description: 'Quick Reaction 5',
            shortcut: shortcuts.reaction5 || '5'
          },
          { 
            key: 'reaction6', 
            description: 'Quick Reaction 6',
            shortcut: shortcuts.reaction6 || '6'
          },
          { 
            key: 'reaction7', 
            description: 'Quick Reaction 7',
            shortcut: shortcuts.reaction7 || '7'
          },
          { 
            key: 'reaction8', 
            description: 'Quick Reaction 8',
            shortcut: shortcuts.reaction8 || '8'
          },
          {
            key: 'reaction9',
            description: 'Quick Reaction 9',
            shortcut: shortcuts.reaction9 || '9'
          }
        ]
      },
      {
        name: 'Other User Reactions',
        shortcuts: [
          {
            key: 'otherReaction1',
            description: 'Add 1st Reaction from Others',
            shortcut: shortcuts.otherReaction1 || 'Shift+1'
          },
          {
            key: 'otherReaction2',
            description: 'Add 2nd Reaction from Others',
            shortcut: shortcuts.otherReaction2 || 'Shift+2'
          },
          {
            key: 'otherReaction3',
            description: 'Add 3rd Reaction from Others',
            shortcut: shortcuts.otherReaction3 || 'Shift+3'
          },
          {
            key: 'otherReaction4',
            description: 'Add 4th Reaction from Others',
            shortcut: shortcuts.otherReaction4 || 'Shift+4'
          },
          {
            key: 'otherReaction5',
            description: 'Add 5th Reaction from Others',
            shortcut: shortcuts.otherReaction5 || 'Shift+5'
          },
          {
            key: 'otherReaction6',
            description: 'Add 6th Reaction from Others',
            shortcut: shortcuts.otherReaction6 || 'Shift+6'
          },
          {
            key: 'otherReaction7',
            description: 'Add 7th Reaction from Others',
            shortcut: shortcuts.otherReaction7 || 'Shift+7'
          },
          {
            key: 'otherReaction8',
            description: 'Add 8th Reaction from Others',
            shortcut: shortcuts.otherReaction8 || 'Shift+8'
          },
          {
            key: 'otherReaction9',
            description: 'Add 9th Reaction from Others',
            shortcut: shortcuts.otherReaction9 || 'Shift+9'
          }
        ]
      },
      {
        name: 'Channel Selection',
        shortcuts: [
          {
            key: 'toggleChannelSelector',
            description: 'Toggle Channel List Visibility',
            shortcut: shortcuts.toggleChannelSelector || 'Ctrl+H'
          },
          { 
            key: 'toggleMultiSelectMode', 
            description: 'Toggle Multi-Select Mode',
            shortcut: shortcuts.toggleMultiSelectMode || 'Ctrl+M'
          },
          { 
            key: 'selectRecentChannels', 
            description: 'Select Recent Channels',
            shortcut: shortcuts.selectRecentChannels || 'Ctrl+R'
          },
          { 
            key: 'selectAllFavorites', 
            description: 'Select All Favorite Channels',
            shortcut: shortcuts.selectAllFavorites || 'Ctrl+F'
          },
          {
            key: 'applySelectedChannels',
            description: 'Apply Selected Channels',
            shortcut: shortcuts.applySelectedChannels || 'Ctrl+Shift+A'
          },
          {
            key: 'toggleLiveMode',
            description: 'Toggle Live Mode (Real-time Updates)',
            shortcut: shortcuts.toggleLiveMode || 'Ctrl+L'
          },
          {
            key: 'toggleChannelFavorite',
            description: 'Toggle Channel Favorite',
            shortcut: shortcuts.toggleChannelFavorite || 'f'
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
          },
          { 
            key: 'toggleKeyboardHelp', 
            description: 'Toggle Keyboard Help',
            shortcut: shortcuts.toggleKeyboardHelp || '?'
          },
          { 
            key: 'togglePerformanceMonitor', 
            description: 'Toggle Performance Monitor',
            shortcut: shortcuts.togglePerformanceMonitor || 'Ctrl+Shift+P'
          }
        ]
      },
      {
        name: 'Files',
        shortcuts: [
          {
            key: 'openLightbox',
            description: 'Open File Preview/Lightbox',
            shortcut: shortcuts.openLightbox || 'i'
          },
          {
            key: 'downloadAllAttachments',
            description: 'Download All Attachments',
            shortcut: shortcuts.downloadAllAttachments || 'd'
          },
          {
            key: 'uploadFiles',
            description: 'Upload Files',
            shortcut: shortcuts.uploadFiles || 'Ctrl+U'
          }
        ]
      },
      {
        name: 'Lightbox Navigation',
        shortcuts: [
          {
            key: 'lightboxNext',
            description: 'Next Image/File',
            shortcut: shortcuts.lightboxNext || ['ArrowRight', 'l', 'Tab']
          },
          {
            key: 'lightboxPrevious',
            description: 'Previous Image/File',
            shortcut: shortcuts.lightboxPrevious || ['ArrowLeft', 'h', 'Shift+Tab']
          },
          {
            key: 'lightboxScrollUp',
            description: 'Scroll Up in Lightbox',
            shortcut: shortcuts.lightboxScrollUp || ['ArrowUp', 'k']
          },
          {
            key: 'lightboxScrollDown',
            description: 'Scroll Down in Lightbox',
            shortcut: shortcuts.lightboxScrollDown || ['ArrowDown', 'j']
          },
          {
            key: 'lightboxZoomIn',
            description: 'Zoom In Image',
            shortcut: shortcuts.lightboxZoomIn || ['+', '=']
          },
          {
            key: 'lightboxZoomOut',
            description: 'Zoom Out Image',
            shortcut: shortcuts.lightboxZoomOut || '-'
          },
          {
            key: 'lightboxZoomReset',
            description: 'Reset Image Zoom',
            shortcut: shortcuts.lightboxZoomReset || '0'
          },
          {
            key: 'lightboxClose',
            description: 'Close Lightbox',
            shortcut: shortcuts.lightboxClose || 'Escape'
          }
        ]
      },
      {
        name: 'Bookmarks',
        shortcuts: [
          {
            key: 'toggleBookmark',
            description: 'Toggle Bookmark for Selected Message',
            shortcut: shortcuts.toggleBookmark || 'b'
          },
          {
            key: 'toggleBookmarkManager',
            description: 'Toggle Bookmark Manager',
            shortcut: shortcuts.toggleBookmarkManager || 'Ctrl+B'
          }
        ]
      },
      {
        name: 'Mark as Read',
        shortcuts: [
          {
            key: 'markMessageAsRead',
            description: 'Mark Message as Read',
            shortcut: shortcuts.markMessageAsRead || 'Shift+R'
          },
          {
            key: 'todaysCatchUp',
            description: 'Today\'s Catch Up',
            shortcut: shortcuts.todaysCatchUp || 'Ctrl+Shift+T'
          }
        ]
      },
      {
        name: 'Export',
        shortcuts: [
          {
            key: 'exportThread',
            description: 'Export Thread',
            shortcut: shortcuts.exportThread || 'Ctrl+E'
          }
        ]
      },
      {
        name: 'View',
        shortcuts: [
          {
            key: 'zoomIn',
            description: 'Zoom In',
            shortcut: shortcuts.zoomIn || 'Ctrl+='
          },
          {
            key: 'zoomOut',
            description: 'Zoom Out',
            shortcut: shortcuts.zoomOut || 'Ctrl+-'
          },
          {
            key: 'zoomReset',
            description: 'Reset Zoom',
            shortcut: shortcuts.zoomReset || 'Ctrl+0'
          }
        ]
      }
    ];
  });
  
  // Reactive: Handle show/hide dialog
  $: if (show) {
    handleDialogOpen();
  } else {
    handleDialogClose();
  }
  
  async function handleDialogOpen() {
    // Store current focus
    previousActiveElement = document.activeElement as HTMLElement;
    
    // Wait for DOM update
    await tick();
    
    // Focus the dialog for keyboard navigation
    if (dialogElement) {
      dialogElement.focus();
    }
  }
  
  function handleDialogClose() {
    // Restore previous focus
    if (previousActiveElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  }
  
  function getShortcutDisplay(shortcut: string | string[]): string {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    
    // Handle multiple shortcuts
    const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
    
    return shortcuts.map(s => {
      let display = s;
      
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
      
      // Format single letters (J, K) to uppercase for display
      if (display.length === 1) {
        display = display.toUpperCase();
      }
      
      return display;
    }).join(' / ');
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (!show) return;
    
    // Prevent event from bubbling to other handlers
    event.stopPropagation();
    
    // Handle Escape to close
    if (event.key === 'Escape') {
      event.preventDefault();
      show = false;
      return;
    }
    
    // Handle scrolling navigation
    if (helpContentElement) {
      const scrollAmount = 40; // Pixels to scroll for arrow keys
      const pageScrollAmount = helpContentElement.clientHeight * 0.8; // 80% of visible height for page up/down
      
      switch (event.key) {
        case 'ArrowUp':
        case 'k':
          event.preventDefault();
          helpContentElement.scrollTop -= scrollAmount;
          break;
          
        case 'ArrowDown':
        case 'j':
          event.preventDefault();
          helpContentElement.scrollTop += scrollAmount;
          break;
          
        case 'PageUp':
          event.preventDefault();
          helpContentElement.scrollTop -= pageScrollAmount;
          break;
          
        case 'PageDown':
          event.preventDefault();
          helpContentElement.scrollTop += pageScrollAmount;
          break;
          
        case 'Home':
          event.preventDefault();
          helpContentElement.scrollTop = 0;
          break;
          
        case 'End':
          event.preventDefault();
          helpContentElement.scrollTop = helpContentElement.scrollHeight;
          break;
          
        case ' ': // Spacebar
          event.preventDefault();
          // Scroll down by page amount, like browsers do
          helpContentElement.scrollTop += pageScrollAmount;
          break;
          
        case 'Tab':
          // Allow tab to cycle through interactive elements
          // Let it propagate normally
          break;
          
        default:
          // Prevent other keys from propagating
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
          }
      }
    }
  }
  
  // Clean up on destroy
  onDestroy(() => {
    if (show) {
      handleDialogClose();
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div class="keyboard-help-overlay" on:click={() => show = false}>
    <div 
      class="keyboard-help" 
      on:click|stopPropagation
      bind:this={dialogElement}
      tabindex="-1"
      role="dialog"
      aria-label="Keyboard Shortcuts Help"
      aria-modal="true"
    >
      <div class="help-header">
        <h2>Keyboard Shortcuts</h2>
        <button 
          class="btn-close" 
          on:click={() => show = false}
          aria-label="Close help dialog"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="help-content" bind:this={helpContentElement}>
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
        <p>
          <kbd>↑/↓</kbd> or <kbd>J/K</kbd> to scroll • 
          <kbd>Page Up/Down</kbd> for pages • 
          <kbd>Home/End</kbd> for top/bottom
        </p>
        <p>Press <kbd>?</kbd> to toggle help • Press <kbd>Esc</kbd> to close • Customize in Settings</p>
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
    outline: none;
  }
  
  .keyboard-help:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--accent-primary);
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