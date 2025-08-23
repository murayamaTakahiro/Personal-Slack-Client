import { Store } from '@tauri-apps/plugin-store';

// Create a store instance for persistent storage
let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = new Store('settings.json');
  }
  return store;
}

/**
 * Save data to persistent storage
 */
export async function saveToStore(key: string, value: any): Promise<void> {
  console.log('[PersistentStore] Saving to store:', key, value);
  
  if (!isTauri()) {
    console.log('[PersistentStore] Not in Tauri environment, using localStorage');
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }
  
  try {
    const s = await getStore();
    await s.set(key, value);
    await s.save();
    console.log('[PersistentStore] Successfully saved to Tauri store');
  } catch (error) {
    console.error('[PersistentStore] Failed to save to Tauri store:', error);
    // Fallback to localStorage if Tauri store fails
    localStorage.setItem(key, JSON.stringify(value));
    console.log('[PersistentStore] Fallback: saved to localStorage');
  }
}

/**
 * Load data from persistent storage
 */
export async function loadFromStore<T>(key: string, defaultValue: T): Promise<T> {
  console.log('[PersistentStore] Loading from store:', key);
  
  if (!isTauri()) {
    console.log('[PersistentStore] Not in Tauri environment, using localStorage');
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log('[PersistentStore] Loaded from localStorage:', parsed);
        return parsed;
      } catch {
        console.error('[PersistentStore] Failed to parse localStorage data');
        return defaultValue;
      }
    }
    console.log('[PersistentStore] No data in localStorage, returning default');
    return defaultValue;
  }
  
  try {
    const s = await getStore();
    const value = await s.get<T>(key);
    console.log('[PersistentStore] Loaded from Tauri store:', value);
    return value !== null && value !== undefined ? value : defaultValue;
  } catch (error) {
    console.error('[PersistentStore] Failed to load from Tauri store:', error);
    // Fallback to localStorage if Tauri store fails
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log('[PersistentStore] Fallback: loaded from localStorage:', parsed);
        return parsed;
      } catch {
        return defaultValue;
      }
    }
    console.log('[PersistentStore] No fallback data, returning default');
    return defaultValue;
  }
}

/**
 * Check if we're in a Tauri environment
 */
export function isTauri(): boolean {
  // Temporarily disable Tauri detection to use localStorage in development
  // This helps debug if the issue is specific to Tauri store
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    console.log('[PersistentStore] Development mode detected, using localStorage');
    return false;
  }
  return typeof window !== 'undefined' && '__TAURI__' in window;
}