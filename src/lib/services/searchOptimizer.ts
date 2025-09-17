/**
 * Search optimization service for debouncing, request cancellation, and caching
 */

import { writable, get } from 'svelte/store';
import type { SearchParams, SearchResult } from '../types/slack';
import { LRUCache } from 'lru-cache';

// Cache for search results
const searchCache = new LRUCache<string, SearchResult>({
  max: 50, // Keep last 50 search results
  ttl: 1000 * 60 * 5, // 5 minutes TTL
  updateAgeOnGet: true,
});

// Track ongoing requests for cancellation
const ongoingRequests = new Map<string, AbortController>();

// Debounce timers
const debounceTimers = new Map<string, NodeJS.Timeout>();

export interface SearchOptimizer {
  search: (
    params: SearchParams,
    searchFn: (params: SearchParams, signal?: AbortSignal) => Promise<SearchResult>,
    options?: {
      debounceMs?: number;
      cacheKey?: string;
      skipCache?: boolean;
    }
  ) => Promise<SearchResult | null>;
  cancelSearch: (key: string) => void;
  cancelAllSearches: () => void;
  clearCache: () => void;
  getCacheStats: () => { size: number; hits: number; misses: number };
}

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate cache key for search params
 */
function generateCacheKey(params: SearchParams): string {
  const key = {
    query: params.query || '',
    channel: params.channel || '',
    user: params.user || '',
    // Handle both Date objects and string formats
    fromDate: params.fromDate ? (params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate) : '',
    toDate: params.toDate ? (params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate) : '',
    limit: params.limit || 100,
  };
  return JSON.stringify(key);
}

/**
 * Create a search optimizer instance
 */
export function createSearchOptimizer(): SearchOptimizer {
  return {
    async search(params, searchFn, options = {}) {
      const { 
        debounceMs = 300, 
        cacheKey = generateCacheKey(params),
        skipCache = false 
      } = options;

      // Check cache first (unless skipped)
      if (!skipCache && searchCache.has(cacheKey)) {
        cacheHits++;
        console.log('[SearchOptimizer] Cache hit for:', cacheKey);
        return searchCache.get(cacheKey)!;
      }
      cacheMisses++;

      // Cancel any existing request with the same key
      if (ongoingRequests.has(cacheKey)) {
        const controller = ongoingRequests.get(cacheKey)!;
        controller.abort();
        ongoingRequests.delete(cacheKey);
        console.log('[SearchOptimizer] Cancelled previous request for:', cacheKey);
      }

      // Clear existing debounce timer
      if (debounceTimers.has(cacheKey)) {
        clearTimeout(debounceTimers.get(cacheKey)!);
        debounceTimers.delete(cacheKey);
      }

      // Return a promise that resolves after debounce
      return new Promise((resolve, reject) => {
        const timer = setTimeout(async () => {
          debounceTimers.delete(cacheKey);

          // Create new abort controller
          const abortController = new AbortController();
          ongoingRequests.set(cacheKey, abortController);

          try {
            console.log('[SearchOptimizer] Executing search for:', cacheKey);
            const result = await searchFn(params, abortController.signal);

            // Cache the result
            if (!skipCache && result) {
              searchCache.set(cacheKey, result);
            }

            // Clean up
            ongoingRequests.delete(cacheKey);
            resolve(result);
          } catch (error) {
            // Clean up
            ongoingRequests.delete(cacheKey);

            // Don't reject if it was an abort
            if ((error as any)?.name === 'AbortError') {
              console.log('[SearchOptimizer] Search aborted for:', cacheKey);
              resolve(null);
            } else {
              reject(error);
            }
          }
        }, debounceMs);

        debounceTimers.set(cacheKey, timer);
      });
    },

    cancelSearch(key: string) {
      // Cancel debounce timer if exists
      if (debounceTimers.has(key)) {
        clearTimeout(debounceTimers.get(key)!);
        debounceTimers.delete(key);
        console.log('[SearchOptimizer] Cancelled debounce timer for:', key);
      }

      // Cancel ongoing request if exists
      if (ongoingRequests.has(key)) {
        const controller = ongoingRequests.get(key)!;
        controller.abort();
        ongoingRequests.delete(key);
        console.log('[SearchOptimizer] Cancelled request for:', key);
      }
    },

    cancelAllSearches() {
      // Cancel all debounce timers
      debounceTimers.forEach((timer, key) => {
        clearTimeout(timer);
        console.log('[SearchOptimizer] Cancelled debounce timer for:', key);
      });
      debounceTimers.clear();

      // Cancel all ongoing requests
      ongoingRequests.forEach((controller, key) => {
        controller.abort();
        console.log('[SearchOptimizer] Cancelled request for:', key);
      });
      ongoingRequests.clear();
    },

    clearCache() {
      searchCache.clear();
      cacheHits = 0;
      cacheMisses = 0;
      console.log('[SearchOptimizer] Cache cleared');
    },

    getCacheStats() {
      return {
        size: searchCache.size,
        hits: cacheHits,
        misses: cacheMisses,
      };
    },
  };
}

// Create a singleton instance
export const searchOptimizer = createSearchOptimizer();

/**
 * Store for tracking search performance
 */
export const searchPerformance = writable({
  lastSearchTime: 0,
  averageSearchTime: 0,
  totalSearches: 0,
  cacheHitRate: 0,
});

/**
 * Update search performance metrics
 */
export function updateSearchPerformance(searchTime: number) {
  searchPerformance.update(metrics => {
    const totalSearches = metrics.totalSearches + 1;
    const averageSearchTime = 
      (metrics.averageSearchTime * metrics.totalSearches + searchTime) / totalSearches;
    const cacheHitRate = cacheHits / (cacheHits + cacheMisses) || 0;

    return {
      lastSearchTime: searchTime,
      averageSearchTime,
      totalSearches,
      cacheHitRate,
    };
  });
}