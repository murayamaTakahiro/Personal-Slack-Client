/**
 * Multi-workspace support types
 */

export interface Workspace {
  id: string;           // Unique identifier (UUID)
  name: string;         // User-friendly display name
  domain: string;       // Slack workspace domain (e.g., "mycompany")
  isActive: boolean;    // Currently selected workspace
  lastUsed: Date;       // Last access time for sorting
  color?: string;       // Optional color for visual identification
  createdAt: Date;      // When this workspace was added
}

export interface WorkspaceCredentials {
  workspaceId: string;
  token: string;        // Stored securely in backend
}

export interface WorkspaceData {
  workspaceId: string;
  channels?: string[];          // Channel IDs/names cache
  channelFavorites?: string[];  // Favorite channel IDs
  recentChannels?: string[];    // Recently used channel IDs
  searchHistory?: string[];     // Recent search queries
  userFavorites?: string[];     // Favorite user IDs
  lastSync?: Date;              // Last data sync timestamp
}

export interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspaceData: Record<string, WorkspaceData>; // Keyed by workspace ID
}

export interface WorkspaceCreationParams {
  name: string;
  domain: string;
  token: string;
  color?: string;
}

export interface WorkspaceSwitchEvent {
  fromWorkspaceId: string | null;
  toWorkspaceId: string;
  timestamp: Date;
}

// Migration types for backward compatibility
export interface LegacyWorkspaceData {
  token?: string;
  workspace?: string;
  channels?: string[];
  favorites?: string[];
  recentChannels?: string[];
}