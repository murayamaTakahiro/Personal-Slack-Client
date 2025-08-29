import { writable, get } from 'svelte/store';
import type { AppSettings, KeyboardShortcuts, ReactionMapping } from '../types/slack';
import { DEFAULT_REACTION_MAPPINGS } from '../services/reactionService';
import { saveToStore, loadFromStore, isTauri } from './persistentStore';

// Default keyboard shortcuts
const defaultKeyboardShortcuts: KeyboardShortcuts = {
  executeSearch: 'Enter',
  toggleAdvancedSearch: 'Ctrl+Shift+F',
  focusSearchBar: 'Ctrl+K',
  focusResults: 'Ctrl+1',
  focusThread: 'Ctrl+2',
  focusUrlInput: 'Ctrl+U',
  toggleSettings: 'Ctrl+,',
  newSearch: 'Ctrl+N',
  nextResult: 'ArrowDown',
  prevResult: 'ArrowUp',
  openResult: 'Enter',
  clearSearch: 'Escape',
  toggleChannelSelector: 'Ctrl+L',
  postMessage: 'p',
  replyInThread: 't',
  openReactionPicker: 'r',
  reaction1: '1',
  reaction2: '2',
  reaction3: '3',
  reaction4: '4',
  reaction5: '5',
  reaction6: '6',
  reaction7: '7',
  reaction8: '8',
  reaction9: '9'
};

// Default settings
const defaultSettings: AppSettings = {
  maxResults: 1000,
  theme: 'auto',
  keyboardShortcuts: defaultKeyboardShortcuts,
  reactionMappings: DEFAULT_REACTION_MAPPINGS
};

// Initialize settings with default values
let initialSettings: AppSettings = defaultSettings;
let isInitialized = false;

// Settings store
export const settings = writable<AppSettings>(initialSettings);

// Load settings asynchronously
export async function initializeSettings() {
  console.log('[Settings] Initializing settings...');
  const loadedSettings = await loadFromStore<Partial<AppSettings>>('appSettings', {});
  console.log('[Settings] Loaded settings:', loadedSettings);
  
  const mergedSettings: AppSettings = {
    ...defaultSettings,
    ...loadedSettings,
    keyboardShortcuts: {
      ...defaultKeyboardShortcuts,
      ...(loadedSettings.keyboardShortcuts || {})
    },
    reactionMappings: loadedSettings.reactionMappings || DEFAULT_REACTION_MAPPINGS
  };
  
  console.log('[Settings] Merged settings:', mergedSettings);
  settings.set(mergedSettings);
  
  // Mark as initialized after setting the loaded values
  isInitialized = true;
  
  return mergedSettings;
}

// Subscribe to settings changes and save persistently
settings.subscribe(async value => {
  // Skip saving during initialization
  if (!isInitialized) {
    console.log('[Settings] Skipping save - not initialized yet');
    return;
  }
  
  console.log('[Settings] Settings changed, saving:', value);
  try {
    await saveToStore('appSettings', value);
    console.log('[Settings] Settings saved successfully');
  } catch (error) {
    console.error('[Settings] Failed to save settings:', error);
  }
});

// Helper functions
export function updateToken(token: string) {
  settings.update(s => ({ ...s, token }));
}

export function updateWorkspace(workspace: string) {
  settings.update(s => ({ ...s, workspace }));
}

export function updateMaxResults(maxResults: number) {
  settings.update(s => ({ ...s, maxResults }));
}

export function updateTheme(theme: 'light' | 'dark' | 'auto') {
  settings.update(s => ({ ...s, theme }));
  applyTheme(theme);
}

export function updateKeyboardShortcuts(shortcuts: Partial<KeyboardShortcuts>) {
  settings.update(s => ({
    ...s,
    keyboardShortcuts: Object.assign({}, s.keyboardShortcuts, shortcuts) as KeyboardShortcuts
  }));
}

export function resetKeyboardShortcuts() {
  settings.update(s => ({
    ...s,
    keyboardShortcuts: defaultKeyboardShortcuts
  }));
}

export function getKeyboardShortcuts(): KeyboardShortcuts {
  let shortcuts: KeyboardShortcuts = defaultKeyboardShortcuts;
  settings.subscribe(s => {
    shortcuts = s.keyboardShortcuts || defaultKeyboardShortcuts;
  })();
  return shortcuts;
}

export function updateSettings(updates: Partial<AppSettings>) {
  settings.update(s => ({ ...s, ...updates }));
}

// Apply theme to document
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const root = document.documentElement;
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  applyTheme(initialSettings.theme);
}