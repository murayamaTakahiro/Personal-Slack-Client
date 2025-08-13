import { invoke } from '@tauri-apps/api/core';

/**
 * Securely save the Slack token using Tauri's encrypted storage
 * @param token - The Slack API token
 * @param workspaceId - Optional workspace ID for multi-workspace support
 */
export async function saveTokenSecure(token: string, workspaceId?: string): Promise<void> {
  if (workspaceId) {
    // Multi-workspace mode: store with workspace-specific key
    await invoke('save_token_secure', { token, key: `token_${workspaceId}` });
  } else {
    // Legacy mode: store with default key
    await invoke('save_token_secure', { token });
  }
}

/**
 * Retrieve the securely stored Slack token
 * @param workspaceId - Optional workspace ID for multi-workspace support
 */
export async function getTokenSecure(workspaceId?: string): Promise<string | null> {
  if (workspaceId) {
    // Multi-workspace mode: retrieve with workspace-specific key
    return await invoke('get_token_secure', { key: `token_${workspaceId}` });
  } else {
    // Legacy mode: retrieve with default key
    return await invoke('get_token_secure', {});
  }
}

/**
 * Delete the stored token
 * @param workspaceId - Optional workspace ID for multi-workspace support
 */
export async function deleteTokenSecure(workspaceId?: string): Promise<void> {
  if (workspaceId) {
    // Multi-workspace mode: delete with workspace-specific key
    await invoke('delete_token_secure', { key: `token_${workspaceId}` });
  } else {
    // Legacy mode: delete with default key
    await invoke('delete_token_secure', {});
  }
}

/**
 * Securely save the workspace name
 */
export async function saveWorkspaceSecure(workspace: string): Promise<void> {
  await invoke('save_workspace_secure', { workspace });
}

/**
 * Retrieve the securely stored workspace name
 */
export async function getWorkspaceSecure(): Promise<string | null> {
  return await invoke('get_workspace_secure');
}

/**
 * Get a masked version of the token for display
 */
export async function getMaskedToken(token: string): Promise<string> {
  return await invoke('mask_token', { token });
}

/**
 * Client-side token masking (backup method)
 */
export function maskTokenClient(token: string): string {
  if (!token || token.length <= 14) {
    return '*'.repeat(token?.length || 0);
  }
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}