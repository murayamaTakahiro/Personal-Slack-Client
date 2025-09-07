<script lang="ts">
  import { onDestroy } from 'svelte';
  import { searchResults, reactionLoadingState } from '../stores/search';
  
  let searchTime = 0;
  let messageCount = 0;
  let reactionsLoaded = 0;
  let reactionsTotal = 0;
  let reactionLoadTime = 0;
  let reactionStartTime: number | null = null;
  
  // Subscribe to search results
  const unsubscribeSearch = searchResults.subscribe(result => {
    if (result) {
      searchTime = result.executionTimeMs || 0;
      messageCount = result.messages.length;
    }
  });
  
  // Subscribe to reaction loading state
  const unsubscribeReactions = reactionLoadingState.subscribe(state => {
    if (state.isLoading && !reactionStartTime) {
      reactionStartTime = Date.now();
    } else if (!state.isLoading && reactionStartTime) {
      reactionLoadTime = Date.now() - reactionStartTime;
      reactionStartTime = null;
    }
    
    reactionsLoaded = state.loadedCount;
    reactionsTotal = state.totalCount;
  });
  
  onDestroy(() => {
    unsubscribeSearch();
    unsubscribeReactions();
  });
  
  $: reactionProgress = reactionsTotal > 0 ? (reactionsLoaded / reactionsTotal) * 100 : 0;
  $: avgTimePerMessage = messageCount > 0 ? Math.round((searchTime + reactionLoadTime) / messageCount) : 0;
  $: totalTime = searchTime + reactionLoadTime;
  
  // Performance rating
  $: performanceRating = getPerformanceRating(avgTimePerMessage);
  
  function getPerformanceRating(avgTime: number) {
    if (avgTime === 0) return { label: 'No data', color: 'text-gray-500' };
    if (avgTime < 10) return { label: 'Excellent', color: 'text-green-500' };
    if (avgTime < 25) return { label: 'Good', color: 'text-blue-500' };
    if (avgTime < 50) return { label: 'Fair', color: 'text-yellow-500' };
    return { label: 'Needs optimization', color: 'text-red-500' };
  }
</script>

{#if messageCount > 0}
<div class="performance-monitor">
  <div class="monitor-header">
    <h4>Performance Metrics</h4>
    <span class={`rating ${performanceRating.color}`}>{performanceRating.label}</span>
  </div>
  
  <div class="metrics-grid">
    <div class="metric">
      <span class="label">Messages</span>
      <span class="value">{messageCount}</span>
    </div>
    
    <div class="metric">
      <span class="label">Search Time</span>
      <span class="value">{searchTime}ms</span>
    </div>
    
    <div class="metric">
      <span class="label">Reactions</span>
      <span class="value">{reactionsLoaded}/{reactionsTotal}</span>
    </div>
    
    <div class="metric">
      <span class="label">Reaction Time</span>
      <span class="value">{reactionLoadTime}ms</span>
    </div>
    
    <div class="metric">
      <span class="label">Total Time</span>
      <span class="value highlight">{totalTime}ms</span>
    </div>
    
    <div class="metric">
      <span class="label">Avg/Message</span>
      <span class="value highlight">{avgTimePerMessage}ms</span>
    </div>
  </div>
  
  {#if $reactionLoadingState.isLoading}
  <div class="progress-bar">
    <div class="progress-fill" style="width: {reactionProgress}%"></div>
  </div>
  {/if}
  
  <div class="optimization-tips">
    {#if messageCount > 100}
      <p class="tip">✨ Using ultra-fast mode for {messageCount} messages</p>
    {/if}
    {#if avgTimePerMessage > 25}
      <p class="tip">💡 Consider enabling aggressive caching in Performance Settings</p>
    {/if}
    {#if reactionLoadTime > searchTime * 2}
      <p class="tip">⚡ Reactions are loading in background - UI remains responsive</p>
    {/if}
  </div>
</div>
{/if}

<style>
  .performance-monitor {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-width: 300px;
    font-size: 12px;
  }
  
  .monitor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  .monitor-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  
  .rating {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
  }
  
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  
  .metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: var(--background-primary);
    border-radius: 4px;
  }
  
  .metric .label {
    color: var(--text-secondary);
    font-size: 11px;
  }
  
  .metric .value {
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .metric .value.highlight {
    color: var(--accent-color);
  }
  
  .progress-bar {
    height: 4px;
    background: var(--background-primary);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 12px;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--accent-color);
    transition: width 0.3s ease;
  }
  
  .optimization-tips {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
  }
  
  .tip {
    margin: 4px 0;
    font-size: 11px;
    color: var(--text-secondary);
  }
  
  .text-green-500 {
    color: #10b981;
  }
  
  .text-blue-500 {
    color: #3b82f6;
  }
  
  .text-yellow-500 {
    color: #f59e0b;
  }
  
  .text-red-500 {
    color: #ef4444;
  }
  
  .text-gray-500 {
    color: #6b7280;
  }
</style>