import { writable } from 'svelte/store';

export interface FastSearchSettings {
  enabled: boolean;
  autoEnableThreshold: number; // Auto-enable fast search when expecting this many messages
  alwaysUseForMultiChannel: boolean;
  alwaysUseForNoQuery: boolean;
  showPerformanceMonitor: boolean;
}

const defaultSettings: FastSearchSettings = {
  enabled: true,
  autoEnableThreshold: 100, // Auto-enable for 100+ expected messages
  alwaysUseForMultiChannel: true,
  alwaysUseForNoQuery: true,
  showPerformanceMonitor: true
};

// Load settings from localStorage
function loadSettings(): FastSearchSettings {
  const stored = localStorage.getItem('fastSearchSettings');
  if (stored) {
    try {
      return { ...defaultSettings, ...JSON.parse(stored) };
    } catch (e) {
      console.error('Failed to load fast search settings:', e);
    }
  }
  return defaultSettings;
}

// Create the store
export const fastSearchSettings = writable<FastSearchSettings>(loadSettings());

// Save to localStorage on changes
fastSearchSettings.subscribe(settings => {
  localStorage.setItem('fastSearchSettings', JSON.stringify(settings));
});

// Helper to check if fast search should be used
export function shouldUseFastSearch(
  messageCount: number | undefined,
  isMultiChannel: boolean,
  hasNoQuery: boolean,
  settings: FastSearchSettings
): boolean {
  if (!settings.enabled) {
    return false;
  }
  
  // Always use for multi-channel if configured
  if (settings.alwaysUseForMultiChannel && isMultiChannel) {
    return true;
  }
  
  // Always use for no query (channel browse) if configured
  if (settings.alwaysUseForNoQuery && hasNoQuery) {
    return true;
  }
  
  // Use if expecting many messages
  if (messageCount && messageCount >= settings.autoEnableThreshold) {
    return true;
  }
  
  return false;
}