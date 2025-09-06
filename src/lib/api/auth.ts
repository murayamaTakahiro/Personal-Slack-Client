import { invoke } from '@tauri-apps/api/core';

/**
 * Get the current user's ID from Slack
 * @returns The current user's ID or null if not available
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const userId = await invoke<string | null>('get_current_user_id');
    return userId;
  } catch (error) {
    console.error('Failed to get current user ID:', error);
    return null;
  }
}