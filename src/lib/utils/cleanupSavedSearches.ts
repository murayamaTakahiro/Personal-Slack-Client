/**
 * Utility to clean up duplicate saved searches across workspaces
 * This is a one-time cleanup function to fix the migration issue
 */

import { loadFromStore, saveToStore } from '../stores/persistentStore';
import type { SavedSearch } from '../stores/savedSearches';

export async function cleanupDuplicateSavedSearches() {
  console.log('[Cleanup] Starting saved searches cleanup...');

  // Clear the legacy global saved searches
  const legacySearches = await loadFromStore<SavedSearch[]>('savedSearches', []);
  if (legacySearches.length > 0) {
    console.log(`[Cleanup] Clearing ${legacySearches.length} legacy global searches`);
    await saveToStore('savedSearches', []);
  }

  // Set the migration flag to prevent future duplications
  await saveToStore('savedSearches_migration_done', true);

  console.log('[Cleanup] Saved searches cleanup complete');
}

export async function clearWorkspaceSavedSearches(workspaceId: string) {
  const storageKey = `savedSearches_${workspaceId}`;
  console.log(`[Cleanup] Clearing saved searches for workspace: ${workspaceId}`);
  await saveToStore(storageKey, []);
  console.log(`[Cleanup] Cleared saved searches for workspace: ${workspaceId}`);
}

export async function listAllSavedSearchKeys(): Promise<string[]> {
  if (typeof window === 'undefined') return [];

  const keys = Object.keys(localStorage);
  const savedSearchKeys = keys.filter(key => key.includes('savedSearches'));

  console.log('[Cleanup] Found saved search keys:', savedSearchKeys);
  return savedSearchKeys;
}

export async function getSavedSearchesForWorkspace(workspaceId: string): Promise<SavedSearch[]> {
  const storageKey = `savedSearches_${workspaceId}`;
  const searches = await loadFromStore<SavedSearch[]>(storageKey, []);
  console.log(`[Cleanup] Workspace ${workspaceId} has ${searches.length} saved searches`);
  return searches;
}