/**
 * Search History Tracker Service
 *
 * Tracks search queries and their message IDs to detect new messages
 * when the same search is performed again. This is completely independent
 * from the search cache system to minimize risk.
 */

import type { SearchParams } from '../types/slack';

interface SearchHistoryEntry {
  messageIds: string[];
  timestamp: number;
  query: string;
}

const STORAGE_PREFIX = 'search_history_';
const MAX_HISTORY_ENTRIES = 50;
const HISTORY_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SearchHistoryTracker {
  /**
   * Generate a unique key for search parameters
   */
  private generateKey(params: SearchParams): string {
    const key = {
      query: params.query || '',
      channel: params.channel || '',
      user: params.user || '',
      fromDate: params.fromDate ? (params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate) : '',
      toDate: params.toDate ? (params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate) : '',
    };
    return JSON.stringify(key);
  }

  /**
   * Save message IDs for a search query
   */
  saveSearchHistory(params: SearchParams, messageIds: string[]): void {
    try {
      const key = this.generateKey(params);
      const entry: SearchHistoryEntry = {
        messageIds,
        timestamp: Date.now(),
        query: params.query || ''
      };

      const storageKey = `${STORAGE_PREFIX}${btoa(key).substring(0, 50)}`;
      localStorage.setItem(storageKey, JSON.stringify(entry));

      // Clean up old entries
      this.cleanupOldEntries();
    } catch (error) {
      console.error('[SearchHistoryTracker] Failed to save search history:', error);
    }
  }

  /**
   * Get previously seen message IDs for a search query
   */
  getPreviousMessageIds(params: SearchParams): Set<string> {
    try {
      const key = this.generateKey(params);
      const storageKey = `${STORAGE_PREFIX}${btoa(key).substring(0, 50)}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        return new Set();
      }

      const entry: SearchHistoryEntry = JSON.parse(stored);

      // Check if entry is still valid
      if (Date.now() - entry.timestamp > HISTORY_TTL) {
        localStorage.removeItem(storageKey);
        return new Set();
      }

      return new Set(entry.messageIds);
    } catch (error) {
      console.error('[SearchHistoryTracker] Failed to load search history:', error);
      return new Set();
    }
  }

  /**
   * Check if a message ID is new (not in previous search)
   */
  isNewMessage(params: SearchParams, messageId: string): boolean {
    const previousIds = this.getPreviousMessageIds(params);
    return !previousIds.has(messageId);
  }

  /**
   * Get count of new messages compared to previous search
   */
  getNewMessageCount(params: SearchParams, currentMessageIds: string[]): number {
    const previousIds = this.getPreviousMessageIds(params);
    return currentMessageIds.filter(id => !previousIds.has(id)).length;
  }

  /**
   * Clean up old entries to prevent localStorage bloat
   */
  private cleanupOldEntries(): void {
    try {
      const keys: string[] = [];
      const entries: Array<{ key: string; timestamp: number }> = [];

      // Collect all search history entries
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keys.push(key);
          try {
            const entry: SearchHistoryEntry = JSON.parse(localStorage.getItem(key) || '{}');
            entries.push({ key, timestamp: entry.timestamp || 0 });
          } catch {
            // Invalid entry, will be cleaned up
            entries.push({ key, timestamp: 0 });
          }
        }
      }

      // Remove expired entries
      const now = Date.now();
      entries.forEach(({ key, timestamp }) => {
        if (now - timestamp > HISTORY_TTL) {
          localStorage.removeItem(key);
        }
      });

      // If still too many entries, remove oldest ones
      const remaining = entries
        .filter(({ timestamp }) => now - timestamp <= HISTORY_TTL)
        .sort((a, b) => b.timestamp - a.timestamp);

      if (remaining.length > MAX_HISTORY_ENTRIES) {
        const toRemove = remaining.slice(MAX_HISTORY_ENTRIES);
        toRemove.forEach(({ key }) => localStorage.removeItem(key));
      }
    } catch (error) {
      console.error('[SearchHistoryTracker] Failed to cleanup old entries:', error);
    }
  }

  /**
   * Clear all search history
   */
  clearAll(): void {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keys.push(key);
        }
      }
      keys.forEach(key => localStorage.removeItem(key));
      console.log('[SearchHistoryTracker] All search history cleared');
    } catch (error) {
      console.error('[SearchHistoryTracker] Failed to clear search history:', error);
    }
  }

  /**
   * Get statistics about search history
   */
  getStats(): { totalEntries: number; oldestEntry: number | null; newestEntry: number | null } {
    try {
      const entries: number[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          try {
            const entry: SearchHistoryEntry = JSON.parse(localStorage.getItem(key) || '{}');
            if (entry.timestamp) {
              entries.push(entry.timestamp);
            }
          } catch {
            // Skip invalid entries
          }
        }
      }

      return {
        totalEntries: entries.length,
        oldestEntry: entries.length > 0 ? Math.min(...entries) : null,
        newestEntry: entries.length > 0 ? Math.max(...entries) : null
      };
    } catch (error) {
      console.error('[SearchHistoryTracker] Failed to get stats:', error);
      return { totalEntries: 0, oldestEntry: null, newestEntry: null };
    }
  }
}

// Export singleton instance
export const searchHistoryTracker = new SearchHistoryTracker();
