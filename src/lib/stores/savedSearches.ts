import { writable, derived, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';
import { workspaceStore, activeWorkspace } from './workspaces';

export interface SavedSearch {
  id: string;
  name: string;
  query?: string;
  channel?: string;
  user?: string;  // Display name of the user (deprecated, use userName instead)
  userId?: string;  // Slack user ID (e.g., U04F9M6J2Q4)
  userName?: string;  // Display name of the user
  fromDate?: string;
  toDate?: string;
  limit?: number;
  timestamp: Date;
  usageCount: number;
  lastUsed?: Date;
  isFavorite?: boolean;
}

// Storage key is now workspace-specific
const getStorageKey = (workspaceId: string) => `savedSearches_${workspaceId}`;
const MAX_SAVED_SEARCHES = 50;
const MAX_RECENT_SEARCHES = 10;

// Create the main store
function createSavedSearchesStore() {
  const { subscribe, set, update } = writable<SavedSearch[]>([]);

  // Load saved searches on initialization
  const initialize = async () => {
    try {
      const workspace = get(activeWorkspace);
      if (!workspace) {
        console.log('[SavedSearches] No active workspace');
        set([]);
        return;
      }

      const storageKey = getStorageKey(workspace.id);
      let stored = await loadFromStore<SavedSearch[]>(storageKey, []);

      // Migration: Check if there's legacy data in the old global key
      // Only do this once - check if we've already migrated
      if (stored.length === 0) {
        const migrationKey = 'savedSearches_migration_done';
        const migrationDone = await loadFromStore<boolean>(migrationKey, false);

        if (!migrationDone) {
          const legacyStored = await loadFromStore<SavedSearch[]>('savedSearches', []);
          if (legacyStored.length > 0) {
            console.log(`[SavedSearches] Migrating ${legacyStored.length} searches from legacy storage to workspace ${workspace.id}`);
            // Only migrate to the FIRST workspace that accesses this data
            stored = legacyStored;
            // Save to new workspace-specific key
            await saveToStore(storageKey, stored);
            // Mark migration as done so we don't migrate to other workspaces
            await saveToStore(migrationKey, true);
            // Clear the legacy data to prevent future migrations
            await saveToStore('savedSearches', []);
          }
        }
      }

      // Convert date strings back to Date objects
      const searches = stored.map(s => ({
        ...s,
        timestamp: new Date(s.timestamp),
        lastUsed: s.lastUsed ? new Date(s.lastUsed) : undefined
      }));
      set(searches);
      console.log(`[SavedSearches] Initialized with ${searches.length} searches for workspace ${workspace.id}`);
    } catch (error) {
      console.error('[SavedSearches] Failed to initialize:', error);
      // Set empty array on error to ensure app continues
      set([]);
    }
  };

  // Save to persistent storage
  const persist = async (searches: SavedSearch[]) => {
    const workspace = get(activeWorkspace);
    if (!workspace) {
      console.warn('[SavedSearches] Cannot persist - no active workspace');
      return;
    }
    const storageKey = getStorageKey(workspace.id);
    await saveToStore(storageKey, searches.slice(0, MAX_SAVED_SEARCHES));
  };

  // Generate a unique ID
  const generateId = () => {
    return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Check if a search already exists (duplicate detection)
  const isDuplicate = (searchParams: Partial<SavedSearch>, existingSearches: SavedSearch[]): SavedSearch | null => {
    return existingSearches.find(saved => {
      // Compare all relevant fields - treat undefined, null, and empty string as equivalent
      const normalize = (value: any) => value || undefined;
      
      return (
        normalize(saved.query) === normalize(searchParams.query) &&
        normalize(saved.channel) === normalize(searchParams.channel) &&
        normalize(saved.userId) === normalize(searchParams.userId) &&
        normalize(saved.fromDate) === normalize(searchParams.fromDate) &&
        normalize(saved.toDate) === normalize(searchParams.toDate)
      );
    }) || null;
  };

  // Save a new search
  const saveSearch = async (searchParams: {
    name?: string;
    query?: string;
    channel?: string;
    user?: string;  // Deprecated, use userName
    userId?: string;
    userName?: string;  // Display name of the user
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }) => {
    const currentSearches = get({ subscribe });
    
    // Check for duplicates
    const duplicate = isDuplicate(searchParams, currentSearches);
    
    if (duplicate) {
      // Update usage count and last used time for duplicate
      let updatedSearches: SavedSearch[];
      update(searches => {
        updatedSearches = searches.map(s =>
          s.id === duplicate.id
            ? { ...s, usageCount: s.usageCount + 1, lastUsed: new Date() }
            : s
        );
        return updatedSearches;
      });
      await persist(updatedSearches!);
      return duplicate;
    }

    // Generate automatic name if not provided
    const autoName = generateAutoName(searchParams);
    
    const newSearch: SavedSearch = {
      id: generateId(),
      name: searchParams.name || autoName,
      query: searchParams.query || undefined,
      channel: searchParams.channel || undefined,
      user: searchParams.user || searchParams.userName || undefined,  // Keep for backward compatibility
      userId: searchParams.userId || undefined,
      userName: searchParams.userName || searchParams.user || undefined,  // Prefer userName, fallback to user
      fromDate: searchParams.fromDate || undefined,
      toDate: searchParams.toDate || undefined,
      limit: searchParams.limit || undefined,
      timestamp: new Date(),
      usageCount: 1,
      lastUsed: new Date(),
      isFavorite: false
    };

    let updatedSearches: SavedSearch[];
    update(searches => {
      updatedSearches = [newSearch, ...searches].slice(0, MAX_SAVED_SEARCHES);
      return updatedSearches;
    });
    await persist(updatedSearches!);

    return newSearch;
  };

  // Generate an automatic name for the search
  const generateAutoName = (params: any): string => {
    const parts = [];
    
    if (params.query) {
      parts.push(`"${params.query.substring(0, 20)}${params.query.length > 20 ? '...' : ''}"`);
    }
    
    if (params.channel) {
      const channels = params.channel.split(',').map(c => c.trim());
      if (channels.length === 1) {
        parts.push(`in #${channels[0]}`);
      } else {
        parts.push(`in ${channels.length} channels`);
      }
    }
    
    if (params.userName || params.user || params.userId) {
      parts.push(`from @${params.userName || params.user || params.userId}`);
    }
    
    if (params.fromDate || params.toDate) {
      if (params.fromDate && params.toDate) {
        parts.push(`${params.fromDate} to ${params.toDate}`);
      } else if (params.fromDate) {
        parts.push(`from ${params.fromDate}`);
      } else if (params.toDate) {
        parts.push(`until ${params.toDate}`);
      }
    }
    
    return parts.join(' ') || 'Untitled Search';
  };

  // Update a saved search
  const updateSearch = async (id: string, updates: Partial<SavedSearch>) => {
    let updatedSearches: SavedSearch[];
    update(searches => {
      updatedSearches = searches.map(s =>
        s.id === id ? { ...s, ...updates } : s
      );
      return updatedSearches;
    });
    await persist(updatedSearches!);
  };

  // Delete a saved search
  const deleteSearch = async (id: string) => {
    let updatedSearches: SavedSearch[];
    update(searches => {
      updatedSearches = searches.filter(s => s.id !== id);
      return updatedSearches;
    });
    await persist(updatedSearches!);
  };

  // Toggle favorite status
  const toggleFavorite = async (id: string) => {
    let updatedSearches: SavedSearch[];
    update(searches => {
      updatedSearches = searches.map(s =>
        s.id === id ? { ...s, isFavorite: !s.isFavorite } : s
      );
      return updatedSearches;
    });
    await persist(updatedSearches!);
  };

  // Use a saved search (increment usage count)
  const useSearch = async (id: string) => {
    let updatedSearches: SavedSearch[];
    update(searches => {
      updatedSearches = searches.map(s =>
        s.id === id
          ? { ...s, usageCount: s.usageCount + 1, lastUsed: new Date() }
          : s
      );
      return updatedSearches;
    });
    await persist(updatedSearches!);
  };

  // Clear all saved searches for current workspace
  const clearAll = async () => {
    set([]);
    await persist([]);
  };

  // Reset the store when switching workspaces
  const reset = () => {
    set([]);
  };

  // Get search by ID
  const getById = (id: string): SavedSearch | undefined => {
    const searches = get({ subscribe });
    return searches.find(s => s.id === id);
  };

  return {
    subscribe,
    initialize,
    saveSearch,
    updateSearch,
    deleteSearch,
    toggleFavorite,
    useSearch,
    clearAll,
    reset,
    getById,
    isDuplicate: (params: Partial<SavedSearch>) => isDuplicate(params, get({ subscribe }))
  };
}

// Create the store instance
export const savedSearchesStore = createSavedSearchesStore();

// Derived stores for filtered views
export const favoriteSearches = derived(
  savedSearchesStore,
  $searches => $searches.filter(s => s.isFavorite)
    .sort((a, b) => b.usageCount - a.usageCount)
);

export const recentSearches = derived(
  savedSearchesStore,
  $searches => {
    const sorted = [...$searches]
      .filter(s => s.lastUsed)
      .sort((a, b) => {
        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return dateB - dateA;
      });
    return sorted.slice(0, MAX_RECENT_SEARCHES);
  }
);

export const frequentSearches = derived(
  savedSearchesStore,
  $searches => [...$searches]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10)
);

// Initialize from App.svelte instead of auto-initializing
// This prevents initialization before the app is ready