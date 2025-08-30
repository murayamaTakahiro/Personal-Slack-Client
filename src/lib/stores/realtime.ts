import { writable, derived, get } from 'svelte/store';
import { channelStore } from './channels';

export interface RealtimeState {
  isEnabled: boolean;
  updateInterval: number; // in seconds
  lastUpdateTime: Date | null;
  nextUpdateTime: Date | null;
  autoScroll: boolean;
  showNotifications: boolean;
  messageCount: number;
  lastSearchTimestamp: string | null; // Store the timestamp of the last searched message
  existingMessageIds: Set<string>; // Track existing message IDs to detect new ones
}

const defaultState: RealtimeState = {
  isEnabled: false,
  updateInterval: 30, // 30 seconds default
  lastUpdateTime: null,
  nextUpdateTime: null,
  autoScroll: true,
  showNotifications: false,
  messageCount: 0,
  lastSearchTimestamp: null,
  existingMessageIds: new Set()
};

// Load settings from localStorage
function loadRealtimeSettings(): Partial<RealtimeState> {
  if (typeof window === 'undefined') return {};
  
  const stored = localStorage.getItem('realtimeSettings');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      if (parsed.lastUpdateTime) {
        parsed.lastUpdateTime = new Date(parsed.lastUpdateTime);
      }
      if (parsed.nextUpdateTime) {
        parsed.nextUpdateTime = new Date(parsed.nextUpdateTime);
      }
      return parsed;
    } catch (error) {
      console.error('Failed to parse realtime settings:', error);
    }
  }
  return {};
}

// Save settings to localStorage
function saveRealtimeSettings(state: RealtimeState) {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('realtimeSettings', JSON.stringify({
    updateInterval: state.updateInterval,
    autoScroll: state.autoScroll,
    showNotifications: state.showNotifications
  }));
}

// Create the main store
function createRealtimeStore() {
  const loadedSettings = loadRealtimeSettings();
  console.log('Loaded realtime settings from localStorage:', loadedSettings);
  const initialState = { ...defaultState, ...loadedSettings };
  console.log('Initial realtime state:', initialState);
  const { subscribe, set, update } = writable<RealtimeState>(initialState);
  
  // Auto-save settings on change
  subscribe(state => {
    saveRealtimeSettings(state);
  });
  
  return {
    subscribe,
    
    /**
     * Enable or disable realtime mode
     */
    setEnabled(enabled: boolean) {
      update(state => ({
        ...state,
        isEnabled: enabled,
        lastUpdateTime: enabled ? new Date() : null,
        nextUpdateTime: enabled ? new Date(Date.now() + state.updateInterval * 1000) : null,
        messageCount: enabled ? 0 : state.messageCount,
        lastSearchTimestamp: enabled ? state.lastSearchTimestamp : null,
        existingMessageIds: enabled ? state.existingMessageIds : new Set()
      }));
    },
    
    /**
     * Update the refresh interval
     */
    setUpdateInterval(seconds: number) {
      console.log('Setting update interval to:', seconds, 'seconds');
      update(state => {
        const newState = { ...state, updateInterval: seconds };
        
        // Update next update time if realtime is active
        if (state.isEnabled && state.lastUpdateTime) {
          newState.nextUpdateTime = new Date(state.lastUpdateTime.getTime() + seconds * 1000);
        }
        
        return newState;
      });
    },
    
    /**
     * Record that an update just happened
     */
    recordUpdate(newMessageCount: number = 0, lastMessageTimestamp: string | null = null) {
      update(state => ({
        ...state,
        lastUpdateTime: new Date(),
        nextUpdateTime: state.isEnabled ? new Date(Date.now() + state.updateInterval * 1000) : null,
        messageCount: state.messageCount + newMessageCount,
        lastSearchTimestamp: lastMessageTimestamp || state.lastSearchTimestamp
      }));
    },
    
    /**
     * Update existing message IDs for incremental updates
     */
    updateMessageIds(messageIds: Set<string>) {
      update(state => ({
        ...state,
        existingMessageIds: messageIds
      }));
    },
    
    /**
     * Get the timestamp for incremental search
     */
    getLastSearchTimestamp(): string | null {
      const state = get(realtimeStore);
      return state.lastSearchTimestamp;
    },
    
    /**
     * Toggle auto-scroll setting
     */
    toggleAutoScroll() {
      update(state => ({
        ...state,
        autoScroll: !state.autoScroll
      }));
    },
    
    /**
     * Toggle notification setting
     */
    toggleNotifications() {
      update(state => ({
        ...state,
        showNotifications: !state.showNotifications
      }));
    },
    
    /**
     * Reset message count
     */
    resetMessageCount() {
      update(state => ({
        ...state,
        messageCount: 0
      }));
    },
    
    /**
     * Check if realtime mode should be available
     * (only in multi-channel selection mode)
     */
    isAvailable(): boolean {
      const channelState = get(channelStore);
      return channelState.selectionMode === 'multi' && channelState.selectedChannels.length > 0;
    }
  };
}

export const realtimeStore = createRealtimeStore();

// Derived store for time until next update
export const timeUntilUpdate = derived(
  realtimeStore,
  ($realtime, set) => {
    if (!$realtime.isEnabled || !$realtime.nextUpdateTime) {
      set(null);
      return;
    }
    
    const interval = setInterval(() => {
      const now = Date.now();
      const next = $realtime.nextUpdateTime?.getTime() || 0;
      const remaining = Math.max(0, Math.floor((next - now) / 1000));
      set(remaining);
    }, 1000);
    
    return () => clearInterval(interval);
  }
);

// Derived store for formatted last update time
export const formattedLastUpdate = derived(
  realtimeStore,
  $realtime => {
    if (!$realtime.lastUpdateTime) return null;
    
    const now = new Date();
    const diff = now.getTime() - $realtime.lastUpdateTime.getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return $realtime.lastUpdateTime.toLocaleTimeString();
  }
);