<script lang="ts">
  import type { KeyboardShortcuts } from '../types/slack';
  import { settings, updateKeyboardShortcuts, resetKeyboardShortcuts } from '../stores/settings';
  import { getKeyboardService } from '../services/keyboardService';
  import { onMount } from 'svelte';
  
  interface ShortcutCategory {
    name: string;
    shortcuts: (keyof KeyboardShortcuts)[];
  }
  
  const shortcutCategories: ShortcutCategory[] = [
    {
      name: 'Search & Navigation',
      shortcuts: ['executeSearch', 'toggleAdvancedSearch', 'focusSearchBar', 'newSearch', 'clearSearch', 'refreshSearch', 'toggleKeywordHistory', 'toggleUrlHistory', 'focusUserSelector', 'focusFromDate']
    },
    {
      name: 'Focus Controls',
      shortcuts: ['focusResults', 'focusThread', 'focusUrlInput', 'nextResult', 'prevResult', 'openResult', 'jumpToFirst', 'jumpToLast']
    },
    {
      name: 'Channel Management',
      shortcuts: ['toggleChannelSelector', 'toggleMultiSelectMode', 'selectRecentChannels', 'selectAllFavorites', 'applySelectedChannels', 'toggleLiveMode', 'toggleChannelFavorite']
    },
    {
      name: 'Message Actions',
      shortcuts: ['postMessage', 'postMessageContinuous', 'replyInThread', 'replyInThreadContinuous', 'quoteMessage', 'openReactionPicker', 'openUrls']
    },
    {
      name: 'Quick Reactions',
      shortcuts: ['reaction1', 'reaction2', 'reaction3', 'reaction4', 'reaction5', 'reaction6', 'reaction7', 'reaction8', 'reaction9']
    },
    {
      name: 'Other User Reactions',
      shortcuts: ['otherReaction1', 'otherReaction2', 'otherReaction3', 'otherReaction4', 'otherReaction5', 'otherReaction6', 'otherReaction7', 'otherReaction8', 'otherReaction9']
    },
    {
      name: 'Saved Searches',
      shortcuts: ['toggleSavedSearches', 'saveCurrentSearch', 'quickSaveSearch']
    },
    {
      name: 'Lightbox Navigation',
      shortcuts: ['openLightbox', 'lightboxNext', 'lightboxPrevious', 'lightboxScrollUp', 'lightboxScrollDown', 'lightboxZoomIn', 'lightboxZoomOut', 'lightboxZoomReset', 'lightboxClose']
    },
    {
      name: 'Bookmarks',
      shortcuts: ['toggleBookmark', 'toggleBookmarkManager']
    },
    {
      name: 'Mark as Read',
      shortcuts: ['markMessageAsRead', 'todaysCatchUp']
    },
    {
      name: 'Export',
      shortcuts: ['exportThread']
    },
    {
      name: 'Files',
      shortcuts: ['downloadAllAttachments', 'uploadFiles']
    },
    {
      name: 'UI Controls',
      shortcuts: ['toggleSettings', 'toggleKeyboardHelp', 'togglePerformanceMonitor', 'zoomIn', 'zoomOut', 'zoomReset']
    }
  ];
  
  let shortcuts: KeyboardShortcuts = {
    executeSearch: 'Enter',
    toggleAdvancedSearch: 'Ctrl+Shift+F',
    focusSearchBar: 'Ctrl+K',
    focusResults: 'Ctrl+1',
    focusThread: 'Ctrl+2',
    // focusUrlInput removed - no keyboard shortcut
    toggleSettings: 'Ctrl+,',
    newSearch: 'Ctrl+N',
    nextResult: ['j', 'ArrowDown'],
    prevResult: ['k', 'ArrowUp'],
    openResult: 'Enter',
    clearSearch: 'Escape',
    toggleChannelSelector: 'Ctrl+H',
    toggleMultiSelectMode: 'Ctrl+M',
    selectRecentChannels: 'Ctrl+R',
    selectAllFavorites: 'Ctrl+F',
    applySelectedChannels: 'Ctrl+Shift+A',
    toggleLiveMode: 'Ctrl+L',
    jumpToFirst: 'h',
    jumpToLast: 'e',
    quoteMessage: 'q',
    postMessage: 'p',
    postMessageContinuous: 'Shift+P',
    replyInThread: 't',
    replyInThreadContinuous: 'Shift+T',
    openReactionPicker: 'r',
    reaction1: '1',
    reaction2: '2',
    reaction3: '3',
    reaction4: '4',
    reaction5: '5',
    reaction6: '6',
    reaction7: '7',
    reaction8: '8',
    reaction9: '9',
    otherReaction1: 'Shift+1',
    otherReaction2: 'Shift+2',
    otherReaction3: 'Shift+3',
    otherReaction4: 'Shift+4',
    otherReaction5: 'Shift+5',
    otherReaction6: 'Shift+6',
    otherReaction7: 'Shift+7',
    otherReaction8: 'Shift+8',
    otherReaction9: 'Shift+9',
    openUrls: 'Alt+Enter',
    toggleKeyboardHelp: '?',
    toggleSavedSearches: 'Ctrl+/',
    saveCurrentSearch: 'Ctrl+Shift+S',
    quickSaveSearch: 'Alt+S',
    refreshSearch: 'Ctrl+Shift+R',
    openLightbox: 'i',
    lightboxNext: ['ArrowRight', 'l', 'Tab'],
    lightboxPrevious: ['ArrowLeft', 'h', 'Shift+Tab'],
    lightboxScrollUp: ['ArrowUp', 'k'],
    lightboxScrollDown: ['ArrowDown', 'j'],
    lightboxZoomIn: ['+', '='],
    lightboxZoomOut: '-',
    lightboxZoomReset: '0',
    lightboxClose: 'Escape',
    downloadAllAttachments: 'd',
    uploadFiles: 'Ctrl+U',
    toggleBookmark: 'b',
    toggleBookmarkManager: 'Ctrl+B',
    markMessageAsRead: 'Shift+R',
    todaysCatchUp: 'Ctrl+Shift+T',
    toggleKeywordHistory: 'Ctrl+H',
    toggleUrlHistory: 'Ctrl+T',
    focusUserSelector: 'Ctrl+Shift+U',
    focusFromDate: 'Ctrl+Shift+D',
    exportThread: 'Ctrl+E',
    zoomIn: 'Ctrl+=',
    zoomOut: 'Ctrl+-',
    zoomReset: 'Ctrl+0',
    toggleChannelFavorite: 'f',
    togglePerformanceMonitor: 'Ctrl+Shift+P'
  };
  
  let editingShortcut: keyof KeyboardShortcuts | null = null;
  let recordingKeys = false;
  let currentKeys: string[] = [];
  
  const shortcutDescriptions: Record<string, string> = {
    executeSearch: 'Execute Search',
    toggleAdvancedSearch: 'Toggle Advanced Search',
    focusSearchBar: 'Focus Search Bar',
    focusResults: 'Focus Results Panel',
    focusThread: 'Focus Thread Panel',
    focusUrlInput: 'Focus URL Input',
    toggleSettings: 'Toggle Settings',
    newSearch: 'New Search (Refresh)',
    nextResult: 'Next Result',
    prevResult: 'Previous Result',
    openResult: 'Open Selected Result',
    clearSearch: 'Clear Search',
    toggleChannelSelector: 'Toggle Channel List Visibility',
    toggleMultiSelectMode: 'Toggle Multi-Select Mode (Channels)',
    toggleLiveMode: 'Toggle Live Mode (Real-time Updates)',
    selectRecentChannels: 'Select Recent Channels',
    selectAllFavorites: 'Select All Favorites',
    applySelectedChannels: 'Apply Selected Channels',
    jumpToFirst: 'Jump to First Message',
    jumpToLast: 'Jump to Last Message',
    quoteMessage: 'Quote Selected Message',
    postMessage: 'Post Message to Channel',
    postMessageContinuous: 'Post Message (Continuous Mode)',
    replyInThread: 'Reply in Thread',
    replyInThreadContinuous: 'Reply in Thread (Continuous Mode)',
    openReactionPicker: 'Open Reaction Picker',
    reaction1: 'Quick Reaction 1',
    reaction2: 'Quick Reaction 2',
    reaction3: 'Quick Reaction 3',
    reaction4: 'Quick Reaction 4',
    reaction5: 'Quick Reaction 5',
    reaction6: 'Quick Reaction 6',
    reaction7: 'Quick Reaction 7',
    reaction8: 'Quick Reaction 8',
    reaction9: 'Quick Reaction 9',
    otherReaction1: 'Add Reaction from Others (1st)',
    otherReaction2: 'Add Reaction from Others (2nd)',
    otherReaction3: 'Add Reaction from Others (3rd)',
    otherReaction4: 'Add Reaction from Others (4th)',
    otherReaction5: 'Add Reaction from Others (5th)',
    otherReaction6: 'Add Reaction from Others (6th)',
    otherReaction7: 'Add Reaction from Others (7th)',
    otherReaction8: 'Add Reaction from Others (8th)',
    otherReaction9: 'Add Reaction from Others (9th)',
    openUrls: 'Open URLs from Message',
    toggleKeyboardHelp: 'Toggle Keyboard Help',
    togglePerformanceMonitor: 'Toggle Performance Monitor',
    toggleSavedSearches: 'Toggle Saved Searches List',
    saveCurrentSearch: 'Save Current Search',
    quickSaveSearch: 'Quick Save Search',
    refreshSearch: 'Refresh Search (Get New Messages)',
    openLightbox: 'Open File Preview/Lightbox',
    lightboxNext: 'Next Image/File',
    lightboxPrevious: 'Previous Image/File',
    lightboxScrollUp: 'Scroll Up in Lightbox',
    lightboxScrollDown: 'Scroll Down in Lightbox',
    lightboxZoomIn: 'Zoom In Image',
    lightboxZoomOut: 'Zoom Out Image',
    lightboxZoomReset: 'Reset Image Zoom',
    lightboxClose: 'Close Lightbox',
    downloadAllAttachments: 'Download All Attachments',
    uploadFiles: 'Upload Files',
    toggleBookmark: 'Toggle Bookmark on Message',
    toggleBookmarkManager: 'Toggle Bookmark Manager',
    markMessageAsRead: 'Mark Message as Read',
    todaysCatchUp: 'Today\'s Catch Up',
    toggleKeywordHistory: 'Toggle Search Keyword History',
    toggleUrlHistory: 'Toggle URL History',
    focusUserSelector: 'Focus User Selector',
    focusFromDate: 'Focus From Date Filter',
    exportThread: 'Export Thread',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Reset Zoom',
    toggleChannelFavorite: 'Toggle Channel Favorite'
  };
  
  const shortcutContexts: Record<string, string> = {
    executeSearch: 'When focused on search bar',
    toggleAdvancedSearch: 'Available anywhere in the app',
    focusSearchBar: 'Available anywhere in the app',
    focusResults: 'Available anywhere in the app',
    focusThread: 'Available anywhere when a thread is open',
    focusUrlInput: 'Available anywhere in the app',
    toggleSettings: 'Available anywhere in the app',
    newSearch: 'Available anywhere in the app',
    nextResult: 'When results panel is focused',
    prevResult: 'When results panel is focused',
    openResult: 'When a result is selected',
    clearSearch: 'When search bar is focused or results are shown',
    toggleChannelSelector: 'Available anywhere in the app',
    toggleMultiSelectMode: 'When channel selector is open',
    selectRecentChannels: 'When channel selector is open',
    selectAllFavorites: 'When channel selector is open',
    applySelectedChannels: 'When channels are selected',
    jumpToFirst: 'When viewing messages or results',
    jumpToLast: 'When viewing messages or results',
    quoteMessage: 'When a message is selected',
    postMessage: 'When a message is selected',
    postMessageContinuous: 'When a message is selected',
    replyInThread: 'When a message is selected',
    replyInThreadContinuous: 'When a message is selected',
    openReactionPicker: 'When a message is selected',
    reaction1: 'When a message is selected',
    reaction2: 'When a message is selected',
    reaction3: 'When a message is selected',
    reaction4: 'When a message is selected',
    reaction5: 'When a message is selected',
    reaction6: 'When a message is selected',
    reaction7: 'When a message is selected',
    reaction8: 'When a message is selected',
    reaction9: 'When a message is selected',
    otherReaction1: 'When a message is selected',
    otherReaction2: 'When a message is selected',
    otherReaction3: 'When a message is selected',
    otherReaction4: 'When a message is selected',
    otherReaction5: 'When a message is selected',
    otherReaction6: 'When a message is selected',
    otherReaction7: 'When a message is selected',
    otherReaction8: 'When a message is selected',
    otherReaction9: 'When a message is selected',
    openUrls: 'When a message with URLs is selected',
    toggleKeyboardHelp: 'Available anywhere in the app',
    togglePerformanceMonitor: 'Available anywhere in the app',
    toggleSavedSearches: 'Available anywhere in the app',
    saveCurrentSearch: 'When viewing search results',
    quickSaveSearch: 'When viewing search results',
    refreshSearch: 'When search results are displayed (not in live mode)',
    openLightbox: 'When a message with attachments is selected',
    lightboxNext: 'When lightbox is open',
    lightboxPrevious: 'When lightbox is open',
    lightboxScrollUp: 'When lightbox is open',
    lightboxScrollDown: 'When lightbox is open',
    lightboxZoomIn: 'When lightbox is open with an image',
    lightboxZoomOut: 'When lightbox is open with an image',
    lightboxZoomReset: 'When lightbox is open with an image',
    lightboxClose: 'When lightbox is open',
    downloadAllAttachments: 'When a message with attachments is selected',
    uploadFiles: 'When message composer is open',
    toggleBookmark: 'When a message is selected',
    toggleBookmarkManager: 'Available anywhere in the app',
    markMessageAsRead: 'When a message is selected',
    todaysCatchUp: 'Available anywhere in the app',
    toggleKeywordHistory: 'Available anywhere in the app',
    toggleUrlHistory: 'Available anywhere in the app',
    focusUserSelector: 'Available anywhere in the app',
    focusFromDate: 'Available anywhere in the app',
    exportThread: 'When viewing a thread',
    zoomIn: 'Available anywhere in the app',
    zoomOut: 'Available anywhere in the app',
    zoomReset: 'Available anywhere in the app',
    toggleChannelFavorite: 'When a channel is selected',
    toggleLiveMode: 'Available anywhere in the app'
  };
  
  onMount(() => {
    const unsubscribe = settings.subscribe(s => {
      if (s.keyboardShortcuts) {
        shortcuts = { ...s.keyboardShortcuts };
      }
    });
    
    return unsubscribe;
  });
  
  function startRecording(key: string) {
    editingShortcut = key as keyof KeyboardShortcuts;
    recordingKeys = true;
    currentKeys = [];
  }
  
  function stopRecording() {
    editingShortcut = null;
    recordingKeys = false;
    currentKeys = [];
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (!recordingKeys || !editingShortcut) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const keys: string[] = [];
    
    // Check modifiers
    if (event.ctrlKey || event.metaKey) keys.push('Ctrl');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');
    
    // Add the main key
    let key = event.key;
    if (key === ' ') key = 'Space';
    else if (key === 'ArrowUp') key = 'ArrowUp';
    else if (key === 'ArrowDown') key = 'ArrowDown';
    else if (key === 'ArrowLeft') key = 'ArrowLeft';
    else if (key === 'ArrowRight') key = 'ArrowRight';
    else if (key === 'Enter') key = 'Enter';
    else if (key === 'Escape') key = 'Escape';
    else if (key === 'Tab') key = 'Tab';
    else if (key === 'Delete') key = 'Delete';
    else if (key === 'Backspace') key = 'Backspace';
    else if (key === 'Home') key = 'Home';
    else if (key === 'End') key = 'End';
    else if (key.length === 1) key = key.toUpperCase();
    
    // Don't add modifier keys as the main key
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      keys.push(key);
    }
    
    if (keys.length > 0) {
      const shortcut = keys.join('+');
      shortcuts[editingShortcut] = shortcut;
      updateKeyboardShortcuts({ [editingShortcut]: shortcut });
      
      // Update keyboard service
      const keyboardService = getKeyboardService();
      if (keyboardService) {
        keyboardService.updateShortcuts(shortcuts);
      }
      
      stopRecording();
    }
  }
  
  function handleReset() {
    if (confirm('Reset all keyboard shortcuts to defaults?')) {
      resetKeyboardShortcuts();
      
      // Update keyboard service
      const keyboardService = getKeyboardService();
      if (keyboardService) {
        const defaultShortcuts = $settings.keyboardShortcuts;
        if (defaultShortcuts) {
          keyboardService.updateShortcuts(defaultShortcuts);
        }
      }
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
      display = display.replace(/Home/gi, 'Home');
      display = display.replace(/End/gi, 'End');
      
      // Format single letters (J, K) to uppercase for display
      if (display.length === 1) {
        display = display.toUpperCase();
      }
      
      return display;
    }).join(' / ');
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="keyboard-settings">
  <div class="settings-header">
    <h3>Keyboard Shortcuts</h3>
    <button class="btn-reset" on:click={handleReset}>
      Reset to Defaults
    </button>
  </div>
  
  <div class="shortcuts-list">
    {#each shortcutCategories as category}
      <div class="shortcut-category">
        <h4 class="category-title">{category.name}</h4>
        <div class="category-shortcuts">
          {#each category.shortcuts as key}
            {#if shortcuts[key] !== undefined}
              <div class="shortcut-item">
                <div class="shortcut-info">
                  <span class="shortcut-description">
                    {shortcutDescriptions[key]}
                  </span>
                  <span class="shortcut-context">
                    {shortcutContexts[key]}
                  </span>
                </div>
                <div class="shortcut-value">
                  {#if editingShortcut === key && recordingKeys}
                    <span class="recording">Press keys...</span>
                    <button class="btn-cancel" on:click={stopRecording}>
                      Cancel
                    </button>
                  {:else}
                    <kbd class="shortcut-key">
                      {getShortcutDisplay(shortcuts[key])}
                    </kbd>
                    <button class="btn-edit" on:click={() => startRecording(key)}>
                      Edit
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
  
  <div class="help-text">
    <p>Click "Edit" to customize a shortcut, then press the key combination you want to use.</p>
    <p>Note: Some shortcuts may conflict with browser or system shortcuts.</p>
  </div>
</div>

<style>
  .keyboard-settings {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border);
  }
  
  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .settings-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
  
  .btn-reset {
    padding: 0.375rem 0.75rem;
    font-size: 0.813rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-reset:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .shortcut-category {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .category-title {
    margin: 0;
    font-size: 0.938rem;
    font-weight: 600;
    color: var(--text-primary);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
    opacity: 0.9;
  }
  
  .category-shortcuts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.875rem 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .shortcut-item:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover, rgba(255, 255, 255, 0.15));
  }
  
  .shortcut-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }
  
  .shortcut-description {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .shortcut-context {
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .shortcut-context::before {
    content: '●';
    font-size: 0.5rem;
    opacity: 0.6;
  }
  
  .shortcut-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .shortcut-key {
    padding: 0.375rem 0.625rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.813rem;
    color: var(--text-primary);
    min-width: 90px;
    text-align: center;
    font-weight: 500;
  }
  
  .recording {
    padding: 0.25rem 0.5rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 4px;
    font-size: 0.813rem;
    color: var(--primary);
    min-width: 80px;
    text-align: center;
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  
  .btn-edit, .btn-cancel {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-edit:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }
  
  .btn-cancel {
    border-color: var(--error);
    color: var(--error);
  }
  
  .btn-cancel:hover {
    background: var(--error);
    color: white;
  }
  
  .help-text {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  
  .help-text p {
    margin: 0.25rem 0;
    font-size: 0.813rem;
    color: var(--text-secondary);
  }
  
  .help-text p:first-child {
    margin-top: 0;
  }
  
  .help-text p:last-child {
    margin-bottom: 0;
  }
</style>