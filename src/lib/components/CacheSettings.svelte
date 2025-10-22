<script lang="ts">
  import { settings } from '../stores/settings';
  import { showInfo, showToast } from '../stores/toast';
  import { cacheService } from '../services/cacheService';
  import { activeWorkspace } from '../stores/workspaces';
  import { get } from 'svelte/store';

  // Cache duration options in milliseconds
  const CACHE_DURATIONS = [
    { label: '1 hour', value: 1 * 60 * 60 * 1000 },
    { label: '6 hours (default)', value: 6 * 60 * 60 * 1000 },
    { label: '12 hours', value: 12 * 60 * 60 * 1000 },
    { label: '24 hours', value: 24 * 60 * 60 * 1000 },
    { label: 'Never expire (manual only)', value: 365 * 24 * 60 * 60 * 1000 } // 1 year
  ];

  function handleCacheDurationChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = parseInt(target.value);
    settings.update(s => ({
      ...s,
      channelCacheMaxAge: value
    }));

    const selectedOption = CACHE_DURATIONS.find(d => d.value === value);
    showInfo('Cache Settings', `Cache duration set to: ${selectedOption?.label || 'custom'}`);
  }

  function handleRefreshCache() {
    // Dispatch custom event to trigger loadChannels with force refresh
    window.dispatchEvent(new CustomEvent('force-refresh-workspace-data'));
    showToast('Refreshing workspace data...', 'info', 2000);
  }

  function handleClearCache() {
    const currentWorkspace = get(activeWorkspace);
    if (currentWorkspace?.id) {
      cacheService.clearWorkspaceCache(currentWorkspace.id);
    } else {
      cacheService.clearAll();
    }
    showToast('Cache cleared successfully', 'success', 2000);
  }

  // Get last refresh timestamp
  function getLastRefreshTime(): string {
    const currentWorkspace = get(activeWorkspace);
    const workspaceId = currentWorkspace?.id;
    const timestamp = cacheService.getLastRefreshTimestamp('channels', workspaceId);

    if (!timestamp) return 'Never';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  // Reactive statement to update last refresh time
  $: lastRefresh = getLastRefreshTime();

  // Update every minute
  let refreshInterval: NodeJS.Timeout;
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    refreshInterval = setInterval(() => {
      lastRefresh = getLastRefreshTime();
    }, 60000); // Update every minute
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });
</script>

<div class="cache-settings">
  <h3>Cache Settings</h3>
  <p class="description">Configure how often workspace data (channels and users) should be refreshed</p>

  <div class="setting-group">
    <label class="select-setting">
      <div class="setting-info">
        <span class="setting-label">Cache Duration</span>
        <span class="setting-description">
          How long to use cached data before refreshing from Slack.
          Shorter duration = more up-to-date data, but slower startup.
        </span>
      </div>
      <select
        value={$settings.channelCacheMaxAge || (6 * 60 * 60 * 1000)}
        on:change={handleCacheDurationChange}
        class="select-input"
      >
        {#each CACHE_DURATIONS as duration}
          <option value={duration.value}>{duration.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="setting-group">
    <div class="cache-status">
      <span class="status-label">Last Refresh:</span>
      <span class="status-value">{lastRefresh}</span>
    </div>
  </div>

  <div class="setting-group button-group">
    <button
      on:click={handleRefreshCache}
      class="action-button refresh-button"
      title="Force refresh workspace data from Slack (Ctrl+Shift+R)"
    >
      <span class="button-icon">🔄</span>
      Refresh Now
    </button>

    <button
      on:click={handleClearCache}
      class="action-button clear-button"
      title="Clear cached workspace data"
    >
      <span class="button-icon">🗑️</span>
      Clear Cache
    </button>
  </div>

  <div class="help-text">
    <p>💡 <strong>Tip:</strong> Use <kbd>Ctrl+Shift+R</kbd> to force refresh workspace data at any time.</p>
    <p>💡 Cached data enables instant search on app startup without waiting for API calls.</p>
  </div>
</div>

<style>
  .cache-settings {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--background-secondary);
    border-radius: 0.5rem;
    border: 1px solid var(--border-color);
  }

  .select-setting {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-label {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .setting-description {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .select-input {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    background: var(--background-primary);
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .select-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .cache-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-label {
    font-weight: 500;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .status-value {
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .button-group {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-button {
    background: var(--accent-color);
    color: white;
  }

  .refresh-button:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .clear-button {
    background: var(--background-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .clear-button:hover {
    background: var(--background-secondary);
    border-color: var(--text-secondary);
  }

  .button-icon {
    font-size: 1.1rem;
  }

  .help-text {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--background-info);
    border-radius: 0.375rem;
    border-left: 3px solid var(--info-color);
  }

  .help-text p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  kbd {
    padding: 0.125rem 0.375rem;
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
