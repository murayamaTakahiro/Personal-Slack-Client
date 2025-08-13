import { writable, derived, get } from 'svelte/store';
import type { 
  Workspace, 
  WorkspaceData, 
  WorkspaceState, 
  WorkspaceCreationParams,
  WorkspaceSwitchEvent 
} from '../types/workspace';
import { 
  saveTokenSecure, 
  getTokenSecure, 
  deleteTokenSecure
} from '../api/secure';
// Simple UUID v4 generator
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Storage keys
const WORKSPACES_KEY = 'workspaces';
const ACTIVE_WORKSPACE_KEY = 'activeWorkspaceId';
const WORKSPACE_DATA_PREFIX = 'workspace_data_';

// Default state
const defaultState: WorkspaceState = {
  workspaces: [],
  activeWorkspaceId: null,
  workspaceData: {}
};

// Load workspaces from localStorage
function loadWorkspaces(): WorkspaceState {
  if (typeof window === 'undefined') return defaultState;
  
  try {
    const workspacesJson = localStorage.getItem(WORKSPACES_KEY);
    const activeId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    const workspaces = workspacesJson ? JSON.parse(workspacesJson) : [];
    
    // Load workspace-specific data
    const workspaceData: Record<string, WorkspaceData> = {};
    workspaces.forEach((ws: Workspace) => {
      const dataKey = `${WORKSPACE_DATA_PREFIX}${ws.id}`;
      const dataJson = localStorage.getItem(dataKey);
      if (dataJson) {
        workspaceData[ws.id] = JSON.parse(dataJson);
      }
    });
    
    // Convert date strings back to Date objects
    const parsedWorkspaces = workspaces.map((ws: any) => ({
      ...ws,
      lastUsed: new Date(ws.lastUsed),
      createdAt: new Date(ws.createdAt)
    }));
    
    return {
      workspaces: parsedWorkspaces,
      activeWorkspaceId: activeId,
      workspaceData
    };
  } catch (error) {
    console.error('Failed to load workspaces:', error);
    return defaultState;
  }
}

// Save workspaces to localStorage
function saveWorkspacesToStorage(state: WorkspaceState) {
  if (typeof window === 'undefined') return;
  
  try {
    // Save workspaces list (without tokens)
    const workspacesToSave = state.workspaces.map(ws => ({
      ...ws,
      lastUsed: ws.lastUsed.toISOString(),
      createdAt: ws.createdAt.toISOString()
    }));
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspacesToSave));
    
    // Save active workspace ID
    if (state.activeWorkspaceId) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, state.activeWorkspaceId);
    } else {
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }
    
    // Save workspace-specific data
    Object.entries(state.workspaceData).forEach(([id, data]) => {
      const dataKey = `${WORKSPACE_DATA_PREFIX}${id}`;
      localStorage.setItem(dataKey, JSON.stringify(data));
    });
  } catch (error) {
    console.error('Failed to save workspaces:', error);
  }
}

// Create the main store
function createWorkspaceStore() {
  const initialState = loadWorkspaces();
  const { subscribe, set, update } = writable<WorkspaceState>(initialState);
  
  // Auto-save on changes
  subscribe(state => {
    saveWorkspacesToStorage(state);
  });
  
  return {
    subscribe,
    
    /**
     * Add a new workspace
     */
    async addWorkspace(params: WorkspaceCreationParams): Promise<Workspace> {
      const workspace: Workspace = {
        id: uuidv4(),
        name: params.name,
        domain: params.domain,
        isActive: false,
        lastUsed: new Date(),
        createdAt: new Date(),
        color: params.color
      };
      
      // Save token securely (using workspace ID as key)
      await saveTokenSecure(params.token, workspace.id);
      
      // Initialize workspace data
      const workspaceData: WorkspaceData = {
        workspaceId: workspace.id,
        channels: [],
        channelFavorites: [],
        recentChannels: [],
        searchHistory: [],
        userFavorites: [],
        lastSync: new Date()
      };
      
      update(state => ({
        ...state,
        workspaces: [...state.workspaces, workspace],
        workspaceData: {
          ...state.workspaceData,
          [workspace.id]: workspaceData
        }
      }));
      
      return workspace;
    },
    
    /**
     * Update an existing workspace
     */
    async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<void> {
      update(state => ({
        ...state,
        workspaces: state.workspaces.map(ws => 
          ws.id === id ? { ...ws, ...updates } : ws
        )
      }));
    },
    
    /**
     * Delete a workspace
     */
    async deleteWorkspace(id: string): Promise<void> {
      // Delete the token
      await deleteTokenSecure(id);
      
      // Remove from state
      update(state => {
        const newState = {
          ...state,
          workspaces: state.workspaces.filter(ws => ws.id !== id)
        };
        
        // If this was the active workspace, clear it
        if (state.activeWorkspaceId === id) {
          newState.activeWorkspaceId = null;
        }
        
        // Remove workspace data
        delete newState.workspaceData[id];
        
        // Clean up localStorage
        if (typeof window !== 'undefined') {
          const dataKey = `${WORKSPACE_DATA_PREFIX}${id}`;
          localStorage.removeItem(dataKey);
        }
        
        return newState;
      });
    },
    
    /**
     * Switch to a different workspace
     */
    async switchWorkspace(id: string): Promise<boolean> {
      const state = get({ subscribe });
      const workspace = state.workspaces.find(ws => ws.id === id);
      
      if (!workspace) {
        console.error(`Workspace ${id} not found`);
        return false;
      }
      
      // Get the token for this workspace
      const token = await getTokenSecure(id);
      if (!token) {
        console.error(`No token found for workspace ${id}`);
        return false;
      }
      
      // Update active workspace
      update(state => ({
        ...state,
        activeWorkspaceId: id,
        workspaces: state.workspaces.map(ws => ({
          ...ws,
          isActive: ws.id === id,
          lastUsed: ws.id === id ? new Date() : ws.lastUsed
        }))
      }));
      
      // Emit switch event for other components to react
      const event = new CustomEvent('workspace-switched', {
        detail: {
          fromWorkspaceId: state.activeWorkspaceId,
          toWorkspaceId: id,
          timestamp: new Date()
        } as WorkspaceSwitchEvent
      });
      window.dispatchEvent(event);
      
      return true;
    },
    
    /**
     * Get token for a workspace
     */
    async getWorkspaceToken(id: string): Promise<string | null> {
      return await getTokenSecure(id);
    },
    
    /**
     * Get token for active workspace
     */
    async getActiveToken(): Promise<string | null> {
      const state = get({ subscribe });
      if (!state.activeWorkspaceId) return null;
      return await getTokenSecure(state.activeWorkspaceId);
    },
    
    /**
     * Update workspace-specific data
     */
    updateWorkspaceData(id: string, data: Partial<WorkspaceData>): void {
      update(state => ({
        ...state,
        workspaceData: {
          ...state.workspaceData,
          [id]: {
            ...state.workspaceData[id],
            ...data,
            workspaceId: id
          }
        }
      }));
    },
    
    /**
     * Migrate from legacy single workspace
     */
    async migrateFromLegacy(token: string, domain: string): Promise<void> {
      // Check if migration already done
      const state = get({ subscribe });
      if (state.workspaces.length > 0) return;
      
      // Create a default workspace from legacy data
      const workspace: Workspace = {
        id: 'legacy-' + uuidv4(),
        name: 'Default Workspace',
        domain: domain || 'workspace',
        isActive: true,
        lastUsed: new Date(),
        createdAt: new Date()
      };
      
      // Save token with new ID-based system
      await saveTokenSecure(token, workspace.id);
      
      // Load any existing channel/favorites data
      const workspaceData: WorkspaceData = {
        workspaceId: workspace.id,
        channels: [],
        channelFavorites: [],
        recentChannels: [],
        searchHistory: [],
        userFavorites: []
      };
      
      // Try to load existing favorites and recent channels
      if (typeof window !== 'undefined') {
        const favorites = localStorage.getItem('channel_favorites');
        const recent = localStorage.getItem('recent_channels');
        
        if (favorites) {
          workspaceData.channelFavorites = JSON.parse(favorites);
        }
        if (recent) {
          workspaceData.recentChannels = JSON.parse(recent);
        }
      }
      
      set({
        workspaces: [workspace],
        activeWorkspaceId: workspace.id,
        workspaceData: {
          [workspace.id]: workspaceData
        }
      });
    },
    
    /**
     * Clear all workspaces (for logout/reset)
     */
    async clearAll(): Promise<void> {
      const state = get({ subscribe });
      
      // Delete all tokens
      for (const workspace of state.workspaces) {
        await deleteTokenSecure(workspace.id);
      }
      
      // Clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem(WORKSPACES_KEY);
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        
        // Clear all workspace data
        state.workspaces.forEach(ws => {
          const dataKey = `${WORKSPACE_DATA_PREFIX}${ws.id}`;
          localStorage.removeItem(dataKey);
        });
      }
      
      set(defaultState);
    }
  };
}

// Create store instance
export const workspaceStore = createWorkspaceStore();

// Derived stores
export const activeWorkspace = derived(
  workspaceStore,
  $store => $store.workspaces.find(ws => ws.id === $store.activeWorkspaceId) || null
);

export const sortedWorkspaces = derived(
  workspaceStore,
  $store => [...$store.workspaces].sort((a, b) => 
    b.lastUsed.getTime() - a.lastUsed.getTime()
  )
);

export const activeWorkspaceData = derived(
  workspaceStore,
  $store => $store.activeWorkspaceId 
    ? $store.workspaceData[$store.activeWorkspaceId] || null
    : null
);