import { get } from 'svelte/store';
import { performanceSettings } from '../stores/performance';
import { performanceMonitor } from './performanceMonitor';

interface BatchRequest {
  id: string;
  method: string;
  params: any[];
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface BatchConfig {
  maxBatchSize: number;
  batchDelayMs: number;
  enabled: boolean;
}

class APIBatcher {
  private requests: Map<string, BatchRequest[]> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private config: BatchConfig;

  constructor() {
    this.config = {
      maxBatchSize: 10,
      batchDelayMs: 50,
      enabled: false
    };

    // Subscribe to performance settings
    performanceSettings.subscribe(settings => {
      this.config.enabled = settings.enableApiBatching || settings.enableBatching || false;
    });
  }

  /**
   * Add a request to the batch queue
   */
  async batch<T>(
    method: string,
    params: any[],
    executor: (batch: any[][]) => Promise<T[]>
  ): Promise<T> {
    // If batching is disabled, execute immediately
    if (!this.config.enabled) {
      const results = await executor([params]);
      return results[0];
    }

    return new Promise((resolve, reject) => {
      const request: BatchRequest = {
        id: Math.random().toString(36).substr(2, 9),
        method,
        params,
        resolve,
        reject
      };

      // Add request to queue
      if (!this.requests.has(method)) {
        this.requests.set(method, []);
      }
      this.requests.get(method)!.push(request);

      // Check if we should execute immediately (batch is full)
      const batch = this.requests.get(method)!;
      if (batch.length >= this.config.maxBatchSize) {
        this.executeBatch(method, executor);
      } else {
        // Schedule batch execution
        this.scheduleBatch(method, executor);
      }
    });
  }

  /**
   * Schedule batch execution with debouncing
   */
  private scheduleBatch<T>(method: string, executor: (batch: any[][]) => Promise<T[]>) {
    // Clear existing timer
    if (this.timers.has(method)) {
      clearTimeout(this.timers.get(method)!);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.executeBatch(method, executor);
    }, this.config.batchDelayMs);

    this.timers.set(method, timer);
  }

  /**
   * Execute a batch of requests
   */
  private async executeBatch<T>(method: string, executor: (batch: any[][]) => Promise<T[]>) {
    // Clear timer
    if (this.timers.has(method)) {
      clearTimeout(this.timers.get(method)!);
      this.timers.delete(method);
    }

    // Get and clear requests
    const batch = this.requests.get(method) || [];
    if (batch.length === 0) return;
    
    this.requests.delete(method);

    // Prepare batch params
    const batchParams = batch.map(req => req.params);

    try {
      // Measure performance
      performanceMonitor.start(`batch_${method}`, {
        batchSize: batch.length
      });

      // Execute batch
      const results = await executor(batchParams);

      performanceMonitor.end(`batch_${method}`);

      // Resolve individual promises
      batch.forEach((req, index) => {
        req.resolve(results[index]);
      });

      console.log(`[APIBatcher] Executed batch of ${batch.length} ${method} requests`);
    } catch (error) {
      // Reject all promises in batch
      batch.forEach(req => {
        req.reject(error);
      });

      console.error(`[APIBatcher] Batch execution failed for ${method}:`, error);
    }
  }

  /**
   * Clear all pending requests
   */
  clear() {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    // Reject all pending requests
    this.requests.forEach(batch => {
      batch.forEach(req => {
        req.reject(new Error('Batch cancelled'));
      });
    });
    this.requests.clear();
  }

  /**
   * Get statistics about pending batches
   */
  getStats() {
    const stats: Record<string, number> = {};
    this.requests.forEach((batch, method) => {
      stats[method] = batch.length;
    });
    return stats;
  }
}

// Export singleton instance
export const apiBatcher = new APIBatcher();

/**
 * Batch multiple channel searches
 */
export async function batchChannelSearch(
  channels: string[],
  query: string,
  searchFunction: (channelBatch: string[], query: string) => Promise<any[]>
): Promise<any[]> {
  const settings = get(performanceSettings);
  
  if ((!settings.enableApiBatching && !settings.enableBatching) || channels.length <= 1) {
    // If batching is disabled or only one channel, execute normally
    return searchFunction(channels, query);
  }

  // Split channels into optimal batch sizes
  const batchSize = 5; // Optimal batch size for Slack API
  const batches: string[][] = [];
  
  for (let i = 0; i < channels.length; i += batchSize) {
    batches.push(channels.slice(i, i + batchSize));
  }

  performanceMonitor.start('batch_channel_search', {
    totalChannels: channels.length,
    batches: batches.length
  });

  try {
    // Execute batches in parallel
    const batchPromises = batches.map(batch => 
      searchFunction(batch, query)
    );

    const batchResults = await Promise.all(batchPromises);
    
    // Flatten results
    const allResults = batchResults.flat();

    performanceMonitor.end('batch_channel_search');

    console.log(
      `[APIBatcher] Completed ${batches.length} batches for ${channels.length} channels`
    );

    return allResults;
  } catch (error) {
    performanceMonitor.end('batch_channel_search');
    throw error;
  }
}

/**
 * Batch user lookups
 */
export async function batchUserLookup(
  userIds: string[],
  lookupFunction: (userBatch: string[]) => Promise<any[]>
): Promise<Map<string, any>> {
  const settings = get(performanceSettings);
  
  if ((!settings.enableApiBatching && !settings.enableBatching) || userIds.length <= 1) {
    // If batching is disabled or only one user, execute normally
    const results = await lookupFunction(userIds);
    const map = new Map<string, any>();
    results.forEach((user, index) => {
      map.set(userIds[index], user);
    });
    return map;
  }

  // Remove duplicates
  const uniqueUserIds = [...new Set(userIds)];
  
  // Split users into optimal batch sizes
  const batchSize = 20; // Optimal batch size for user lookups
  const batches: string[][] = [];
  
  for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
    batches.push(uniqueUserIds.slice(i, i + batchSize));
  }

  performanceMonitor.start('batch_user_lookup', {
    totalUsers: uniqueUserIds.length,
    batches: batches.length
  });

  try {
    // Execute batches in parallel
    const batchPromises = batches.map(batch => 
      lookupFunction(batch)
    );

    const batchResults = await Promise.all(batchPromises);
    
    // Create user map
    const userMap = new Map<string, any>();
    batchResults.forEach((results, batchIndex) => {
      const batch = batches[batchIndex];
      results.forEach((user, index) => {
        userMap.set(batch[index], user);
      });
    });

    performanceMonitor.end('batch_user_lookup');

    console.log(
      `[APIBatcher] Completed ${batches.length} batches for ${uniqueUserIds.length} users`
    );

    return userMap;
  } catch (error) {
    performanceMonitor.end('batch_user_lookup');
    throw error;
  }
}