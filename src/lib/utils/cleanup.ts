/**
 * Utility for managing cleanup of resources in Svelte components
 * Helps prevent memory leaks by ensuring all listeners and subscriptions are cleaned up
 */

export interface Cleanup {
  add(cleanup: (() => void) | undefined): void;
  run(): void;
}

/**
 * Create a cleanup manager for a component
 * 
 * Usage:
 * ```typescript
 * const cleanup = createCleanup();
 * 
 * onMount(() => {
 *   const handler = () => { ... };
 *   window.addEventListener('resize', handler);
 *   cleanup.add(() => window.removeEventListener('resize', handler));
 *   
 *   const unsubscribe = store.subscribe(() => { ... });
 *   cleanup.add(unsubscribe);
 * });
 * 
 * onDestroy(() => {
 *   cleanup.run();
 * });
 * ```
 */
export function createCleanup(): Cleanup {
  const cleanups: (() => void)[] = [];
  
  return {
    add(cleanup: (() => void) | undefined) {
      if (cleanup && typeof cleanup === 'function') {
        cleanups.push(cleanup);
      }
    },
    
    run() {
      // Run cleanups in reverse order (LIFO)
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        if (cleanup) {
          try {
            cleanup();
          } catch (error) {
            // Log error but continue with other cleanups
            if (import.meta.env.DEV) {
              console.error('[Cleanup] Error during cleanup:', error);
            }
          }
        }
      }
    }
  };
}

/**
 * Helper to manage event listeners with automatic cleanup
 */
export function managedEventListener(
  target: EventTarget,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions
): () => void {
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
}

/**
 * Helper to manage intervals with automatic cleanup
 */
export function managedInterval(
  callback: () => void,
  delay: number
): () => void {
  const intervalId = setInterval(callback, delay);
  return () => clearInterval(intervalId);
}

/**
 * Helper to manage timeouts with automatic cleanup
 */
export function managedTimeout(
  callback: () => void,
  delay: number
): () => void {
  const timeoutId = setTimeout(callback, delay);
  return () => clearTimeout(timeoutId);
}

/**
 * Helper to manage ResizeObserver with automatic cleanup
 */
export function managedResizeObserver(
  target: Element,
  callback: ResizeObserverCallback
): () => void {
  const observer = new ResizeObserver(callback);
  observer.observe(target);
  return () => observer.disconnect();
}

/**
 * Helper to manage IntersectionObserver with automatic cleanup
 */
export function managedIntersectionObserver(
  targets: Element | Element[],
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): () => void {
  const observer = new IntersectionObserver(callback, options);
  const elements = Array.isArray(targets) ? targets : [targets];
  
  elements.forEach(el => observer.observe(el));
  
  return () => observer.disconnect();
}

/**
 * Combine multiple cleanup functions into one
 */
export function combineCleanups(...cleanups: ((() => void) | undefined)[]): () => void {
  return () => {
    cleanups.forEach(cleanup => {
      if (cleanup && typeof cleanup === 'function') {
        try {
          cleanup();
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[Cleanup] Error during combined cleanup:', error);
          }
        }
      }
    });
  };
}