import { writable, derived, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';
import { workspaceStore, activeWorkspace } from './workspaces';

export interface SavedUrl {
  id: string;
  url: string;
  title?: string;
  alias?: string; // User-defined alias for the URL
  timestamp: Date;
  usageCount: number;
  lastUsed?: Date;
  isFavorite?: boolean;
  channelId?: string;
  channelName?: string;
  messageTs?: string;
}

// Storage key is workspace-specific
const getStorageKey = (workspaceId: string) => `urlHistory_${workspaceId}`;
const MAX_URL_HISTORY = 50;
const MAX_RECENT_URLS = 10;

// Create the main store
function createUrlHistoryStore() {
  const { subscribe, set, update } = writable<SavedUrl[]>([]);

  // Load URL history on initialization
  const initialize = async () => {
    try {
      const workspace = get(activeWorkspace);
      if (!workspace) {
        console.log('[UrlHistory] No active workspace');
        set([]);
        return;
      }

      const storageKey = getStorageKey(workspace.id);
      const stored = await loadFromStore<SavedUrl[]>(storageKey, []);

      // Convert date strings back to Date objects
      const urls = stored.map(u => ({
        ...u,
        timestamp: new Date(u.timestamp),
        lastUsed: u.lastUsed ? new Date(u.lastUsed) : undefined
      }));
      set(urls);
      console.log(`[UrlHistory] Initialized with ${urls.length} URLs for workspace ${workspace.id}`);
    } catch (error) {
      console.error('[UrlHistory] Failed to initialize:', error);
      set([]);
    }
  };

  // Save to persistent storage
  const persist = async (urls: SavedUrl[]) => {
    const workspace = get(activeWorkspace);
    if (!workspace) {
      console.warn('[UrlHistory] Cannot persist - no active workspace');
      return;
    }
    const storageKey = getStorageKey(workspace.id);
    await saveToStore(storageKey, urls.slice(0, MAX_URL_HISTORY));
  };

  // Generate a unique ID
  const generateId = () => {
    return `url_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Extract info from Slack URL
  const extractUrlInfo = (url: string): Partial<SavedUrl> => {
    const info: Partial<SavedUrl> = {};

    // Try to extract channel and message timestamp from URL
    // Format: https://workspace.slack.com/archives/CHANNEL_ID/pMESSAGE_TS
    const urlMatch = url.match(/\/archives\/([^\/]+)\/p(\d+)/);
    if (urlMatch) {
      info.channelId = urlMatch[1];
      // Convert message timestamp format (remove 'p' and add decimal point)
      const ts = urlMatch[2];
      if (ts.length > 6) {
        info.messageTs = `${ts.substring(0, ts.length - 6)}.${ts.substring(ts.length - 6)}`;
      }
    }

    return info;
  };

  // Check if a URL already exists
  const isDuplicate = (url: string, existingUrls: SavedUrl[]): SavedUrl | null => {
    return existingUrls.find(saved => saved.url === url) || null;
  };

  // Save a new URL
  const saveUrl = async (url: string, title?: string) => {
    const currentUrls = get({ subscribe });

    // Check for duplicates
    const duplicate = isDuplicate(url, currentUrls);

    if (duplicate) {
      // Update usage count and last used time for duplicate
      let updatedUrls: SavedUrl[];
      update(urls => {
        updatedUrls = urls.map(u =>
          u.id === duplicate.id
            ? { ...u, usageCount: u.usageCount + 1, lastUsed: new Date() }
            : u
        );
        return updatedUrls;
      });
      await persist(updatedUrls!);
      return duplicate;
    }

    // Extract additional info from URL
    const urlInfo = extractUrlInfo(url);

    const newUrl: SavedUrl = {
      id: generateId(),
      url,
      title: title || urlInfo.channelName || 'Thread URL',
      timestamp: new Date(),
      usageCount: 1,
      lastUsed: new Date(),
      isFavorite: false,
      ...urlInfo
    };

    let updatedUrls: SavedUrl[];
    update(urls => {
      updatedUrls = [newUrl, ...urls].slice(0, MAX_URL_HISTORY);
      return updatedUrls;
    });
    await persist(updatedUrls!);

    return newUrl;
  };

  // Update a saved URL
  const updateUrl = async (id: string, updates: Partial<SavedUrl>) => {
    let updatedUrls: SavedUrl[];
    update(urls => {
      updatedUrls = urls.map(u =>
        u.id === id ? { ...u, ...updates } : u
      );
      return updatedUrls;
    });
    await persist(updatedUrls!);
  };

  // Delete a saved URL
  const deleteUrl = async (id: string) => {
    let updatedUrls: SavedUrl[];
    update(urls => {
      updatedUrls = urls.filter(u => u.id !== id);
      return updatedUrls;
    });
    await persist(updatedUrls!);
  };

  // Toggle favorite status
  const toggleFavorite = async (id: string) => {
    let updatedUrls: SavedUrl[];
    update(urls => {
      updatedUrls = urls.map(u =>
        u.id === id ? { ...u, isFavorite: !u.isFavorite } : u
      );
      return updatedUrls;
    });
    await persist(updatedUrls!);
  };

  // Use a saved URL (increment usage count)
  const useUrl = async (id: string) => {
    let updatedUrls: SavedUrl[];
    update(urls => {
      updatedUrls = urls.map(u =>
        u.id === id
          ? { ...u, usageCount: u.usageCount + 1, lastUsed: new Date() }
          : u
      );
      return updatedUrls;
    });
    await persist(updatedUrls!);
  };

  // Clear all URL history for current workspace
  const clearAll = async () => {
    set([]);
    await persist([]);
  };

  // Reset the store when switching workspaces
  const reset = () => {
    set([]);
  };

  // Get URL by ID
  const getById = (id: string): SavedUrl | undefined => {
    const urls = get({ subscribe });
    return urls.find(u => u.id === id);
  };

  // Update alias for a URL
  const updateAlias = async (id: string, alias: string) => {
    await updateUrl(id, { alias: alias.trim() || undefined });
  };

  return {
    subscribe,
    initialize,
    saveUrl,
    updateUrl,
    updateAlias,
    deleteUrl,
    toggleFavorite,
    useUrl,
    clearAll,
    reset,
    getById,
    isDuplicate: (url: string) => isDuplicate(url, get({ subscribe }))
  };
}

// Create the store instance
export const urlHistoryStore = createUrlHistoryStore();

// Derived stores for filtered views
export const favoriteUrls = derived(
  urlHistoryStore,
  $urls => $urls.filter(u => u.isFavorite)
    .sort((a, b) => b.usageCount - a.usageCount)
);

export const recentUrls = derived(
  urlHistoryStore,
  $urls => {
    const sorted = [...$urls]
      .filter(u => u.lastUsed)
      .sort((a, b) => {
        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return dateB - dateA;
      });
    return sorted.slice(0, MAX_RECENT_URLS);
  }
);

export const frequentUrls = derived(
  urlHistoryStore,
  $urls => [...$urls]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10)
);