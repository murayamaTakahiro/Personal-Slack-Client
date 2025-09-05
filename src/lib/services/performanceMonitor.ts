import { get } from 'svelte/store';
import { performanceSettings } from '../stores/performance';

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private enabled: boolean = false;

  constructor() {
    // Subscribe to performance settings
    performanceSettings.subscribe(settings => {
      this.enabled = settings.performanceMetrics;
    });
  }

  /**
   * Start measuring a performance metric
   */
  start(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };

    this.metrics.set(name, metric);
    
    if (this.enabled) {
      console.log(`[Performance] Started measuring: ${name}`, metadata || '');
    }
  }

  /**
   * End measuring a performance metric
   */
  end(name: string): number | null {
    if (!this.enabled) return null;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`[Performance] No metric found for: ${name}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    if (this.enabled) {
      console.log(`[Performance] ${name}: ${metric.duration.toFixed(2)}ms`, metric.metadata || '');
    }

    // Clean up after logging
    this.metrics.delete(name);

    return metric.duration;
  }

  /**
   * Measure a function's execution time
   */
  async measure<T>(
    name: string, 
    fn: () => T | Promise<T>, 
    metadata?: Record<string, any>
  ): Promise<T> {
    this.start(name, metadata);
    
    try {
      const result = await fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  /**
   * Log render performance for a component
   */
  logRenderPerformance(componentName: string, itemCount: number): void {
    if (!this.enabled) return;

    const renderTime = this.end(`render_${componentName}`);
    if (renderTime !== null) {
      const avgTimePerItem = itemCount > 0 ? renderTime / itemCount : 0;
      console.log(
        `[Performance] ${componentName} render:`,
        `Total: ${renderTime.toFixed(2)}ms,`,
        `Items: ${itemCount},`,
        `Avg: ${avgTimePerItem.toFixed(2)}ms/item`
      );
    }
  }

  /**
   * Log scroll performance
   */
  logScrollPerformance(scrollTop: number, visibleItems: number, totalItems: number): void {
    if (!this.enabled) return;

    console.log(
      `[Performance] Scroll:`,
      `Position: ${scrollTop.toFixed(0)}px,`,
      `Visible: ${visibleItems}/${totalItems} items`,
      `(${((visibleItems / totalItems) * 100).toFixed(1)}%)`
    );
  }

  /**
   * Log memory usage (if available)
   */
  logMemoryUsage(): void {
    if (!this.enabled) return;

    // @ts-ignore - performance.memory is not standard but available in Chrome
    if (performance.memory) {
      // @ts-ignore
      const memory = performance.memory;
      const used = memory.usedJSHeapSize / 1048576; // Convert to MB
      const total = memory.totalJSHeapSize / 1048576; // Convert to MB
      const limit = memory.jsHeapSizeLimit / 1048576; // Convert to MB
      
      console.log(
        `[Performance] Memory:`,
        `Used: ${used.toFixed(2)}MB,`,
        `Total: ${total.toFixed(2)}MB,`,
        `Limit: ${limit.toFixed(2)}MB`,
        `(${((used / limit) * 100).toFixed(1)}% of limit)`
      );
    }
  }

  /**
   * Create a performance report
   */
  generateReport(): string {
    const report: string[] = ['=== Performance Report ==='];
    
    // Add current metrics
    this.metrics.forEach(metric => {
      const duration = metric.endTime 
        ? metric.endTime - metric.startTime 
        : performance.now() - metric.startTime;
      
      report.push(
        `${metric.name}: ${duration.toFixed(2)}ms ${metric.endTime ? '(completed)' : '(in progress)'}`
      );
    });

    // Add memory info if available
    // @ts-ignore
    if (performance.memory) {
      // @ts-ignore
      const memory = performance.memory;
      report.push('');
      report.push('Memory Usage:');
      report.push(`  Used: ${(memory.usedJSHeapSize / 1048576).toFixed(2)}MB`);
      report.push(`  Total: ${(memory.totalJSHeapSize / 1048576).toFixed(2)}MB`);
      report.push(`  Limit: ${(memory.jsHeapSizeLimit / 1048576).toFixed(2)}MB`);
    }

    return report.join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export convenience functions
export function measurePerformance<T>(
  name: string,
  fn: () => T | Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return performanceMonitor.measure(name, fn, metadata);
}

export function startMeasurement(name: string, metadata?: Record<string, any>): void {
  performanceMonitor.start(name, metadata);
}

export function endMeasurement(name: string): number | null {
  return performanceMonitor.end(name);
}

export function logPerformance(message: string): void {
  const settings = get(performanceSettings);
  if (settings.performanceMetrics) {
    console.log(`[Performance] ${message}`);
  }
}