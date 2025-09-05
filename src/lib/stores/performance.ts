import { writable, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';

export interface PerformanceSettings {
  virtualScrolling: boolean;
  enableBatching: boolean;
  messageLimit: number;
  performanceMetrics: boolean;
}

const defaultPerformanceSettings: PerformanceSettings = {
  virtualScrolling: false, // Start with false for safety, users can enable it
  enableBatching: true,
  messageLimit: 1000,
  performanceMetrics: false
};

// Initialize settings
let initialSettings: PerformanceSettings = defaultPerformanceSettings;
let isInitialized = false;

// Create the store
export const performanceSettings = writable<PerformanceSettings>(initialSettings);

// Load settings asynchronously
export async function initializePerformanceSettings() {
  console.log('[Performance] Initializing performance settings...');
  const loadedSettings = await loadFromStore<Partial<PerformanceSettings>>('performanceSettings', {});
  console.log('[Performance] Loaded settings:', loadedSettings);
  
  const mergedSettings: PerformanceSettings = {
    ...defaultPerformanceSettings,
    ...loadedSettings
  };
  
  console.log('[Performance] Merged settings:', mergedSettings);
  performanceSettings.set(mergedSettings);
  
  // Mark as initialized after setting the loaded values
  isInitialized = true;
  
  return mergedSettings;
}

// Subscribe to settings changes and save persistently
performanceSettings.subscribe(async value => {
  // Skip saving during initialization
  if (!isInitialized) {
    console.log('[Performance] Skipping save - not initialized yet');
    return;
  }
  
  console.log('[Performance] Settings changed, saving:', value);
  try {
    await saveToStore('performanceSettings', value);
    console.log('[Performance] Settings saved successfully');
  } catch (error) {
    console.error('[Performance] Failed to save settings:', error);
  }
});

// Helper functions
export function toggleVirtualScrolling() {
  performanceSettings.update(s => ({ 
    ...s, 
    virtualScrolling: !s.virtualScrolling 
  }));
}

export function setVirtualScrolling(enabled: boolean) {
  performanceSettings.update(s => ({ 
    ...s, 
    virtualScrolling: enabled 
  }));
}

export function toggleBatching() {
  performanceSettings.update(s => ({ 
    ...s, 
    enableBatching: !s.enableBatching 
  }));
}

export function setBatching(enabled: boolean) {
  performanceSettings.update(s => ({ 
    ...s, 
    enableBatching: enabled 
  }));
}

export function setMessageLimit(limit: number) {
  performanceSettings.update(s => ({ 
    ...s, 
    messageLimit: Math.max(100, Math.min(5000, limit)) // Cap between 100 and 5000
  }));
}

export function togglePerformanceMetrics() {
  performanceSettings.update(s => ({ 
    ...s, 
    performanceMetrics: !s.performanceMetrics 
  }));
}

export function setPerformanceMetrics(enabled: boolean) {
  performanceSettings.update(s => ({ 
    ...s, 
    performanceMetrics: enabled 
  }));
}

export function getPerformanceSettings(): PerformanceSettings {
  return get(performanceSettings);
}