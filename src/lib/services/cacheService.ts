/**
 * Cache service for storing and retrieving channels and users data
 * Provides fast startup by loading cached data immediately
 */

interface CacheData<T> {
  data: T;
  timestamp: number;
  workspaceId?: string;
}

class CacheService {
  private readonly CACHE_PREFIX = 'slack_cache_';
  private readonly CHANNELS_KEY = 'channels';
  private readonly USERS_KEY = 'users';
  private readonly DEFAULT_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours default

  /**
   * Save channels to cache
   */
  saveChannels(channels: [string, string][], workspaceId?: string): void {
    try {
      const cacheData: CacheData<[string, string][]> = {
        data: channels,
        timestamp: Date.now(),
        workspaceId
      };

      const key = workspaceId
        ? `${this.CACHE_PREFIX}${workspaceId}_${this.CHANNELS_KEY}`
        : `${this.CACHE_PREFIX}${this.CHANNELS_KEY}`;

      localStorage.setItem(key, JSON.stringify(cacheData));
      console.log('[CacheService] Channels cached successfully:', channels.length);
    } catch (error) {
      console.error('[CacheService] Failed to cache channels:', error);
    }
  }

  /**
   * Load channels from cache (returns data even if expired, use isCacheValid to check freshness)
   */
  loadChannels(workspaceId?: string): [string, string][] | null {
    try {
      const key = workspaceId
        ? `${this.CACHE_PREFIX}${workspaceId}_${this.CHANNELS_KEY}`
        : `${this.CACHE_PREFIX}${this.CHANNELS_KEY}`;

      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const cacheData: CacheData<[string, string][]> = JSON.parse(cached);

      console.log('[CacheService] Loaded channels from cache:', cacheData.data.length);
      return cacheData.data;
    } catch (error) {
      console.error('[CacheService] Failed to load channels from cache:', error);
      return null;
    }
  }

  /**
   * Save users to cache
   */
  saveUsers(users: any[], workspaceId?: string): void {
    try {
      const cacheData: CacheData<any[]> = {
        data: users,
        timestamp: Date.now(),
        workspaceId
      };

      const key = workspaceId
        ? `${this.CACHE_PREFIX}${workspaceId}_${this.USERS_KEY}`
        : `${this.CACHE_PREFIX}${this.USERS_KEY}`;

      localStorage.setItem(key, JSON.stringify(cacheData));
      console.log('[CacheService] Users cached successfully:', users.length);
    } catch (error) {
      console.error('[CacheService] Failed to cache users:', error);
    }
  }

  /**
   * Load users from cache (returns data even if expired, use isCacheValid to check freshness)
   */
  loadUsers(workspaceId?: string): any[] | null {
    try {
      const key = workspaceId
        ? `${this.CACHE_PREFIX}${workspaceId}_${this.USERS_KEY}`
        : `${this.CACHE_PREFIX}${this.USERS_KEY}`;

      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const cacheData: CacheData<any[]> = JSON.parse(cached);

      console.log('[CacheService] Loaded users from cache:', cacheData.data.length);
      return cacheData.data;
    } catch (error) {
      console.error('[CacheService] Failed to load users from cache:', error);
      return null;
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      console.log('[CacheService] All caches cleared');
    } catch (error) {
      console.error('[CacheService] Failed to clear caches:', error);
    }
  }

  /**
   * Clear cache for specific workspace
   */
  clearWorkspaceCache(workspaceId: string): void {
    try {
      const channelsKey = `${this.CACHE_PREFIX}${workspaceId}_${this.CHANNELS_KEY}`;
      const usersKey = `${this.CACHE_PREFIX}${workspaceId}_${this.USERS_KEY}`;

      localStorage.removeItem(channelsKey);
      localStorage.removeItem(usersKey);

      console.log('[CacheService] Workspace cache cleared:', workspaceId);
    } catch (error) {
      console.error('[CacheService] Failed to clear workspace cache:', error);
    }
  }

  /**
   * Get cache age in milliseconds
   */
  getCacheAge(type: 'channels' | 'users', workspaceId?: string): number | null {
    try {
      const keyBase = type === 'channels' ? this.CHANNELS_KEY : this.USERS_KEY;
      const key = workspaceId
        ? `${this.CACHE_PREFIX}${workspaceId}_${keyBase}`
        : `${this.CACHE_PREFIX}${keyBase}`;

      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const cacheData: CacheData<any> = JSON.parse(cached);
      return Date.now() - cacheData.timestamp;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if cache is valid (not expired) based on max age
   * @param type - Type of cache to check
   * @param workspaceId - Optional workspace ID
   * @param maxAge - Maximum age in milliseconds (defaults to DEFAULT_CACHE_DURATION)
   * @returns true if cache exists and is within max age, false otherwise
   */
  isCacheValid(type: 'channels' | 'users', workspaceId?: string, maxAge?: number): boolean {
    try {
      const age = this.getCacheAge(type, workspaceId);
      if (age === null) return false;

      const maxAgeToUse = maxAge !== undefined ? maxAge : this.DEFAULT_CACHE_DURATION;
      return age <= maxAgeToUse;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the timestamp of when cache was last updated
   * @param type - Type of cache to check
   * @param workspaceId - Optional workspace ID
   * @returns timestamp in milliseconds or null if not found
   */
  getLastRefreshTimestamp(type: 'channels' | 'users', workspaceId?: string): number | null {
    try {
      const keyBase = type === 'channels' ? this.CHANNELS_KEY : this.USERS_KEY;
      const key = workspaceId
        ? `${this.CACHE_PREFIX}${workspaceId}_${keyBase}`
        : `${this.CACHE_PREFIX}${keyBase}`;

      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const cacheData: CacheData<any> = JSON.parse(cached);
      return cacheData.timestamp;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if both channels and users cache are valid
   * @param workspaceId - Optional workspace ID
   * @param maxAge - Maximum age in milliseconds (defaults to DEFAULT_CACHE_DURATION)
   * @returns true if both caches exist and are valid
   */
  isWorkspaceCacheValid(workspaceId?: string, maxAge?: number): boolean {
    return this.isCacheValid('channels', workspaceId, maxAge) &&
           this.isCacheValid('users', workspaceId, maxAge);
  }
}

// Export singleton instance
export const cacheService = new CacheService();