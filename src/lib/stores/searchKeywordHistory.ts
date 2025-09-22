import { writable, derived, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';
import { workspaceStore, activeWorkspace } from './workspaces';

export interface SearchKeyword {
  id: string;
  keyword: string;
  timestamp: Date;
  lastUsed: Date;
  usageCount: number;
  isFavorite: boolean;
}

// Storage key is workspace-specific
const getStorageKey = (workspaceId: string) => `searchKeywordHistory_${workspaceId}`;
const MAX_KEYWORD_HISTORY = 50;
const MAX_RECENT_KEYWORDS = 10;
const MAX_FREQUENT_KEYWORDS = 10;

// Create the main store
function createSearchKeywordHistoryStore() {
  const { subscribe, set, update } = writable<SearchKeyword[]>([]);

  // Load keyword history on initialization
  const initialize = async () => {
    try {
      const workspace = get(activeWorkspace);
      if (!workspace) {
        console.log('[SearchKeywordHistory] No active workspace');
        set([]);
        return;
      }

      const storageKey = getStorageKey(workspace.id);
      const stored = await loadFromStore<SearchKeyword[]>(storageKey, []);

      // Convert date strings back to Date objects
      const keywords = stored.map(k => ({
        ...k,
        timestamp: new Date(k.timestamp),
        lastUsed: new Date(k.lastUsed)
      }));
      set(keywords);
      console.log(`[SearchKeywordHistory] Initialized with ${keywords.length} keywords for workspace ${workspace.id}`);
    } catch (error) {
      console.error('[SearchKeywordHistory] Failed to initialize:', error);
      set([]);
    }
  };

  // Save to persistent storage
  const persist = async (keywords: SearchKeyword[]) => {
    const workspace = get(activeWorkspace);
    if (!workspace) {
      console.warn('[SearchKeywordHistory] Cannot persist - no active workspace');
      return;
    }
    const storageKey = getStorageKey(workspace.id);
    await saveToStore(storageKey, keywords.slice(0, MAX_KEYWORD_HISTORY));
  };

  // Generate a unique ID
  const generateId = () => {
    return `keyword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Check if a keyword already exists
  const isDuplicate = (keyword: string, existingKeywords: SearchKeyword[]): SearchKeyword | null => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return existingKeywords.find(k => k.keyword.toLowerCase() === normalizedKeyword) || null;
  };

  // Save a new keyword
  const saveKeyword = async (keyword: string) => {
    if (!keyword || !keyword.trim()) return null;

    const trimmedKeyword = keyword.trim();
    const currentKeywords = get({ subscribe });

    // Check for duplicates
    const duplicate = isDuplicate(trimmedKeyword, currentKeywords);

    if (duplicate) {
      // Update usage count and last used time for duplicate
      let updatedKeywords: SearchKeyword[];
      update(keywords => {
        updatedKeywords = keywords.map(k =>
          k.id === duplicate.id
            ? { ...k, usageCount: k.usageCount + 1, lastUsed: new Date() }
            : k
        );
        // Re-sort to bring the used item to the top
        return updatedKeywords.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
      });
      await persist(updatedKeywords!);
      return duplicate;
    }

    const newKeyword: SearchKeyword = {
      id: generateId(),
      keyword: trimmedKeyword,
      timestamp: new Date(),
      lastUsed: new Date(),
      usageCount: 1,
      isFavorite: false
    };

    let updatedKeywords: SearchKeyword[];
    update(keywords => {
      updatedKeywords = [newKeyword, ...keywords].slice(0, MAX_KEYWORD_HISTORY);
      return updatedKeywords;
    });
    await persist(updatedKeywords!);

    return newKeyword;
  };

  // Update a saved keyword
  const updateKeyword = async (id: string, updates: Partial<SearchKeyword>) => {
    let updatedKeywords: SearchKeyword[];
    update(keywords => {
      updatedKeywords = keywords.map(k =>
        k.id === id ? { ...k, ...updates } : k
      );
      return updatedKeywords;
    });
    await persist(updatedKeywords!);
  };

  // Delete a saved keyword
  const deleteKeyword = async (id: string) => {
    let updatedKeywords: SearchKeyword[];
    update(keywords => {
      updatedKeywords = keywords.filter(k => k.id !== id);
      return updatedKeywords;
    });
    await persist(updatedKeywords!);
  };

  // Toggle favorite status
  const toggleFavorite = async (id: string) => {
    let updatedKeywords: SearchKeyword[];
    update(keywords => {
      updatedKeywords = keywords.map(k =>
        k.id === id ? { ...k, isFavorite: !k.isFavorite } : k
      );
      return updatedKeywords;
    });
    await persist(updatedKeywords!);
  };

  // Use a saved keyword (increment usage count)
  const useKeyword = async (id: string) => {
    let updatedKeywords: SearchKeyword[];
    update(keywords => {
      updatedKeywords = keywords.map(k =>
        k.id === id
          ? { ...k, usageCount: k.usageCount + 1, lastUsed: new Date() }
          : k
      );
      // Re-sort to bring the used item to the top
      return updatedKeywords.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
    });
    await persist(updatedKeywords!);
  };

  // Clear all keyword history for current workspace
  const clearAll = async () => {
    set([]);
    await persist([]);
  };

  // Reset the store when switching workspaces
  const reset = () => {
    set([]);
  };

  // Get keyword by ID
  const getById = (id: string): SearchKeyword | undefined => {
    const keywords = get({ subscribe });
    return keywords.find(k => k.id === id);
  };

  return {
    subscribe,
    initialize,
    saveKeyword,
    updateKeyword,
    deleteKeyword,
    toggleFavorite,
    useKeyword,
    clearAll,
    reset,
    getById,
    isDuplicate: (keyword: string) => isDuplicate(keyword, get({ subscribe }))
  };
}

// Create the store instance
export const searchKeywordHistoryStore = createSearchKeywordHistoryStore();

// Derived stores for filtered views
export const favoriteKeywords = derived(
  searchKeywordHistoryStore,
  $keywords => $keywords
    .filter(k => k.isFavorite)
    .sort((a, b) => {
      // First sort by usage count, then by last used
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return b.lastUsed.getTime() - a.lastUsed.getTime();
    })
);

export const recentKeywords = derived(
  searchKeywordHistoryStore,
  $keywords => {
    const sorted = [...$keywords]
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
    return sorted.slice(0, MAX_RECENT_KEYWORDS);
  }
);

export const frequentKeywords = derived(
  searchKeywordHistoryStore,
  $keywords => [...$keywords]
    .sort((a, b) => {
      // First sort by usage count, then by last used
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return b.lastUsed.getTime() - a.lastUsed.getTime();
    })
    .slice(0, MAX_FREQUENT_KEYWORDS)
);