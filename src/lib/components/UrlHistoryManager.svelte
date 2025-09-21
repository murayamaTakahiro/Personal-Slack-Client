<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { urlHistoryStore, favoriteUrls, recentUrls } from '../stores/urlHistory';
  import { showToast } from '../stores/toast';
  import { channelStore } from '../stores/channels';
  import { get } from 'svelte/store';
  import type { SavedUrl } from '../stores/urlHistory';

  const dispatch = createEventDispatcher();

  export let onSelect: ((url: string) => void) | null = null;
  export let onClose: (() => void) | null = null;
  export let triggerElement: HTMLElement | null = null;
  export let onLoadUrl: (() => void) | null = null;
  export let hideSearchInput: boolean = false;

  let searchInput = '';
  let showDropdown = false;
  let highlightedIndex = 0; // Start with first item highlighted
  let inputElement: HTMLInputElement;
  let dropdownElement: HTMLDivElement;
  let editingUrlId: string | null = null;
  let editingAlias = '';

  // Filter URLs based on search input
  $: filteredUrls = searchInput
    ? $urlHistoryStore.filter(u =>
        u.url.toLowerCase().includes(searchInput.toLowerCase()) ||
        (u.title && u.title.toLowerCase().includes(searchInput.toLowerCase()))
      )
    : $urlHistoryStore;

  // Group URLs for display
  $: groupedUrls = {
    favorites: filteredUrls.filter(u => u.isFavorite),
    recent: $recentUrls.filter(u =>
      !u.isFavorite && filteredUrls.some(fu => fu.id === u.id)
    ).slice(0, 5),
    all: filteredUrls.filter(u =>
      !u.isFavorite && !$recentUrls.some(ru => ru.id === u.id)
    )
  };

  // Create flat array for index mapping
  $: flatUrlList = [
    ...groupedUrls.favorites,
    ...groupedUrls.recent,
    ...groupedUrls.all
  ];

  onMount(() => {
    showDropdown = true;
    // Set initial highlight to first item if there are items
    if (flatUrlList.length > 0) {
      highlightedIndex = 0;
    }

    // Focus handling
    setTimeout(() => {
      if (hideSearchInput && dropdownElement) {
        dropdownElement.focus();
      } else if (!hideSearchInput && inputElement) {
        inputElement.focus();
      }
    }, 10);

    // Global keyboard handler that always works
    function handleGlobalKeydown(event: KeyboardEvent) {
      // Don't handle anything if we're editing an alias
      if (editingUrlId) {
        return;
      }

      // Only handle if dropdown is visible and either:
      // - We're hiding search input (dropdown mode)
      // - The target is within our component
      if (showDropdown &&
          (hideSearchInput ||
           (event.target && (dropdownElement?.contains(event.target as Node) ||
                           inputElement?.contains(event.target as Node))))) {
        handleInputKeydown(event);
      }
    }

    // Close dropdown on outside click
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownElement && !dropdownElement.contains(target) &&
          (!inputElement || !inputElement.contains(target)) &&
          (!triggerElement || !triggerElement.contains(target))) {
        close();
      }
    }

    // Always add the global keydown listener
    document.addEventListener('keydown', handleGlobalKeydown, true);
    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('click', handleClickOutside);
    };
  });

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchInput = target.value;
    highlightedIndex = -1;
  }

  function handleInputKeydown(event: KeyboardEvent) {
    // If we're editing an alias, don't handle any navigation keys
    if (editingUrlId) {
      return;
    }

    const totalItems = flatUrlList.length;

    switch (event.key) {
      case 'ArrowDown':
      case 'j':
      case 'J':
        event.preventDefault();
        event.stopPropagation();
        highlightedIndex = (highlightedIndex + 1) % totalItems;
        scrollToHighlighted();
        break;

      case 'ArrowUp':
      case 'k':
      case 'K':
        event.preventDefault();
        event.stopPropagation();
        highlightedIndex = highlightedIndex <= 0 ? totalItems - 1 : highlightedIndex - 1;
        scrollToHighlighted();
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          const url = flatUrlList[highlightedIndex];
          if (url) {
            selectUrl(url);
          }
        }
        break;

      case 'e':
      case 'E':
        // Edit alias for highlighted URL
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          event.preventDefault();
          event.stopPropagation(); // Prevent global 'e' key handler
          const url = flatUrlList[highlightedIndex];
          if (url) {
            startEditingAlias(url.id, url.alias || '');
          }
        }
        break;

      case 'f':
      case 'F':
        // Toggle favorite for highlighted URL
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          event.preventDefault();
          event.stopPropagation();
          const url = flatUrlList[highlightedIndex];
          if (url) {
            toggleFavorite(url.id, event as any);
          }
        }
        break;

      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        // Return focus to trigger element
        if (triggerElement) {
          setTimeout(() => {
            (triggerElement as HTMLElement).focus();
          }, 10);
        }
        break;

      case 'Tab':
        // Don't prevent default - let browser handle tab navigation naturally
        // Just close the dropdown
        close();
        break;
    }
  }

  function scrollToHighlighted() {
    if (highlightedIndex < 0) return;

    const items = dropdownElement?.querySelectorAll('.url-item');
    if (items && items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function selectUrl(url: SavedUrl) {
    // Increment usage count
    urlHistoryStore.useUrl(url.id);

    // Call the select handler
    if (onSelect) {
      onSelect(url.url);
    }

    // Emit event
    dispatch('select', { url: url.url });

    // Close the dropdown
    close();
  }

  function toggleFavorite(urlId: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    urlHistoryStore.toggleFavorite(urlId);

    const url = $urlHistoryStore.find(u => u.id === urlId);
    if (url) {
      const message = url.isFavorite
        ? `⭐ Added to favorites`
        : `☆ Removed from favorites`;
      showToast(message, 'success');
    }
  }

  function clearHistory() {
    if (confirm('Clear all URL history? This cannot be undone.')) {
      urlHistoryStore.clearAll();
      showToast('URL history cleared', 'success');
    }
  }

  function close() {
    showDropdown = false;
    editingUrlId = null;
    editingAlias = '';
    if (onClose) {
      onClose();
    }
    dispatch('close');
  }

  function startEditingAlias(urlId: string, currentAlias: string = '') {
    editingUrlId = urlId;
    editingAlias = currentAlias;
  }

  async function saveAlias() {
    if (editingUrlId) {
      await urlHistoryStore.updateAlias(editingUrlId, editingAlias);
      editingUrlId = null;
      editingAlias = '';
      // Refocus the dropdown after saving
      setTimeout(() => {
        dropdownElement?.focus();
      }, 10);
    }
  }

  function cancelEditingAlias() {
    editingUrlId = null;
    editingAlias = '';
  }

  function handleAliasKeydown(event: KeyboardEvent) {
    // Stop all propagation immediately
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      saveAlias();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditingAlias();
      // Refocus the dropdown after canceling
      setTimeout(() => {
        dropdownElement?.focus();
      }, 10);
    }
    // Allow normal text input including j, k, etc.
    // Only block navigation keys
    else if (['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
      event.preventDefault();
    }
  }

  function formatDate(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (days === 0) {
      if (hours === 0) return 'just now';
      if (hours === 1) return '1h ago';
      return `${hours}h ago`;
    }
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  function getUrlDisplay(url: SavedUrl): string {
    // Show full URL with title if available
    if (url.title && url.title !== url.url) {
      return `${url.title} - ${url.url}`;
    }
    return url.url;
  }

  function getChannelName(channelId: string): string {
    // Get channel name from channel store
    const store = get(channelStore);
    const channel = store.allChannels.find(ch => ch.id === channelId);
    return channel ? channel.name : channelId;
  }

  function getUrlShortDisplay(url: SavedUrl): string {
    // If alias exists, use it
    if (url.alias) {
      return url.alias;
    }

    // Extract meaningful parts from URL for compact display
    const match = url.url.match(/https:\/\/([^.]+)\.slack\.com\/archives\/([^\/]+)(?:\/p(\d+))?/);
    if (match) {
      const workspace = match[1];
      const channelId = match[2];
      const timestamp = match[3];
      const channelName = getChannelName(channelId);

      if (timestamp) {
        // Convert timestamp to readable date
        const date = new Date(parseInt(timestamp) / 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${workspace}/#${channelName} - ${dateStr}`;
      }
      return `${workspace}/#${channelName}`;
    }
    return url.title || 'Thread URL';
  }
</script>

<div class="url-history-wrapper">
  {#if !hideSearchInput}
    <div class="url-header">
      <div class="input-wrapper">
        <input
          bind:this={inputElement}
          value={searchInput}
          on:input={handleInput}
          on:keydown={handleInputKeydown}
          placeholder="Search or select a URL"
          class="url-input"
          autocomplete="off"
        />
        {#if searchInput}
          <button
            on:click={() => { searchInput = ''; highlightedIndex = -1; }}
            class="clear-btn"
            title="Clear search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>

      <div class="header-controls">
        <button
          on:click={() => {
            groupedUrls.favorites.forEach(url => {
              urlHistoryStore.toggleFavorite(url.id);
            });
          }}
          class="control-btn"
          title="Toggle all favorites"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        </button>

        <button
          on:click={clearHistory}
          class="control-btn"
          title="Clear all history"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>
  {/if}

  {#if showDropdown}
    <div bind:this={dropdownElement}
         class="url-dropdown"
         tabindex="0"
         on:keydown|stopPropagation={handleInputKeydown}>
      {#if flatUrlList.length > 0}
        <div class="dropdown-help">
          <span class="help-text">↑↓ Navigate • Enter/Space Select • e Edit Alias (Ctrl+Enter to save) • f Toggle Favorite</span>
        </div>
      {/if}

      {#if groupedUrls.favorites.length > 0}
        <div class="url-group">
          <div class="group-header">⭐ FAVORITES</div>
          {#each groupedUrls.favorites as url, index}
            <div
              class="url-item"
              class:highlighted={highlightedIndex === index}
              on:click={() => selectUrl(url)}
            >
              <div class="url-info">
                {#if editingUrlId === url.id}
                  <input
                    type="text"
                    bind:value={editingAlias}
                    on:keydown={handleAliasKeydown}
                    on:blur={saveAlias}
                    on:click|stopPropagation
                    class="alias-input"
                    placeholder="Enter alias... (Ctrl+Enter to save)"
                    autofocus
                  />
                {:else}
                  <span class="url-name">{getUrlShortDisplay(url)}</span>
                  <span class="url-full" title={url.url}>{url.url}</span>
                {/if}
              </div>
              <span class="url-meta">{formatDate(url.lastUsed || url.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(url.id, url.alias || '');
                }}
                class="edit-btn"
                title="Edit alias (e)"
                tabindex="-1"
                style="opacity: 0.3;"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(url.id, e)}
                class="favorite-btn active"
                title="Remove from favorites"
                tabindex="-1"
              >
                ⭐
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if groupedUrls.recent.length > 0}
        <div class="url-group">
          <div class="group-header">🕐 RECENT</div>
          {#each groupedUrls.recent as url, index}
            {@const actualIndex = groupedUrls.favorites.length + index}
            <div
              class="url-item"
              class:highlighted={highlightedIndex === actualIndex}
              on:click={() => selectUrl(url)}
            >
              <div class="url-info">
                {#if editingUrlId === url.id}
                  <input
                    type="text"
                    bind:value={editingAlias}
                    on:keydown={handleAliasKeydown}
                    on:blur={saveAlias}
                    on:click|stopPropagation
                    class="alias-input"
                    placeholder="Enter alias... (Ctrl+Enter to save)"
                    autofocus
                  />
                {:else}
                  <span class="url-name">{getUrlShortDisplay(url)}</span>
                  <span class="url-full" title={url.url}>{url.url}</span>
                {/if}
              </div>
              <span class="url-meta">{formatDate(url.lastUsed || url.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(url.id, url.alias || '');
                }}
                class="edit-btn"
                title="Edit alias (e)"
                tabindex="-1"
                style="opacity: 0.3;"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(url.id, e)}
                class="favorite-btn"
                title="Add to favorites"
                tabindex="-1"
              >
                ☆
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if groupedUrls.all.length > 0}
        <div class="url-group">
          <div class="group-header">📁 ALL URLS</div>
          {#each groupedUrls.all as url, index}
            {@const actualIndex = groupedUrls.favorites.length + groupedUrls.recent.length + index}
            <div
              class="url-item"
              class:highlighted={highlightedIndex === actualIndex}
              on:click={() => selectUrl(url)}
            >
              <div class="url-info">
                {#if editingUrlId === url.id}
                  <input
                    type="text"
                    bind:value={editingAlias}
                    on:keydown={handleAliasKeydown}
                    on:blur={saveAlias}
                    on:click|stopPropagation
                    class="alias-input"
                    placeholder="Enter alias... (Ctrl+Enter to save)"
                    autofocus
                  />
                {:else}
                  <span class="url-name">{getUrlShortDisplay(url)}</span>
                  <span class="url-full" title={url.url}>{url.url}</span>
                {/if}
              </div>
              <span class="url-meta">{formatDate(url.lastUsed || url.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(url.id, url.alias || '');
                }}
                class="edit-btn"
                title="Edit alias (e)"
                tabindex="-1"
                style="opacity: 0.3;"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(url.id, e)}
                class="favorite-btn"
                title="Add to favorites"
                tabindex="-1"
              >
                ☆
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if flatUrlList.length === 0}
        <div class="empty-state">
          {#if searchInput}
            No URLs match "{searchInput}"
          {:else}
            No URL history yet
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .url-history-wrapper {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    z-index: 1000;
  }

  .url-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .input-wrapper {
    flex: 1;
    position: relative;
  }

  .url-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .url-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .clear-btn {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn:hover {
    color: var(--text-primary);
  }

  .header-controls {
    display: flex;
    gap: 0.25rem;
  }

  .control-btn {
    padding: 0.5rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .control-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .url-dropdown {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .url-dropdown:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .dropdown-help {
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .url-group {
    padding: 0.5rem 0;
  }

  .group-header {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .url-item {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
    position: relative;
  }

  .url-item:hover {
    background: var(--bg-hover);
  }

  .url-item.highlighted {
    background: var(--primary-bg);
  }

  .url-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .url-name {
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .url-full {
    color: var(--text-secondary);
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .url-meta {
    margin-left: auto;
    margin-right: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .favorite-btn,
  .edit-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    transition: opacity 0.2s;
    opacity: 0.5;
  }

  .favorite-btn:hover,
  .edit-btn:hover {
    opacity: 1;
  }

  .favorite-btn.active {
    opacity: 1;
    color: gold;
  }

  .alias-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--primary);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .alias-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>