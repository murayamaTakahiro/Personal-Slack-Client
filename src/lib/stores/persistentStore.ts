// Dynamically import Store to handle cases where Tauri might not be available
let storeModule: any = null;
let store: any = null;
let storeInitialized = false;

async function getStore(): Promise<any> {
  // Return existing store if already initialized successfully
  if (store) {
    return store;
  }

  // Only set initialized flag after successful initialization
  if (!storeInitialized) {
    try {
      // Only try to import if we're in Tauri environment
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        // Import the store module
        if (!storeModule) {
          storeModule = await import('@tauri-apps/plugin-store');
          console.log('[PersistentStore] Store module imported successfully');
        }

        // For Tauri v2, use load() to get or create the store
        const { load } = storeModule;
        store = await load('settings.json', { autoSave: true });
        console.log('[PersistentStore] Successfully initialized Tauri store with load()');
        storeInitialized = true;
      } else {
        console.log('[PersistentStore] Not in Tauri environment, will use localStorage');
        storeInitialized = true; // In non-Tauri env, don't retry
      }
    } catch (error) {
      console.warn('[PersistentStore] Failed to initialize Tauri store, will use localStorage:', error);
      // Don't set initialized flag on error, allow retry
    }
  }
  return store;
}

/**
 * Save data to persistent storage
 */
export async function saveToStore(key: string, value: any): Promise<void> {
  console.log('[PersistentStore] Saving to store:', key, value);
  
  // Validate inputs
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid key provided to saveToStore');
  }
  
  try {
    // Try to get Tauri store
    const s = await getStore();
    
    if (!s) {
      // No Tauri store available, use localStorage
      console.log('[PersistentStore] Using localStorage');
      const serializedValue = JSON.stringify(value);
      localStorage.setItem(key, serializedValue);
      return;
    }
    
    // Use Tauri store
    await s.set(key, value);
    // Note: autoSave is enabled, so no need to call save() explicitly
    console.log('[PersistentStore] Successfully saved to Tauri store');
  } catch (error) {
    console.error('[PersistentStore] Failed to save to Tauri store:', error);
    // Fallback to localStorage if Tauri store fails
    try {
      const serializedValue = JSON.stringify(value);
      localStorage.setItem(key, serializedValue);
      console.log('[PersistentStore] Fallback: saved to localStorage');
    } catch (fallbackError) {
      console.error('[PersistentStore] Even localStorage fallback failed:', fallbackError);
      throw new Error(`Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Load data from persistent storage
 */
export async function loadFromStore<T>(key: string, defaultValue: T): Promise<T> {
  console.log('[PersistentStore] Loading from store:', key);
  
  // Validate inputs
  if (!key || typeof key !== 'string') {
    console.warn('[PersistentStore] Invalid key provided to loadFromStore, returning default');
    return defaultValue;
  }
  
  try {
    // Try to get Tauri store
    const s = await getStore();
    
    if (!s) {
      // No Tauri store available, use localStorage
      console.log('[PersistentStore] Using localStorage');
      return loadFromLocalStorage(key, defaultValue);
    }
    
    // Use Tauri store
    const value = await s.get<T>(key);
    console.log('[PersistentStore] Loaded from Tauri store:', value);
    return value !== null && value !== undefined ? value : defaultValue;
  } catch (error) {
    console.error('[PersistentStore] Failed to load from Tauri store:', error);
    // Fallback to localStorage if Tauri store fails
    return loadFromLocalStorage(key, defaultValue);
  }
}

/**
 * Helper function to load from localStorage with error handling
 */
function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log('[PersistentStore] Loaded from localStorage:', parsed);
        return parsed;
      } catch (parseError) {
        console.error('[PersistentStore] Failed to parse localStorage data:', parseError);
        // Clean up corrupted data
        localStorage.removeItem(key);
        return defaultValue;
      }
    }
    console.log('[PersistentStore] No data in localStorage, returning default');
    return defaultValue;
  } catch (error) {
    console.error('[PersistentStore] localStorage access failed:', error);
    return defaultValue;
  }
}

/**
 * Check if we're in a Tauri environment
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}