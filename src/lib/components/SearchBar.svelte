<script lang="ts">
  import { searchQuery, searchParams, searchLoading } from '../stores/search';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import ChannelSelector from './ChannelSelector.svelte';
  import UserSelector from './UserSelector.svelte';
  import { getKeyboardService } from '../services/keyboardService';
  import { userService } from '../services/userService';
  
  export let channels: [string, string][] = [];
  export let showAdvanced = false;
  
  const dispatch = createEventDispatcher();
  
  let channel = '';
  let user = '';
  let userId = '';  // Store the actual user ID
  let fromDate = '';
  let toDate = '';
  let limit = 1000;
  let searchInput: HTMLInputElement;
  let showChannelSelector = false;
  let channelSelectorComponent: ChannelSelector;
  let userSelectorComponent: UserSelector;
  
  async function handleSearch() {
    // Check if we have either a query or at least one filter
    const hasFilters = channel || userId || fromDate || toDate;
    const hasQuery = $searchQuery.trim();
    
    if (hasQuery || hasFilters) {
      // Resolve user input to user ID if needed
      let resolvedUserId = userId;
      if (user && !userId) {
        // User typed something manually, try to resolve it
        resolvedUserId = await userService.resolveUserToId(user) || '';
      }
      
      // Clean up channel - remove # symbol if present
      let cleanChannel = channel.trim();
      if (cleanChannel.startsWith('#')) {
        cleanChannel = cleanChannel.substring(1);
      }
      
      searchParams.set({
        query: $searchQuery.trim() || undefined,  // Make query optional
        channel: cleanChannel || undefined,
        user: resolvedUserId || undefined,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit
      });
      dispatch('search');
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !$searchLoading) {
      handleSearch();
    }
  }
  
  // Check if search is possible
  $: canSearch = $searchQuery.trim() || channel || userId || user || fromDate || toDate;
  
  function toggleAdvanced() {
    showAdvanced = !showAdvanced;
  }
  
  function clearFilters() {
    channel = '';
    user = '';
    userId = '';
    fromDate = '';
    toDate = '';
    limit = 100;
  }
  
  // Exported methods for keyboard shortcuts
  export function focusSearchInput() {
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
  
  export function toggleAdvancedSearch() {
    showAdvanced = !showAdvanced;
  }
  
  export function toggleChannelSelector() {
    if (channelSelectorComponent && channelSelectorComponent.toggleDropdown) {
      channelSelectorComponent.toggleDropdown();
    }
  }
  
  // Setup keyboard handlers
  onMount(() => {
    const keyboardService = getKeyboardService();
    if (!keyboardService) return;
    
    // Execute Search (Enter key is already handled in input)
    keyboardService.registerHandler('executeSearch', {
      action: () => {
        if (canSearch && !$searchLoading) {
          handleSearch();
        }
      },
      allowInInput: true
    });
    
    // Clear Search
    keyboardService.registerHandler('clearSearch', {
      action: () => {
        if ($searchQuery || channel || userId || user || fromDate || toDate) {
          $searchQuery = '';
          clearFilters();
        }
      },
      allowInInput: true
    });
  });
  
  onDestroy(() => {
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.unregisterHandler('executeSearch');
      keyboardService.unregisterHandler('clearSearch');
    }
  });
</script>

<div class="search-bar">
  <div class="search-main">
    <input
      type="text"
      bind:this={searchInput}
      bind:value={$searchQuery}
      on:keydown={handleKeydown}
      placeholder="Search messages... (optional with filters)"
      disabled={$searchLoading}
      class="search-input"
    />
    
    <button
      on:click={toggleAdvanced}
      class="btn-icon {(channel || user || fromDate || toDate) ? 'active' : ''}"
      title="Advanced filters {(channel || user || fromDate || toDate) ? '(active)' : ''}"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 4h18v2.172a2 2 0 0 1-.586 1.414l-6.828 6.828A2 2 0 0 0 13 15.828V20l-4 2v-6.172a2 2 0 0 0-.586-1.414L1.586 7.586A2 2 0 0 1 1 6.172V4z"/>
      </svg>
      {#if channel || user || fromDate || toDate}
        <span class="filter-indicator"></span>
      {/if}
    </button>
    
    <button
      on:click={handleSearch}
      disabled={$searchLoading || (!$searchQuery.trim() && !channel && !user && !fromDate && !toDate)}
      class="btn-primary"
    >
      {#if $searchLoading}
        Searching...
      {:else}
        Search
      {/if}
    </button>
  </div>
  
  {#if showAdvanced}
    <div class="search-advanced">
      {#if !$searchQuery.trim() && (channel || user || fromDate || toDate)}
        <div class="info-message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>You can search with filters only - no search term required!</span>
        </div>
      {/if}
      {#if channel || user || fromDate || toDate}
        <div class="active-filters">
          <span class="filter-label">Active filters:</span>
          {#if channel}
            <span class="filter-tag">Channel: {channel}</span>
          {/if}
          {#if userId || user}
            <span class="filter-tag">User: {user || userId}</span>
          {/if}
          {#if fromDate}
            <span class="filter-tag">From: {fromDate}</span>
          {/if}
          {#if toDate}
            <span class="filter-tag">To: {toDate}</span>
          {/if}
        </div>
      {/if}
      <div class="filter-row">
        <label class="channel-label">
          Channel:
          <ChannelSelector 
            bind:this={channelSelectorComponent}
            bind:value={channel}
            {channels}
            on:change={(e) => {
              if (e.detail.channels) {
                // Multi-select mode
                channel = e.detail.channels.join(',');
              } else {
                // Single select mode
                channel = e.detail.channel || '';
              }
            }}
          />
        </label>
        
        <label>
          User:
          <UserSelector
            bind:this={userSelectorComponent}
            bind:value={userId}
            on:change={(e) => {
              userId = e.detail.userId || '';
              user = e.detail.userName || '';
            }}
          />
        </label>
      </div>
      
      <div class="filter-row">
        <label>
          From:
          <input
            type="date"
            bind:value={fromDate}
          />
        </label>
        
        <label>
          To:
          <input
            type="date"
            bind:value={toDate}
          />
        </label>
        
        <label>
          Max results:
          <input
            type="number"
            bind:value={limit}
            min="10"
            max="10000"
            step="10"
          />
        </label>
      </div>
      
      <div class="filter-actions">
        <button on:click={clearFilters} class="btn-secondary">
          Clear filters
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .search-bar {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .search-main {
    display: flex;
    gap: 0.5rem;
  }
  
  .search-input {
    flex: 1;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
    background: var(--bg-primary);
    color: var(--text-primary);
  }
  
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .search-input:disabled {
    opacity: 0.6;
  }
  
  .search-advanced {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  
  .filter-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .filter-row label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .filter-row input,
  .filter-row select {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .filter-actions {
    display: flex;
    justify-content: flex-end;
  }
  
  .btn-primary,
  .btn-secondary,
  .btn-icon {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: var(--primary);
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .btn-secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    background: var(--bg-hover);
  }
  
  .btn-icon {
    padding: 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  
  .btn-icon:hover {
    background: var(--bg-hover);
  }
  
  .btn-icon.active {
    color: var(--primary);
    background: var(--primary-bg);
  }
  
  .filter-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: var(--primary);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.4);
    }
    70% {
      box-shadow: 0 0 0 6px rgba(74, 144, 226, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(74, 144, 226, 0);
    }
  }
  
  .active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: var(--primary-bg);
    border-radius: 4px;
    border: 1px solid var(--primary);
  }
  
  .filter-label {
    font-weight: 500;
    color: var(--text-secondary);
    margin-right: 0.5rem;
  }
  
  .filter-tag {
    padding: 0.25rem 0.75rem;
    background: white;
    border: 1px solid var(--primary);
    border-radius: 16px;
    font-size: 0.875rem;
    color: var(--primary);
  }
  
  .info-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 1rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 4px;
    color: var(--primary);
    font-size: 0.875rem;
  }
  
  .info-message svg {
    flex-shrink: 0;
  }
  
  .channel-label {
    flex: 2;
    min-width: 300px;
  }
  
  .filter-row .channel-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>