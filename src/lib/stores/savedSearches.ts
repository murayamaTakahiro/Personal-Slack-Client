import { writable, derived, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';

export interface SavedSearch {
  id: string;
  name: string;
  query?: string;
  channel?: string;
  user?: string;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  timestamp: Date;
  usageCount: number;
  lastUsed?: Date;
  isFavorite?: boolean;
}

const STORAGE_KEY = 'savedSearches';
const MAX_SAVED_SEARCHES = 50;
const MAX_RECENT_SEARCHES = 10;

// Create the main store
function createSavedSearchesStore() {
  const { subscribe, set, update } = writable<SavedSearch[]>([]);

  // Load saved searches on initialization
  const initialize = async () => {
    const stored = await loadFromStore<SavedSearch[]>(STORAGE_KEY, []);
    // Convert date strings back to Date objects
    const searches = stored.map(s => ({
      ...s,
      timestamp: new Date(s.timestamp),
      lastUsed: s.lastUsed ? new Date(s.lastUsed) : undefined
    }));
    set(searches);
  };

  // Save to persistent storage
  const persist = async (searches: SavedSearch[]) => {
    await saveToStore(STORAGE_KEY, searches.slice(0, MAX_SAVED_SEARCHES));
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
    user?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }) => {
    const currentSearches = get({ subscribe });
    
    // Check for duplicates
    const duplicate = isDuplicate(searchParams, currentSearches);
    
    if (duplicate) {
      // Update usage count and last used time for duplicate
      await update(searches => {
        const updated = searches.map(s => 
          s.id === duplicate.id 
            ? { ...s, usageCount: s.usageCount + 1, lastUsed: new Date() }
            : s
        );
        persist(updated);
        return updated;
      });
      return duplicate;
    }

    // Generate automatic name if not provided
    const autoName = generateAutoName(searchParams);
    
    const newSearch: SavedSearch = {
      id: generateId(),
      name: searchParams.name || autoName,
      query: searchParams.query || undefined,
      channel: searchParams.channel || undefined,
      user: searchParams.user || undefined,
      userId: searchParams.userId || undefined,
      fromDate: searchParams.fromDate || undefined,
      toDate: searchParams.toDate || undefined,
      limit: searchParams.limit || undefined,
      timestamp: new Date(),
      usageCount: 1,
      lastUsed: new Date(),
      isFavorite: false
    };

    await update(searches => {
      const updated = [newSearch, ...searches].slice(0, MAX_SAVED_SEARCHES);
      persist(updated);
      return updated;
    });

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
    
    if (params.user || params.userId) {
      parts.push(`from @${params.user || params.userId}`);
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
    await update(searches => {
      const updated = searches.map(s => 
        s.id === id ? { ...s, ...updates } : s
      );
      persist(updated);
      return updated;
    });
  };

  // Delete a saved search
  const deleteSearch = async (id: string) => {
    await update(searches => {
      const updated = searches.filter(s => s.id !== id);
      persist(updated);
      return updated;
    });
  };

  // Toggle favorite status
  const toggleFavorite = async (id: string) => {
    await update(searches => {
      const updated = searches.map(s => 
        s.id === id ? { ...s, isFavorite: !s.isFavorite } : s
      );
      persist(updated);
      return updated;
    });
  };

  // Use a saved search (increment usage count)
  const useSearch = async (id: string) => {
    await update(searches => {
      const updated = searches.map(s => 
        s.id === id 
          ? { ...s, usageCount: s.usageCount + 1, lastUsed: new Date() }
          : s
      );
      persist(updated);
      return updated;
    });
  };

  // Clear all saved searches
  const clearAll = async () => {
    set([]);
    await persist([]);
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

// Initialize on module load
if (typeof window !== 'undefined') {
  savedSearchesStore.initialize();
}