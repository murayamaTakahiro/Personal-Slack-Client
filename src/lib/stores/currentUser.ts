import { writable, get } from 'svelte/store';
import { getCurrentUserId } from '../api/auth';

// Store for the current user ID
export const currentUserId = writable<string | null>(null);

// Store for debug mode
export const userIdDebugMode = writable<boolean>(false);

// Initialize the current user ID when the app starts
export async function initializeCurrentUser() {
  console.log('[UserID] Starting user ID initialization...');
  
  try {
    // First, try to get from localStorage (cached value)
    const cachedUserId = localStorage.getItem('slack_user_id');
    if (cachedUserId) {
      console.log('[UserID] Found cached user ID:', cachedUserId);
      currentUserId.set(cachedUserId);
    }
    
    // Then fetch from API to update/verify
    console.log('[UserID] Fetching user ID from API...');
    const userId = await getCurrentUserId();
    console.log('[UserID] API response:', userId);
    
    if (userId) {
      currentUserId.set(userId);
      localStorage.setItem('slack_user_id', userId);
      console.log('[UserID] ✅ Successfully initialized user ID:', userId);
    } else {
      console.warn('[UserID] ⚠️ No user ID returned from API');
      // Keep cached value if API fails
      if (!cachedUserId) {
        console.error('[UserID] ❌ No user ID available (neither from cache nor API)');
      }
    }
  } catch (error) {
    console.error('[UserID] ❌ Failed to initialize current user:', error);
    // Keep cached value if available
    const cachedUserId = localStorage.getItem('slack_user_id');
    if (cachedUserId) {
      console.log('[UserID] Using cached user ID after error:', cachedUserId);
      currentUserId.set(cachedUserId); // IMPORTANT: Set the store with cached value
    }
  }
}

// Helper function to check if a user is the current user
export function isCurrentUser(userId: string | undefined, currentId: string | null): boolean {
  if (!userId || !currentId) return false;
  return userId === currentId;
}

// Manual override for user ID (for debugging/configuration)
export function setManualUserId(userId: string) {
  console.log('[UserID] Manually setting user ID:', userId);
  currentUserId.set(userId);
  localStorage.setItem('slack_user_id', userId);
}

// Clear cached user ID
export function clearUserId() {
  console.log('[UserID] Clearing user ID');
  currentUserId.set(null);
  localStorage.removeItem('slack_user_id');
}

// Get current user ID for debugging
export function getCurrentUserIdDebug(): string | null {
  return get(currentUserId);
}