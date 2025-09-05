import type { SearchRequest, SearchResponse } from '../workers/searchWorker';

/**
 * Service for managing Web Worker-based search operations
 */
class SearchWorkerService {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;
  private workerSupported = false;

  constructor() {
    this.initWorker();
  }

  /**
   * Initializes the Web Worker
   */
  private initWorker() {
    // Check if Web Workers are supported
    if (typeof Worker === 'undefined') {
      console.warn('Web Workers not supported, falling back to main thread');
      this.workerSupported = false;
      return;
    }

    try {
      // Create worker with type module for better ES module support
      this.worker = new Worker(
        new URL('../workers/searchWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', this.handleWorkerError.bind(this));
      
      this.workerSupported = true;
      console.log('Search Web Worker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Web Worker:', error);
      this.workerSupported = false;
    }
  }

  /**
   * Handles messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent<SearchResponse>) {
    const { id, result, error } = event.data;
    const pending = this.pendingRequests.get(id);
    
    if (!pending) {
      console.warn('Received response for unknown request:', id);
      return;
    }

    this.pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * Handles worker errors
   */
  private handleWorkerError(error: ErrorEvent) {
    console.error('Worker error:', error);
    
    // Reject all pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Worker error: ' + error.message));
    });
    this.pendingRequests.clear();

    // Attempt to restart the worker
    this.restartWorker();
  }

  /**
   * Restarts the worker after an error
   */
  private restartWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    setTimeout(() => {
      console.log('Attempting to restart Web Worker...');
      this.initWorker();
    }, 1000);
  }

  /**
   * Sends a request to the worker
   */
  private sendRequest<T>(type: SearchRequest['type'], data: any): Promise<T> {
    // Fallback to main thread if worker not available
    if (!this.workerSupported || !this.worker) {
      return this.executeOnMainThread(type, data);
    }

    return new Promise((resolve, reject) => {
      const id = `${++this.requestId}`;
      
      this.pendingRequests.set(id, { resolve, reject });

      const request: SearchRequest = { id, type, data };
      this.worker!.postMessage(request);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Fallback execution on main thread
   */
  private async executeOnMainThread<T>(type: SearchRequest['type'], data: any): Promise<T> {
    // Import search logic dynamically to avoid bundling if worker is available
    const { performSearch, performFilter, performSort } = await import('./searchFallback');
    
    switch (type) {
      case 'search':
        return performSearch(data) as T;
      case 'filter':
        return performFilter(data) as T;
      case 'sort':
        return performSort(data) as T;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  /**
   * Public API methods
   */

  async search(messages: any[], query: string, options = {}) {
    return this.sendRequest('search', { messages, query, options });
  }

  async filter(messages: any[], filters: any) {
    return this.sendRequest('filter', { messages, filters });
  }

  async sort(messages: any[], sortBy: string, order = 'desc') {
    return this.sendRequest('sort', { messages, sortBy, order });
  }

  /**
   * Performs a combined search, filter, and sort operation
   */
  async searchAndFilter(
    messages: any[],
    query: string,
    filters: any,
    sortBy = 'date',
    order = 'desc'
  ) {
    try {
      // Chain operations for efficiency
      let results = messages;
      
      // Apply search if query exists
      if (query) {
        results = await this.search(results, query);
      }
      
      // Apply filters if any exist
      if (filters && Object.keys(filters).length > 0) {
        results = await this.filter(results, filters);
      }
      
      // Apply sorting
      results = await this.sort(results, sortBy, order);
      
      return results;
    } catch (error) {
      console.error('Search and filter error:', error);
      throw error;
    }
  }

  /**
   * Terminates the worker
   */
  terminate() {
    if (this.worker) {
      // Reject all pending requests
      this.pendingRequests.forEach(({ reject }) => {
        reject(new Error('Worker terminated'));
      });
      this.pendingRequests.clear();

      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * Checks if the worker is available
   */
  isWorkerAvailable(): boolean {
    return this.workerSupported && this.worker !== null;
  }
}

// Export singleton instance
export const searchWorkerService = new SearchWorkerService();

// Export for use in stores
export function useSearchWorker() {
  return searchWorkerService;
}