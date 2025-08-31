<script lang="ts">
  import { searchQuery, searchParams, searchLoading, searchProgress, selectedMessage, searchError } from '../stores/search';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import ChannelSelector from './ChannelSelector.svelte';
  import UserSelector from './UserSelector.svelte';
  import { getKeyboardService } from '../services/keyboardService';
  import { userService } from '../services/userService';
  import { realtimeStore } from '../stores/realtime';
  import { channelStore } from '../stores/channels';
  import { getThreadFromUrl } from '../api/slack';
  
  export let channels: [string, string][] = [];
  export let showAdvanced = true;
  
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
  let urlInput = '';
  let urlLoading = false;
  let urlInputElement: HTMLInputElement;
  
  async function handleSearch(isRealtimeUpdate: boolean = false) {
    // If realtime mode is enabled and this is a realtime update, auto-set today's date
    if ($realtimeStore.isEnabled && isRealtimeUpdate) {
      // Use local date instead of UTC to get today in user's timezone
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      fromDate = `${year}-${month}-${day}`;
      
      // Don't set toDate - we want all messages from today onward
      toDate = '';
      // Clear query for realtime mode to focus on channel-based filtering
      searchQuery.set('');
    }
    
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
      
      console.log('Channel value in SearchBar handleSearch:', channel);
      console.log('Clean channel:', cleanChannel);
      console.log('Realtime mode:', $realtimeStore.isEnabled);
      
      if (!cleanChannel) {
        console.warn('No channel selected despite UI showing selection!');
      }
      
      // Record channel usage for recent channels tracking
      if (cleanChannel) {
        // For multi-channel mode, channel might be comma-separated
        const channelList = cleanChannel.split(',').map(ch => ch.trim());
        channelList.forEach(ch => {
          if (ch) {
            channelStore.addToRecent(ch);
          }
        });
      }
      
      const params = {
        query: $searchQuery.trim() || undefined,  // Make query optional
        channel: cleanChannel || undefined,
        user: resolvedUserId || undefined,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit,
        isRealtimeUpdate // Pass this flag through
      };
      searchParams.set(params);
      dispatch('search', params);
    }
  }
  
  async function handleUrlPaste() {
    if (!urlInput.trim()) return;
    
    urlLoading = true;
    searchError.set(null);
    
    try {
      const thread = await getThreadFromUrl(urlInput);
      selectedMessage.set(thread.parent);
      urlInput = '';
    } catch (err) {
      let errorMessage = 'Failed to load thread from URL';
      if (err instanceof Error) {
        errorMessage = err.message;
        // Extract more specific error details if available
        if (err.message.includes('Invalid Slack URL')) {
          errorMessage = 'Invalid Slack URL format. Please paste a valid Slack message link.';
        } else if (err.message.includes('Authentication') || err.message.includes('No Slack token')) {
          errorMessage = 'Authentication failed. Please check your Slack token in Settings.';
        } else if (err.message.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.message.includes('not found')) {
          errorMessage = 'Thread not found. The message may have been deleted or you may not have access.';
        }
      }
      searchError.set(errorMessage);
      console.error('URL parse error:', err);
    } finally {
      urlLoading = false;
    }
  }

  // Export for external triggering (from App.svelte for realtime updates)
  export function triggerRealtimeSearch() {
    handleSearch(true);
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !$searchLoading) {
      handleSearch();
    }
  }

  function handleUrlKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !urlLoading) {
      handleUrlPaste();
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
    // Also clear the ChannelSelector component
    if (channelSelectorComponent) {
      channelSelectorComponent.clearSelection();
    }
    // Also clear the UserSelector component
    if (userSelectorComponent) {
      userSelectorComponent.clearSelection();
    }
  }
  
  // Exported methods for keyboard shortcuts
  export function focusSearchInput() {
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  export function focusUrlInput() {
    if (urlInputElement) {
      urlInputElement.focus();
      urlInputElement.select();
    }
  }
  
  export function toggleAdvancedSearch() {
    showAdvanced = !showAdvanced;
  }
  
  export function isAdvancedOpen() {
    return showAdvanced;
  }
  
  export function toggleChannelSelector() {
    if (channelSelectorComponent && channelSelectorComponent.toggleDropdown) {
      channelSelectorComponent.toggleDropdown();
    }
  }
  
  export function clearAllFilters() {
    // Clear all search filters
    channel = '';
    user = '';
    userId = '';
    fromDate = '';
    toDate = '';
    
    // Clear the channel selector if it exists
    if (channelSelectorComponent && channelSelectorComponent.clearSelection) {
      channelSelectorComponent.clearSelection();
    }
    
    // Clear the user selector if it exists
    if (userSelectorComponent && userSelectorComponent.clearSelection) {
      userSelectorComponent.clearSelection();
    }
  }
  
  // Keep the old function name for backward compatibility
  export function clearChannelSelection() {
    clearAllFilters();
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
    <button
      on:click={toggleAdvanced}
      class="btn-toggle {showAdvanced ? 'active' : ''}"
      title="Toggle filters (Ctrl+Shift+F)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 4h18v2.172a2 2 0 0 1-.586 1.414l-6.828 6.828A2 2 0 0 0 13 15.828V20l-4 2v-6.172a2 2 0 0 0-.586-1.414L1.586 7.586A2 2 0 0 1 1 6.172V4z"/>
      </svg>
      {#if $searchQuery || urlInput || channel || user || fromDate || toDate}
        <span class="filter-indicator"></span>
      {/if}
    </button>
    
    <button
      on:click={handleSearch}
      disabled={$searchLoading || (!$searchQuery.trim() && !channel && !user && !fromDate && !toDate)}
      class="btn-primary"
    >
      {#if $searchLoading}
        {#if $searchProgress}
          Searching {$searchProgress.channel || ''} ({$searchProgress.current}/{$searchProgress.total})
        {:else}
          Searching...
        {/if}
      {:else}
        Search
      {/if}
    </button>
  </div>
  
  {#if $searchLoading && $searchProgress && $searchProgress.total > 1}
    <div class="progress-bar">
      <div class="progress-fill" style="width: {($searchProgress.current / $searchProgress.total) * 100}%"></div>
      <div class="progress-text">
        チャンネル検索中: {$searchProgress.channel || 'Loading...'} ({$searchProgress.current}/{$searchProgress.total})
      </div>
    </div>
  {/if}
  
  {#if showAdvanced}
    <div class="search-advanced">
      <div class="search-section">
        <h3>Search & Thread URL</h3>
        
        <div class="input-group">
          <label>
            Search Keywords:
            <input
              type="text"
              bind:this={searchInput}
              bind:value={$searchQuery}
              on:keydown={handleKeydown}
              placeholder="Search messages... (optional with filters)"
              disabled={$searchLoading}
              class="search-input"
            />
          </label>
        </div>

        <div class="input-group">
          <label>
            Thread URL:
            <div class="url-input-wrapper">
              <input
                type="text"
                bind:this={urlInputElement}
                bind:value={urlInput}
                placeholder="Paste a Slack thread URL to view..."
                on:keydown={handleUrlKeydown}
                disabled={urlLoading}
                class="url-input"
              />
              <button
                on:click={handleUrlPaste}
                disabled={!urlInput.trim() || urlLoading}
                class="btn-secondary"
              >
                {urlLoading ? 'Loading...' : 'Load Thread'}
              </button>
            </div>
          </label>
        </div>
      </div>

      <div class="search-section">
        <h3>Filters</h3>
        
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
            onEnterKey={handleSearch}
            on:change={(e) => {
              // Always use e.detail.channel if available (for both single and multi-select)
              if (e.detail.channel !== undefined) {
                channel = e.detail.channel;
              } else if (e.detail.channels) {
                // Fallback for multi-select mode (legacy)
                channel = e.detail.channels.join(',');
              } else {
                channel = '';
              }
              console.log('Channel changed to:', channel);
              console.log('Event detail:', e.detail);
            }}
            on:enableRealtime={() => {
              // When realtime mode is enabled, trigger an immediate search
              triggerRealtimeSearch();
            }}
          />
        </label>
        
        <label>
          User:
          <UserSelector
            bind:this={userSelectorComponent}
            bind:value={userId}
            onEnterKey={handleSearch}
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
            on:keydown={handleKeydown}
          />
        </label>
        
        <label>
          To:
          <input
            type="date"
            bind:value={toDate}
            on:keydown={handleKeydown}
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
            on:keydown={handleKeydown}
          />
        </label>
      </div>
      
        <div class="filter-actions">
          <button on:click={clearFilters} class="btn-secondary">
            Clear filters
          </button>
        </div>
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
    justify-content: space-between;
  }
  
  .btn-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }
  
  .btn-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .btn-toggle.active {
    background: var(--primary-bg);
    color: var(--primary);
    border-color: var(--primary);
  }
  
  .search-advanced {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    animation: slideDown 0.3s ease-out;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .search-section {
    margin-bottom: 1.5rem;
  }
  
  .search-section h3 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .input-group {
    margin-bottom: 1rem;
  }
  
  .input-group label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .search-input,
  .url-input {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    width: 100%;
  }
  
  .search-input:focus,
  .url-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .search-input:disabled,
  .url-input:disabled {
    opacity: 0.6;
  }
  
  .url-input-wrapper {
    display: flex;
    gap: 0.5rem;
  }
  
  .url-input {
    flex: 1;
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
  
  .filter-row input {
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
  
  .progress-bar {
    position: relative;
    width: 100%;
    height: 24px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin-top: 0.5rem;
  }
  
  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, var(--primary) 0%, var(--primary-hover) 100%);
    transition: width 0.3s ease;
    animation: shimmer 1.5s infinite;
  }
  
  @keyframes shimmer {
    0% {
      opacity: 0.8;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.8;
    }
  }
  
  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.75rem;
    color: var(--text-primary);
    font-weight: 500;
    z-index: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
</style>