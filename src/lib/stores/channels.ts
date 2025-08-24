import { writable, derived } from 'svelte/store';

interface ChannelInfo {
  id: string;
  name: string;
  isFavorite: boolean;
  lastUsed?: Date;
  useCount: number;
}

interface ChannelGroup {
  name: string;
  channels: string[]; // Channel names
  icon?: string;
}

interface ChannelState {
  allChannels: ChannelInfo[];
  favorites: string[]; // Channel IDs
  recentChannels: string[]; // Channel IDs  
  searchHistory: string[]; // Channel names
  selectedChannels: string[]; // Currently selected channel names for multi-select
  selectionMode: 'single' | 'multi';
  channelGroups: ChannelGroup[];
}

// Create the main store
function createChannelStore() {
  const { subscribe, update } = writable<ChannelState>({
    allChannels: [],
    favorites: [],
    recentChannels: [],
    searchHistory: [],
    selectedChannels: [],
    selectionMode: 'single',
    channelGroups: []
  });

  return {
    subscribe,
    
    // Initialize channels from backend
    async initChannels(channels: [string, string][]) {
      const favorites = await loadFavorites();
      const recentChannels = await loadRecentChannels();
      const channelGroups = await loadChannelGroups();
      
      update(state => ({
        ...state,
        allChannels: channels.map(([id, name]) => ({
          id,
          name,
          isFavorite: favorites.includes(id),
          useCount: 0
        })),
        favorites,
        recentChannels,
        channelGroups
      }));
    },
    
    // Toggle favorite status
    async toggleFavorite(channelId: string) {
      update(state => {
        const newFavorites = state.favorites.includes(channelId)
          ? state.favorites.filter(id => id !== channelId)
          : [...state.favorites, channelId];
        
        const allChannels = state.allChannels.map(ch => 
          ch.id === channelId 
            ? { ...ch, isFavorite: !ch.isFavorite }
            : ch
        );
        
        // Save to persistent storage
        saveFavorites(newFavorites);
        
        return {
          ...state,
          allChannels,
          favorites: newFavorites
        };
      });
    },
    
    // Add to recent channels
    addToRecent(channelName: string) {
      update(state => {
        const channel = state.allChannels.find(ch => ch.name === channelName);
        if (!channel) return state;
        
        // Update recent channels (keep last 10)
        const recentChannels = [
          channel.id,
          ...state.recentChannels.filter(id => id !== channel.id)
        ].slice(0, 10);
        
        // Update use count and last used
        const allChannels = state.allChannels.map(ch => 
          ch.id === channel.id 
            ? { ...ch, useCount: ch.useCount + 1, lastUsed: new Date() }
            : ch
        );
        
        // Update search history
        const searchHistory = [
          channel.name,
          ...state.searchHistory.filter(name => name !== channel.name)
        ].slice(0, 20);
        
        // Save to persistent storage
        saveRecentChannels(recentChannels);
        
        return {
          ...state,
          allChannels,
          recentChannels,
          searchHistory
        };
      });
    },
    
    // Toggle selection mode
    toggleSelectionMode() {
      update(state => ({
        ...state,
        selectionMode: state.selectionMode === 'single' ? 'multi' : 'single',
        selectedChannels: state.selectionMode === 'multi' ? [] : state.selectedChannels
      }));
    },
    
    // Toggle channel selection (for multi-select)
    toggleChannelSelection(channelName: string) {
      update(state => {
        if (state.selectionMode === 'single') {
          return {
            ...state,
            selectedChannels: [channelName]
          };
        }
        
        const selectedChannels = state.selectedChannels.includes(channelName)
          ? state.selectedChannels.filter(name => name !== channelName)
          : [...state.selectedChannels, channelName];
        
        return {
          ...state,
          selectedChannels
        };
      });
    },
    
    // Clear selected channels
    clearSelection() {
      update(state => ({
        ...state,
        selectedChannels: []
      }));
    },
    
    // Select all favorite channels
    selectAllFavorites() {
      update(state => {
        const favoriteChannels = state.allChannels
          .filter(ch => ch.isFavorite)
          .map(ch => ch.name);
        
        return {
          ...state,
          selectedChannels: favoriteChannels,
          selectionMode: 'multi'
        };
      });
    },
    
    // Select multiple channels at once
    selectMultipleChannels(channelNames: string[]) {
      update(state => ({
        ...state,
        selectedChannels: channelNames,
        selectionMode: 'multi'
      }));
    },
    
    // Save current selection as a channel group
    async saveChannelGroup(name: string, icon?: string) {
      update(state => {
        const newGroup: ChannelGroup = {
          name,
          channels: [...state.selectedChannels],
          icon
        };
        
        const groups = [...state.channelGroups.filter(g => g.name !== name), newGroup];
        saveChannelGroups(groups);
        
        return {
          ...state,
          channelGroups: groups
        };
      });
    },
    
    // Load a channel group
    loadChannelGroup(groupName: string) {
      update(state => {
        const group = state.channelGroups.find(g => g.name === groupName);
        if (group) {
          return {
            ...state,
            selectedChannels: group.channels,
            selectionMode: 'multi'
          };
        }
        return state;
      });
    },
    
    // Delete a channel group
    async deleteChannelGroup(groupName: string) {
      update(state => {
        const groups = state.channelGroups.filter(g => g.name !== groupName);
        saveChannelGroups(groups);
        return {
          ...state,
          channelGroups: groups
        };
      });
    },
    
    // Select recent channels
    selectRecentChannels(limit: number = 5) {
      update(state => {
        const recentChannelNames = state.recentChannels
          .slice(0, limit)
          .map(id => state.allChannels.find(ch => ch.id === id)?.name)
          .filter(Boolean) as string[];
        
        return {
          ...state,
          selectedChannels: recentChannelNames,
          selectionMode: 'multi'
        };
      });
    }
  };
}

// Persistent storage functions
async function loadFavorites(): Promise<string[]> {
  // Use localStorage
  const stored = localStorage.getItem('channel_favorites');
  return stored ? JSON.parse(stored) : [];
}

async function saveFavorites(favorites: string[]): Promise<void> {
  // Use localStorage
  localStorage.setItem('channel_favorites', JSON.stringify(favorites));
}

async function loadRecentChannels(): Promise<string[]> {
  // Use localStorage
  const stored = localStorage.getItem('recent_channels');
  return stored ? JSON.parse(stored) : [];
}

async function saveRecentChannels(recent: string[]): Promise<void> {
  // Use localStorage
  localStorage.setItem('recent_channels', JSON.stringify(recent));
}

async function loadChannelGroups(): Promise<ChannelGroup[]> {
  const stored = localStorage.getItem('channel_groups');
  return stored ? JSON.parse(stored) : [];
}

async function saveChannelGroups(groups: ChannelGroup[]): Promise<void> {
  localStorage.setItem('channel_groups', JSON.stringify(groups));
}

export const channelStore = createChannelStore();

// Derived stores for easy access
export const favoriteChannels = derived(
  channelStore,
  $store => $store.allChannels.filter(ch => ch.isFavorite)
);

export const recentChannelsList = derived(
  channelStore,
  $store => $store.recentChannels
    .map(id => $store.allChannels.find(ch => ch.id === id))
    .filter(Boolean) as ChannelInfo[]
);

export const sortedChannels = derived(
  channelStore,
  $store => {
    // Sort: Favorites first, then by use count, then alphabetically
    return [...$store.allChannels].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.useCount !== b.useCount) return b.useCount - a.useCount;
      return a.name.localeCompare(b.name);
    });
  }
);

export const channelGroups = derived(
  channelStore,
  $store => $store.channelGroups
);