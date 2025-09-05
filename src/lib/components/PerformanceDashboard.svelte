<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { performanceMonitor } from '../services/performanceMonitor';
  import { getCacheStats, clearAllCaches } from '../services/memoization';
  import { searchOptimizer, searchPerformance } from '../services/searchOptimizer';
  import { performanceSettings } from '../stores/performance';

  let memoryUsage = {
    used: 0,
    total: 0,
    limit: 0,
    percentage: 0,
  };

  let cacheStats = {
    text: { size: 0, calculatedSize: 0 },
    timestamp: { size: 0, calculatedSize: 0 },
    user: { size: 0, calculatedSize: 0 },
    emoji: { size: 0, calculatedSize: 0 },
  };

  let searchCacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
  };

  let performanceReport = '';
  let updateInterval: NodeJS.Timeout;
  let isExpanded = false;

  function updateMemoryUsage() {
    // @ts-ignore - performance.memory is Chrome-specific
    if (performance.memory) {
      // @ts-ignore
      const memory = performance.memory;
      memoryUsage = {
        used: memory.usedJSHeapSize / 1048576, // Convert to MB
        total: memory.totalJSHeapSize / 1048576,
        limit: memory.jsHeapSizeLimit / 1048576,
        percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      };
    }
  }

  function updateCacheStatistics() {
    cacheStats = getCacheStats();
    
    const searchStats = searchOptimizer.getCacheStats();
    searchCacheStats = {
      ...searchStats,
      hitRate: searchStats.hits / (searchStats.hits + searchStats.misses) || 0,
    };
  }

  function generateReport() {
    performanceReport = performanceMonitor.generateReport();
  }

  function handleClearCaches() {
    if (confirm('Clear all caches? This will remove all cached data and may temporarily slow down the app.')) {
      clearAllCaches();
      searchOptimizer.clearCache();
      updateCacheStatistics();
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  function formatTime(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  onMount(() => {
    updateMemoryUsage();
    updateCacheStatistics();
    generateReport();

    // Update stats every 2 seconds
    updateInterval = setInterval(() => {
      updateMemoryUsage();
      updateCacheStatistics();
      if (isExpanded) {
        generateReport();
      }
    }, 2000);
  });

  onDestroy(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });

  $: totalCacheItems = 
    cacheStats.text.size + 
    cacheStats.timestamp.size + 
    cacheStats.user.size + 
    cacheStats.emoji.size +
    searchCacheStats.size;

  $: totalCacheSize = 
    cacheStats.text.calculatedSize +
    cacheStats.timestamp.calculatedSize +
    cacheStats.user.calculatedSize +
    cacheStats.emoji.calculatedSize;
</script>

<div class="performance-dashboard" class:expanded={isExpanded}>
  <button 
    class="dashboard-toggle"
    on:click={() => isExpanded = !isExpanded}
    title="Toggle performance dashboard"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
    {#if !isExpanded}
      <span class="mini-stats">
        Mem: {formatPercentage(memoryUsage.percentage)} | 
        Cache: {totalCacheItems} items | 
        Hit: {formatPercentage(searchCacheStats.hitRate * 100)}
      </span>
    {:else}
      <span>Performance Monitor</span>
    {/if}
  </button>

  {#if isExpanded}
    <div class="dashboard-content">
      <!-- Memory Usage -->
      <div class="stat-section">
        <h3>Memory Usage</h3>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-label">Used</span>
            <span class="stat-value">{memoryUsage.used.toFixed(2)} MB</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total</span>
            <span class="stat-value">{memoryUsage.total.toFixed(2)} MB</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Limit</span>
            <span class="stat-value">{memoryUsage.limit.toFixed(2)} MB</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Usage</span>
            <span class="stat-value" class:warning={memoryUsage.percentage > 75}>
              {formatPercentage(memoryUsage.percentage)}
            </span>
          </div>
        </div>
        <div class="progress-bar">
          <div 
            class="progress-fill"
            class:warning={memoryUsage.percentage > 75}
            class:danger={memoryUsage.percentage > 90}
            style="width: {Math.min(100, memoryUsage.percentage)}%"
          ></div>
        </div>
      </div>

      <!-- Cache Statistics -->
      <div class="stat-section">
        <h3>Cache Statistics</h3>
        <div class="cache-grid">
          <div class="cache-item">
            <span class="cache-label">Text</span>
            <span class="cache-count">{cacheStats.text.size}</span>
            <span class="cache-size">{formatBytes(cacheStats.text.calculatedSize)}</span>
          </div>
          <div class="cache-item">
            <span class="cache-label">Timestamps</span>
            <span class="cache-count">{cacheStats.timestamp.size}</span>
            <span class="cache-size">{formatBytes(cacheStats.timestamp.calculatedSize)}</span>
          </div>
          <div class="cache-item">
            <span class="cache-label">Users</span>
            <span class="cache-count">{cacheStats.user.size}</span>
            <span class="cache-size">{formatBytes(cacheStats.user.calculatedSize)}</span>
          </div>
          <div class="cache-item">
            <span class="cache-label">Emojis</span>
            <span class="cache-count">{cacheStats.emoji.size}</span>
            <span class="cache-size">{formatBytes(cacheStats.emoji.calculatedSize)}</span>
          </div>
          <div class="cache-item">
            <span class="cache-label">Search Results</span>
            <span class="cache-count">{searchCacheStats.size}</span>
            <span class="cache-size">-</span>
          </div>
        </div>
        <div class="cache-summary">
          <span>Total: {totalCacheItems} items, {formatBytes(totalCacheSize)}</span>
          <button class="btn-clear" on:click={handleClearCaches}>Clear All</button>
        </div>
      </div>

      <!-- Search Performance -->
      <div class="stat-section">
        <h3>Search Performance</h3>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-label">Last Search</span>
            <span class="stat-value">{formatTime($searchPerformance.lastSearchTime)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Average</span>
            <span class="stat-value">{formatTime($searchPerformance.averageSearchTime)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Searches</span>
            <span class="stat-value">{$searchPerformance.totalSearches}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Cache Hit Rate</span>
            <span class="stat-value good">
              {formatPercentage($searchPerformance.cacheHitRate * 100)}
            </span>
          </div>
        </div>
      </div>

      <!-- Performance Settings -->
      <div class="stat-section">
        <h3>Performance Settings</h3>
        <div class="settings-grid">
          <label>
            <input 
              type="checkbox" 
              bind:checked={$performanceSettings.useOptimizedMessageItem}
            />
            Optimized Message Rendering
          </label>
          <label>
            <input 
              type="checkbox" 
              bind:checked={$performanceSettings.enableApiBatching}
            />
            API Request Batching
          </label>
          <label>
            <input 
              type="checkbox" 
              bind:checked={$performanceSettings.lazyLoadReactions}
            />
            Lazy Load Reactions
          </label>
          <label>
            <input 
              type="checkbox" 
              bind:checked={$performanceSettings.performanceMetrics}
            />
            Show Performance Metrics
          </label>
        </div>
      </div>

      <!-- Performance Report -->
      {#if $performanceSettings.performanceMetrics && performanceReport}
        <div class="stat-section">
          <h3>Performance Report</h3>
          <pre class="report">{performanceReport}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .performance-dashboard {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    transition: all 0.3s ease;
    max-width: 90vw;
  }

  .performance-dashboard.expanded {
    width: 480px;
    max-height: 80vh;
    overflow: hidden;
  }

  .dashboard-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
  }

  .dashboard-toggle:hover {
    background: var(--bg-hover);
  }

  .mini-stats {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .dashboard-content {
    padding: 0 1rem 1rem;
    max-height: calc(80vh - 50px);
    overflow-y: auto;
  }

  .stat-section {
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .stat-section:last-child {
    border-bottom: none;
  }

  .stat-section h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-value.warning {
    color: var(--warning, orange);
  }

  .stat-value.good {
    color: var(--success, green);
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-primary);
    border-radius: 4px;
    overflow: hidden;
    margin-top: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
  }

  .progress-fill.warning {
    background: var(--warning, orange);
  }

  .progress-fill.danger {
    background: var(--error);
  }

  .cache-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .cache-item {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .cache-label {
    color: var(--text-secondary);
  }

  .cache-count {
    color: var(--text-primary);
    font-weight: 600;
  }

  .cache-size {
    color: var(--text-secondary);
    font-size: 0.7rem;
  }

  .cache-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.75rem;
    padding: 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .btn-clear {
    padding: 0.25rem 0.5rem;
    background: var(--error);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .btn-clear:hover {
    opacity: 0.9;
  }

  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .settings-grid label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .settings-grid input[type="checkbox"] {
    cursor: pointer;
  }

  .report {
    padding: 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
  }

  .dashboard-content::-webkit-scrollbar {
    width: 6px;
  }

  .dashboard-content::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  .dashboard-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
</style>