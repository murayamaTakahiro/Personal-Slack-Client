/**
 * IndexedDB service for caching and offline support
 */

interface CacheConfig {
  dbName: string;
  version: number;
  stores: {
    name: string;
    keyPath: string;
    indexes?: { name: string; keyPath: string; unique?: boolean }[];
  }[];
}

const DEFAULT_CONFIG: CacheConfig = {
  dbName: 'SlackClientCache',
  version: 1,
  stores: [
    {
      name: 'messages',
      keyPath: 'ts',
      indexes: [
        { name: 'channel', keyPath: 'channel' },
        { name: 'user', keyPath: 'user' },
        { name: 'date', keyPath: 'ts' }
      ]
    },
    {
      name: 'threads',
      keyPath: 'threadTs',
      indexes: [
        { name: 'channel', keyPath: 'channel' }
      ]
    },
    {
      name: 'channels',
      keyPath: 'id'
    },
    {
      name: 'users',
      keyPath: 'id'
    },
    {
      name: 'searchCache',
      keyPath: 'query',
      indexes: [
        { name: 'timestamp', keyPath: 'timestamp' }
      ]
    },
    {
      name: 'metadata',
      keyPath: 'key'
    }
  ]
};

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private config: CacheConfig;
  private isSupported: boolean;
  private initPromise: Promise<void> | null = null;

  constructor(config: CacheConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.isSupported = this.checkSupport();
    
    if (this.isSupported) {
      this.initPromise = this.init();
    }
  }

  /**
   * Checks if IndexedDB is supported
   */
  private checkSupport(): boolean {
    try {
      return 'indexedDB' in window && window.indexedDB !== null;
    } catch {
      return false;
    }
  }

  /**
   * Initializes the database
   */
  private async init(): Promise<void> {
    if (!this.isSupported) {
      console.warn('IndexedDB is not supported');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.version);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        for (const storeConfig of this.config.stores) {
          if (!db.objectStoreNames.contains(storeConfig.name)) {
            const store = db.createObjectStore(storeConfig.name, {
              keyPath: storeConfig.keyPath
            });

            // Create indexes
            if (storeConfig.indexes) {
              for (const index of storeConfig.indexes) {
                store.createIndex(index.name, index.keyPath, {
                  unique: index.unique || false
                });
              }
            }
          }
        }
      };
    });
  }

  /**
   * Ensures the database is ready
   */
  private async ensureReady(): Promise<void> {
    if (!this.isSupported) {
      throw new Error('IndexedDB is not supported');
    }

    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  /**
   * Generic get operation
   */
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic put operation
   */
  async put<T>(storeName: string, data: T): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic delete operation
   */
  async delete(storeName: string, key: string): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all items from a store
   */
  async getAll<T>(storeName: string, limit?: number): Promise<T[]> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll(undefined, limit);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Batch put operation
   */
  async putBatch<T>(storeName: string, items: T[]): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let completed = 0;
      let hasError = false;

      for (const item of items) {
        const request = store.put(item);
        
        request.onsuccess = () => {
          completed++;
          if (completed === items.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          hasError = true;
          reject(request.error);
        };
      }
    });
  }

  /**
   * Clear a store
   */
  async clear(storeName: string): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query by index
   */
  async queryByIndex<T>(
    storeName: string,
    indexName: string,
    query: IDBKeyRange | string,
    limit?: number
  ): Promise<T[]> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(query, limit);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Message-specific operations
   */

  async cacheMessages(messages: any[]): Promise<void> {
    // Add timestamp for cache management
    const timestampedMessages = messages.map(msg => ({
      ...msg,
      cachedAt: Date.now()
    }));

    await this.putBatch('messages', timestampedMessages);
    await this.updateMetadata('lastMessageCache', Date.now());
  }

  async getCachedMessages(channel?: string, limit = 100): Promise<any[]> {
    if (channel) {
      return this.queryByIndex('messages', 'channel', channel, limit);
    }
    return this.getAll('messages', limit);
  }

  async cacheThread(threadTs: string, thread: any): Promise<void> {
    await this.put('threads', {
      threadTs,
      ...thread,
      cachedAt: Date.now()
    });
  }

  async getCachedThread(threadTs: string): Promise<any> {
    return this.get('threads', threadTs);
  }

  async cacheSearchResults(query: string, results: any[]): Promise<void> {
    await this.put('searchCache', {
      query,
      results,
      timestamp: Date.now()
    });

    // Clean old search cache (keep last 50 searches)
    await this.cleanOldSearchCache(50);
  }

  async getCachedSearchResults(query: string): Promise<any[] | null> {
    const cached = await this.get<any>('searchCache', query);
    
    if (!cached) return null;

    // Check if cache is still fresh (1 hour)
    const isExpired = Date.now() - cached.timestamp > 3600000;
    
    return isExpired ? null : cached.results;
  }

  private async cleanOldSearchCache(keepCount: number): Promise<void> {
    const allSearches = await this.getAll<any>('searchCache');
    
    if (allSearches.length <= keepCount) return;

    // Sort by timestamp and remove oldest
    allSearches.sort((a, b) => b.timestamp - a.timestamp);
    const toRemove = allSearches.slice(keepCount);

    for (const search of toRemove) {
      await this.delete('searchCache', search.query);
    }
  }

  /**
   * Metadata operations
   */

  async updateMetadata(key: string, value: any): Promise<void> {
    await this.put('metadata', { key, value, timestamp: Date.now() });
  }

  async getMetadata(key: string): Promise<any> {
    const meta = await this.get<any>('metadata', key);
    return meta?.value;
  }

  /**
   * Cache size management
   */

  async getCacheSize(): Promise<number> {
    if (!navigator.storage?.estimate) {
      return -1;
    }

    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }

  async clearOldCache(daysOld = 7): Promise<void> {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    // Clear old messages
    const messages = await this.getAll<any>('messages');
    const oldMessages = messages.filter(msg => msg.cachedAt < cutoffTime);
    
    for (const msg of oldMessages) {
      await this.delete('messages', msg.ts);
    }

    // Clear old threads
    const threads = await this.getAll<any>('threads');
    const oldThreads = threads.filter(thread => thread.cachedAt < cutoffTime);
    
    for (const thread of oldThreads) {
      await this.delete('threads', thread.threadTs);
    }

    await this.updateMetadata('lastCacheClean', Date.now());
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const indexedDBService = new IndexedDBService();

// Export for use in stores
export function useIndexedDB() {
  return indexedDBService;
}