<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { settings, isDMChannelsEnabled } from '../stores/settings';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import type { SlackConversation } from '../types/slack';

  // State for DM channels
  let dmChannels: SlackConversation[] = [];
  let isLoading = false;
  let error: string | null = null;
  let hasPermission = false;
  let isFeatureEnabled = false;

  // Check if feature is enabled
  $: isFeatureEnabled = isDMChannelsEnabled();

  onMount(async () => {
    if (!isFeatureEnabled) {
      console.log('[DMChannels] Feature is disabled');
      return;
    }

    await checkPermissionsAndLoadDMs();
  });

  async function checkPermissionsAndLoadDMs() {
    isLoading = true;
    error = null;

    try {
      // First check if we have permission
      console.log('[DMChannels] Checking DM permissions...');
      hasPermission = await invoke('check_dm_permissions');

      if (!hasPermission) {
        error = 'Your token does not have permission to access DM channels. Please ensure your token has the "im:read" scope.';
        return;
      }

      // If we have permission, load DM channels
      console.log('[DMChannels] Loading DM channels...');
      dmChannels = await invoke('get_dm_channels');
      console.log(`[DMChannels] Loaded ${dmChannels.length} DM channels`);

    } catch (err) {
      console.error('[DMChannels] Error loading DM channels:', err);
      error = err instanceof Error ? err.message : 'Failed to load DM channels';
    } finally {
      isLoading = false;
    }
  }

  function handleRefresh() {
    checkPermissionsAndLoadDMs();
  }
</script>

<div class="dm-channels-container">
  {#if !isFeatureEnabled}
    <div class="feature-disabled">
      <p>DM Channels feature is currently disabled.</p>
      <p class="hint">Enable it in Settings → Experimental Features</p>
    </div>
  {:else if isLoading}
    <div class="loading-container">
      <LoadingSpinner />
      <p>Loading DM channels...</p>
    </div>
  {:else if error}
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <p class="error-message">{error}</p>
      <button class="retry-button" on:click={handleRefresh}>
        Retry
      </button>
    </div>
  {:else if dmChannels.length === 0}
    <div class="empty-state">
      <p>No DM channels found</p>
      <button class="refresh-button" on:click={handleRefresh}>
        Refresh
      </button>
    </div>
  {:else}
    <div class="dm-list-header">
      <h3>Direct Messages ({dmChannels.length})</h3>
      <button class="refresh-button" on:click={handleRefresh} title="Refresh DM channels">
        🔄
      </button>
    </div>
    <div class="dm-list">
      {#each dmChannels as dm}
        <div class="dm-item">
          <div class="dm-icon">💬</div>
          <div class="dm-info">
            <div class="dm-id">{dm.id}</div>
            {#if dm.name}
              <div class="dm-name">{dm.name}</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <div class="phase-notice">
      <p>⚠️ Phase 1: Read-only display of DM channels</p>
      <p class="hint">Search functionality will be added in future phases</p>
    </div>
  {/if}
</div>

<style>
  .dm-channels-container {
    padding: 1rem;
    background-color: var(--background-secondary);
    border-radius: 8px;
    margin: 1rem 0;
  }

  .feature-disabled {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    gap: 1rem;
  }

  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
    gap: 1rem;
    text-align: center;
  }

  .error-icon {
    font-size: 2rem;
  }

  .error-message {
    color: var(--error-color, #dc3545);
    margin: 0;
  }

  .retry-button,
  .refresh-button {
    padding: 0.5rem 1rem;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .retry-button:hover,
  .refresh-button:hover {
    background-color: var(--primary-hover-color);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }

  .dm-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .dm-list-header h3 {
    margin: 0;
    color: var(--text-primary);
  }

  .dm-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .dm-item {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    border-radius: 4px;
    transition: background-color 0.2s;
    cursor: default;
  }

  .dm-item:hover {
    background-color: var(--hover-background);
  }

  .dm-icon {
    font-size: 1.25rem;
    margin-right: 0.75rem;
  }

  .dm-info {
    flex: 1;
  }

  .dm-id {
    font-family: monospace;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .dm-name {
    color: var(--text-primary);
    margin-top: 0.25rem;
  }

  .phase-notice {
    margin-top: 1rem;
    padding: 1rem;
    background-color: var(--warning-background, #fff3cd);
    border: 1px solid var(--warning-border, #ffc107);
    border-radius: 4px;
    color: var(--warning-text, #856404);
  }

  .phase-notice p {
    margin: 0.25rem 0;
  }

  .hint {
    font-size: 0.875rem;
    opacity: 0.8;
  }

  /* Dark mode support */
  :global(.dark) .dm-channels-container {
    background-color: #1e1e1e;
  }

  :global(.dark) .dm-item:hover {
    background-color: #2a2a2a;
  }

  :global(.dark) .phase-notice {
    background-color: #3a3a2a;
    border-color: #8b7355;
    color: #d4af37;
  }
</style>