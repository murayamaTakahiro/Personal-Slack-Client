/**
 * Memoization service for caching expensive computations
 */

import { LRUCache } from 'lru-cache';

// Cache for processed message text (emoji parsing, HTML decoding)
const textCache = new LRUCache<string, any>({
  max: 1000, // Keep last 1000 processed texts
  ttl: 1000 * 60 * 30, // 30 minutes TTL
});

// Cache for formatted timestamps
const timestampCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour TTL
});

// Cache for user resolution
const userCache = new LRUCache<string, any>({
  max: 200,
  ttl: 1000 * 60 * 60 * 24, // 24 hours TTL
});

// Cache for emoji parsing results
const emojiParseCache = new LRUCache<string, any[]>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour TTL
});

/**
 * Memoize a function with automatic cache management
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  getCacheKey?: (...args: Parameters<T>) => string,
  options?: { ttl?: number; max?: number }
): T {
  const cache = new LRUCache<string, ReturnType<T>>({
    max: options?.max || 100,
    ttl: options?.ttl || 1000 * 60 * 10, // Default 10 minutes
  });

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = getCacheKey ? getCacheKey(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Cache processed message text
 */
export function cacheProcessedText(messageId: string, processedText: any): void {
  textCache.set(messageId, processedText);
}

export function getCachedProcessedText(messageId: string): any | undefined {
  return textCache.get(messageId);
}

/**
 * Cache formatted timestamp
 */
export function cacheTimestamp(ts: string, formatted: string): void {
  timestampCache.set(ts, formatted);
}

export function getCachedTimestamp(ts: string): string | undefined {
  return timestampCache.get(ts);
}

/**
 * Cache user data
 */
export function cacheUser(userId: string, userData: any): void {
  userCache.set(userId, userData);
}

export function getCachedUser(userId: string): any | undefined {
  return userCache.get(userId);
}

/**
 * Cache emoji parse results
 */
export function cacheEmojiParse(text: string, result: any[]): void {
  emojiParseCache.set(text, result);
}

export function getCachedEmojiParse(text: string): any[] | undefined {
  return emojiParseCache.get(text);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  textCache.clear();
  timestampCache.clear();
  userCache.clear();
  emojiParseCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    text: {
      size: textCache.size,
      calculatedSize: textCache.calculatedSize,
    },
    timestamp: {
      size: timestampCache.size,
      calculatedSize: timestampCache.calculatedSize,
    },
    user: {
      size: userCache.size,
      calculatedSize: userCache.calculatedSize,
    },
    emoji: {
      size: emojiParseCache.size,
      calculatedSize: emojiParseCache.calculatedSize,
    },
  };
}

/**
 * Memoized function for expensive text processing
 */
export const memoizedProcessText = memoize(
  (text: string, processor: (text: string) => any) => processor(text),
  (text: string) => text, // Use text as cache key
  { ttl: 1000 * 60 * 30, max: 500 } // 30 min TTL, 500 items max
);