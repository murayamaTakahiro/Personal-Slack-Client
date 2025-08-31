<script lang="ts">
  import type { KeyboardShortcuts } from '../types/slack';
  import { settings, updateKeyboardShortcuts, resetKeyboardShortcuts } from '../stores/settings';
  import { getKeyboardService } from '../services/keyboardService';
  import { onMount } from 'svelte';
  
  let shortcuts: KeyboardShortcuts = {
    executeSearch: 'Enter',
    toggleAdvancedSearch: 'Ctrl+Shift+F',
    focusSearchBar: 'Ctrl+K',
    focusResults: 'Ctrl+1',
    focusThread: 'Ctrl+2',
    focusUrlInput: 'Ctrl+U',
    toggleSettings: 'Ctrl+,',
    newSearch: 'Ctrl+N',
    nextResult: ['j', 'ArrowDown'],
    prevResult: ['k', 'ArrowUp'],
    openResult: 'Enter',
    clearSearch: 'Escape',
    toggleChannelSelector: 'Ctrl+L',
    openUrls: 'Alt+Enter'
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
    newSearch: 'New Search',
    nextResult: 'Next Result',
    prevResult: 'Previous Result',
    openResult: 'Open Selected Result',
    clearSearch: 'Clear Search',
    toggleChannelSelector: 'Toggle Channel Selector',
    jumpToFirst: 'Jump to First Message',
    jumpToLast: 'Jump to Last Message',
    postMessage: 'Post Message to Channel',
    replyInThread: 'Reply in Thread',
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
    openUrls: 'Open URLs from Message',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Reset Zoom'
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
    {#each Object.entries(shortcuts) as [key, shortcut]}
      <div class="shortcut-item">
        <span class="shortcut-description">
          {shortcutDescriptions[key]}
        </span>
        <div class="shortcut-value">
          {#if editingShortcut === key && recordingKeys}
            <span class="recording">Press keys...</span>
            <button class="btn-cancel" on:click={stopRecording}>
              Cancel
            </button>
          {:else}
            <kbd class="shortcut-key">
              {getShortcutDisplay(shortcut)}
            </kbd>
            <button class="btn-edit" on:click={() => startRecording(key)}>
              Edit
            </button>
          {/if}
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
    gap: 0.75rem;
  }
  
  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .shortcut-item:hover {
    background: var(--bg-hover);
  }
  
  .shortcut-description {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .shortcut-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .shortcut-key {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 0.813rem;
    color: var(--text-primary);
    min-width: 80px;
    text-align: center;
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