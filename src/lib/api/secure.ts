import { invoke } from '@tauri-apps/api/core';

/**
 * Securely save the Slack token using Tauri's encrypted storage
 */
export async function saveTokenSecure(token: string): Promise<void> {
  await invoke('save_token_secure', { token });
}

/**
 * Retrieve the securely stored Slack token
 */
export async function getTokenSecure(): Promise<string | null> {
  return await invoke('get_token_secure');
}

/**
 * Delete the stored token
 */
export async function deleteTokenSecure(): Promise<void> {
  await invoke('delete_token_secure');
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