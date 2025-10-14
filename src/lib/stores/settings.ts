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
  // focusUrlInput removed - no keyboard shortcut
  toggleSettings: 'Ctrl+,',
  newSearch: 'Ctrl+N',
  nextResult: ['j', 'ArrowDown'],
  prevResult: ['k', 'ArrowUp'],
  openResult: 'Enter',
  clearSearch: 'Escape',
  toggleChannelSelector: 'Ctrl+Shift+C',
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
  openUrls: 'Alt+Enter',
  reaction1: '1',
  reaction2: '2',
  reaction3: '3',
  reaction4: '4',
  reaction5: '5',
  reaction6: '6',
  reaction7: '7',
  reaction8: '8',
  reaction9: '9',
  // Shortcuts for reactions from other users
  otherReaction1: 'Shift+1',
  otherReaction2: 'Shift+2',
  otherReaction3: 'Shift+3',
  otherReaction4: 'Shift+4',
  otherReaction5: 'Shift+5',
  otherReaction6: 'Shift+6',
  otherReaction7: 'Shift+7',
  otherReaction8: 'Shift+8',
  otherReaction9: 'Shift+9',
  toggleKeyboardHelp: '?',
  exportThread: 'Ctrl+E',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  zoomReset: 'Ctrl+0',
  toggleChannelFavorite: 'f',
  togglePerformanceMonitor: 'Ctrl+Shift+P',
  // Saved searches shortcuts
  toggleSavedSearches: 'Ctrl+/',
  saveCurrentSearch: 'Ctrl+Shift+S',
  quickSaveSearch: 'Alt+S',
  refreshSearch: 'Ctrl+Shift+R',
  // Lightbox shortcuts
  openLightbox: 'i',
  lightboxNext: ['ArrowRight', 'l', 'Tab'],
  lightboxPrevious: ['ArrowLeft', 'h', 'Shift+Tab'],
  lightboxScrollUp: ['ArrowUp', 'k'],
  lightboxScrollDown: ['ArrowDown', 'j'],
  lightboxZoomIn: ['+', '='],
  lightboxZoomOut: '-',
  lightboxZoomReset: '0',
  lightboxClose: 'Escape',
  // File shortcuts
  downloadAllAttachments: 'd',
  uploadFiles: 'Ctrl+U',
  // Bookmark shortcuts
  toggleBookmark: 'b',  // Toggle bookmark on a message
  toggleBookmarkManager: 'Ctrl+B',  // Toggle bookmark dropdown list
  // Mark message as read
  markMessageAsRead: 'Shift+R',  // Mark the currently focused message as read on Slack
  // Today's Catch Up
  todaysCatchUp: 'Ctrl+Shift+T',  // Fetch and mark today's messages from unmuted channels
  // Search History shortcuts
  toggleKeywordHistory: 'Ctrl+H',  // Toggle search keyword history dropdown
  toggleUrlHistory: 'Ctrl+T',  // Toggle URL history dropdown
  // User and Date Filter shortcuts
  focusUserSelector: 'Ctrl+Shift+U',  // Focus the user selector input field
  focusFromDate: 'Ctrl+Shift+D'  // Focus the "from date" input field
};

// Default settings
const defaultSettings: AppSettings = {
  maxResults: 1000,
  theme: 'auto',
  keyboardShortcuts: defaultKeyboardShortcuts,
  reactionMappings: DEFAULT_REACTION_MAPPINGS,
  debugMode: false,  // Performance monitor is hidden by default
  downloadFolder: null,  // null means use default Downloads folder
  experimentalFeatures: {
    highlightNewSearchResults: true  // New message highlighting is enabled by default
  }
};

// Initialize settings with default values
let initialSettings: AppSettings = defaultSettings;
let isInitialized = false;

// Settings store
export const settings = writable<AppSettings>(initialSettings);

// Migrate old shortcut format to new array format
function migrateShortcuts(shortcuts: any): KeyboardShortcuts {
  const migrated = { ...defaultKeyboardShortcuts };

  if (shortcuts) {
    for (const key in shortcuts) {
      const value = shortcuts[key];

      // Special migration for nextResult and prevResult
      if (key === 'nextResult') {
        if (value === 'ArrowDown' || (typeof value === 'string' && !Array.isArray(value))) {
          migrated.nextResult = ['j', 'ArrowDown'];
        } else {
          migrated.nextResult = value;
        }
      } else if (key === 'prevResult') {
        if (value === 'ArrowUp' || (typeof value === 'string' && !Array.isArray(value))) {
          migrated.prevResult = ['k', 'ArrowUp'];
        } else {
          migrated.prevResult = value;
        }
      } else if (key === 'toggleChannelSelector' && (value === 'Ctrl+L' || value === 'Ctrl+H')) {
        // Force migrate old shortcuts to new Ctrl+Shift+C
        migrated.toggleChannelSelector = 'Ctrl+Shift+C';
        // Note: Ctrl+H is now used for toggleKeywordHistory, Ctrl+L for toggleLiveMode
      } else if (key === 'todaysCatchUp' && (value === 'Ctrl+T' || value === 'ctrl+t' || value === 'Ctrl+Shift+R')) {
        // Force migrate old shortcuts to new Ctrl+Shift+T
        // Old values: 'ctrl+t' (original), 'Ctrl+T' (intermediate), or potentially 'Ctrl+Shift+R' (if manually set)
        migrated.todaysCatchUp = 'Ctrl+Shift+T';
        // Note: Ctrl+T is now used for toggleUrlHistory, Ctrl+Shift+R for refreshSearch
      } else if (key in migrated) {
        (migrated as any)[key] = value;
      }
    }
  }

  return migrated;
}

// Load settings asynchronously
export async function initializeSettings() {
  console.log('[Settings] Initializing settings...');
  const loadedSettings = await loadFromStore<Partial<AppSettings>>('appSettings', {});
  console.log('[Settings] Loaded settings:', loadedSettings);
  
  const mergedSettings: AppSettings = {
    ...defaultSettings,
    ...loadedSettings,
    keyboardShortcuts: migrateShortcuts(loadedSettings.keyboardShortcuts),
    reactionMappings: loadedSettings.reactionMappings || DEFAULT_REACTION_MAPPINGS,
    userFavorites: loadedSettings.userFavorites || [],  // Preserve user favorites
    userFavoriteOrder: loadedSettings.userFavoriteOrder || [],  // Preserve user favorite order
    debugMode: loadedSettings.debugMode ?? false,  // Default to false if not set
    // Properly merge experimental features
    // For promoted features (highlightNewSearchResults), always use the new default
    experimentalFeatures: {
      highlightNewSearchResults: true  // Always enabled as a standard feature
    }
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

export function toggleDebugMode() {
  settings.update(s => ({ ...s, debugMode: !s.debugMode }));
}

export function updateDownloadFolder(folder: string | null) {
  settings.update(s => ({ ...s, downloadFolder: folder }));
}

export function getDownloadFolder(): string | null {
  let folder: string | null = null;
  settings.subscribe(s => {
    folder = s.downloadFolder || null;
  })();
  return folder;
}

// Apply theme to document
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const root = document.documentElement;

  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
  }
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  applyTheme(initialSettings.theme);
}

// Experimental features management
export function isHighlightNewSearchResultsEnabled(): boolean {
  let enabled = false;
  settings.subscribe(s => {
    enabled = s.experimentalFeatures?.highlightNewSearchResults || false;
  })();
  return enabled;
}