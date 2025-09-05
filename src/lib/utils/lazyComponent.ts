import { onMount, type ComponentType, SvelteComponent } from 'svelte';

/**
 * Creates a lazy-loaded component wrapper
 * @param importFn - Function that returns a dynamic import promise
 * @returns A wrapper component that loads the target component on demand
 */
export function lazyComponent<T extends SvelteComponent>(
  importFn: () => Promise<{ default: ComponentType<T> }>
) {
  let Component: ComponentType<T> | null = null;
  let loading = true;
  let error: Error | null = null;

  const loadComponent = async () => {
    try {
      const module = await importFn();
      Component = module.default;
      loading = false;
    } catch (err) {
      error = err as Error;
      loading = false;
      console.error('Failed to load component:', err);
    }
  };

  return {
    Component,
    loading,
    error,
    load: loadComponent
  };
}

/**
 * Preloads a component in the background
 * @param importFn - Function that returns a dynamic import promise
 */
export function preloadComponent(
  importFn: () => Promise<any>
): void {
  // Start loading the component in the background
  importFn().catch(err => {
    console.warn('Failed to preload component:', err);
  });
}

/**
 * Creates a component that loads when it becomes visible
 * Uses IntersectionObserver for viewport-based loading
 */
export function viewportLazyComponent<T extends SvelteComponent>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  options: IntersectionObserverInit = {}
) {
  let Component: ComponentType<T> | null = null;
  let loading = false;
  let error: Error | null = null;
  let observer: IntersectionObserver | null = null;

  const loadComponent = async () => {
    if (loading || Component) return;
    
    loading = true;
    try {
      const module = await importFn();
      Component = module.default;
    } catch (err) {
      error = err as Error;
      console.error('Failed to load component:', err);
    } finally {
      loading = false;
    }
  };

  const observe = (element: Element) => {
    if (!element || Component) return;

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadComponent();
            observer?.disconnect();
          }
        });
      },
      {
        rootMargin: '50px',
        ...options
      }
    );

    observer.observe(element);
  };

  const cleanup = () => {
    observer?.disconnect();
  };

  return {
    Component,
    loading,
    error,
    observe,
    cleanup,
    load: loadComponent
  };
}

/**
 * Utility to split large data processing into chunks
 * Prevents UI blocking during heavy computations
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (item: T) => R,
  chunkSize = 50
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = chunk.map(processor);
    results.push(...chunkResults);
    
    // Yield to the browser to prevent blocking
    if (i + chunkSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  return results;
}