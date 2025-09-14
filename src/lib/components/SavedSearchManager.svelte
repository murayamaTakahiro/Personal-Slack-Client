<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { 
    savedSearchesStore, 
    favoriteSearches, 
    recentSearches, 
    frequentSearches,
    type SavedSearch 
  } from '../stores/savedSearches';
  import { searchQuery, searchParams } from '../stores/search';
  import { showToast } from '../stores/toast';
  import { getKeyboardService } from '../services/keyboardService';
  import { confirm } from '../stores/confirmation';

  const dispatch = createEventDispatcher();

  export let isOpen = false;
  export let position = { top: 0, left: 0 };
  
  let activeTab: 'all' | 'recent' | 'favorites' | 'frequent' = 'recent';
  let searchFilter = '';
  let editingId: string | null = null;
  let editingName = '';
  let hoveredId: string | null = null;
  let selectedIndex = -1;

  $: filteredSearches = getFilteredSearches($savedSearchesStore, activeTab, searchFilter);

  function getFilteredSearches(searches: SavedSearch[], tab: string, filter: string): SavedSearch[] {
    let result = searches;

    // Apply tab filter
    switch (tab) {
      case 'recent':
        result = $recentSearches;
        break;
      case 'favorites':
        result = $favoriteSearches;
        break;
      case 'frequent':
        result = $frequentSearches;
        break;
      case 'all':
      default:
        // Sort all by timestamp (newest first)
        result = [...searches].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    // Apply search filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(lowerFilter) ||
        s.query?.toLowerCase().includes(lowerFilter) ||
        s.channel?.toLowerCase().includes(lowerFilter) ||
        s.user?.toLowerCase().includes(lowerFilter)
      );
    }

    return result;
  }

  function loadSearch(search: SavedSearch) {
    // Update search parameters
    searchQuery.set(search.query || '');
    searchParams.set({
      query: search.query || '',
      channel: search.channel,
      user: search.userId,
      fromDate: search.fromDate ? new Date(search.fromDate) : undefined,
      toDate: search.toDate ? new Date(search.toDate) : undefined,
      limit: search.limit || 100
    });

    // Increment usage count
    savedSearchesStore.useSearch(search.id);

    // Emit event for parent component
    dispatch('load', search);

    // Show success toast
    showToast(`Loaded search: ${search.name}`, 'success');

    // Close the dropdown
    close();
  }

  function saveCurrentSearch() {
    const currentParams = $searchParams;
    const currentQuery = $searchQuery;

    if (!currentQuery && !currentParams.channel && !currentParams.user) {
      showToast('No search parameters to save', 'warning');
      return;
    }

    // Check for duplicate
    const duplicate = savedSearchesStore.isDuplicate({
      query: currentQuery,
      channel: currentParams.channel,
      userId: currentParams.user,
      fromDate: currentParams.fromDate?.toISOString().split('T')[0],
      toDate: currentParams.toDate?.toISOString().split('T')[0]
    });

    if (duplicate) {
      showToast(`This search already exists: "${duplicate.name}"`, 'info');
      savedSearchesStore.useSearch(duplicate.id);
      return;
    }

    // Prompt for name
    const name = prompt('Enter a name for this search:');
    if (!name) return;

    savedSearchesStore.saveSearch({
      name,
      query: currentQuery,
      channel: currentParams.channel,
      userId: currentParams.user,
      fromDate: currentParams.fromDate?.toISOString().split('T')[0],
      toDate: currentParams.toDate?.toISOString().split('T')[0],
      limit: currentParams.limit
    });

    showToast(`Saved search: ${name}`, 'success');
  }

  function startEditing(search: SavedSearch, event: Event) {
    event.stopPropagation();
    editingId = search.id;
    editingName = search.name;
  }

  function saveEdit() {
    if (editingId && editingName.trim()) {
      savedSearchesStore.updateSearch(editingId, { name: editingName.trim() });
      editingId = null;
      editingName = '';
    }
  }

  function cancelEdit() {
    editingId = null;
    editingName = '';
  }

  async function deleteSearch(id: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();

    const confirmed = await confirm({
      title: 'Delete Saved Search',
      message: 'Are you sure you want to delete this saved search?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true
    });

    if (confirmed) {
      try {
        // Reset hover state to prevent UI issues
        if (hoveredId === id) {
          hoveredId = null;
        }

        // Reset selection if the deleted item was selected
        const currentIndex = filteredSearches.findIndex(s => s.id === id);
        if (selectedIndex === currentIndex) {
          selectedIndex = -1;
        }

        // Perform the deletion
        await savedSearchesStore.deleteSearch(id);

        // Show success message after successful deletion
        showToast('Search deleted', 'success');

        // Adjust selected index if necessary
        if (selectedIndex > currentIndex && selectedIndex > 0) {
          selectedIndex--;
        }
      } catch (error) {
        console.error('[SavedSearchManager] Failed to delete search:', error);
        showToast('Failed to delete search', 'error');
      }
    }
  }

  async function toggleFavorite(id: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();

    try {
      await savedSearchesStore.toggleFavorite(id);
    } catch (error) {
      console.error('[SavedSearchManager] Failed to toggle favorite:', error);
      showToast('Failed to update favorite status', 'error');
    }
  }

  async function clearAllSearches() {
    const confirmed = await confirm({
      title: 'Clear All Searches',
      message: 'Are you sure you want to delete all saved searches? This action cannot be undone.',
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      dangerous: true
    });

    if (confirmed) {
      try {
        // Reset UI state before clearing
        selectedIndex = -1;
        hoveredId = null;
        editingId = null;
        editingName = '';
        searchFilter = '';

        await savedSearchesStore.clearAll();
        showToast('All saved searches cleared', 'success');
      } catch (error) {
        console.error('[SavedSearchManager] Failed to clear all searches:', error);
        showToast('Failed to clear searches', 'error');
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredSearches.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredSearches.length) {
          loadSearch(filteredSearches[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        event.preventDefault();
        // Cycle through tabs
        const tabs = ['recent', 'favorites', 'frequent', 'all'];
        const currentIndex = tabs.indexOf(activeTab);
        activeTab = tabs[(currentIndex + 1) % tabs.length] as typeof activeTab;
        selectedIndex = 0;
        break;
    }
  }

  function close() {
    isOpen = false;
    selectedIndex = -1;
    searchFilter = '';
    dispatch('close');
  }

  function formatDate(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }

  function getSearchDescription(search: SavedSearch): string {
    const parts = [];
    if (search.query) parts.push(`Query: "${search.query}"`);
    if (search.channel) parts.push(`Channel: ${search.channel}`);
    if (search.user) parts.push(`User: ${search.user}`);
    if (search.fromDate || search.toDate) {
      if (search.fromDate && search.toDate) {
        parts.push(`Date: ${search.fromDate} to ${search.toDate}`);
      } else if (search.fromDate) {
        parts.push(`From: ${search.fromDate}`);
      } else if (search.toDate) {
        parts.push(`Until: ${search.toDate}`);
      }
    }
    return parts.join(' • ');
  }

  onMount(() => {
    // Only add event listener if the component is open
    if (isOpen) {
      document.addEventListener('keydown', handleKeydown);
    }

    // Register keyboard shortcuts
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.registerHandler('quickSaveSearch', {
        action: saveCurrentSearch,
        allowInInput: true
      });
    }
  });

  onDestroy(() => {
    // Clean up event listeners
    document.removeEventListener('keydown', handleKeydown);

    // Clean up keyboard shortcuts
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.unregisterHandler('quickSaveSearch');
    }

    // Reset component state
    hoveredId = null;
    editingId = null;
    selectedIndex = -1;
  });

  // Watch for isOpen changes to manage event listeners
  $: {
    if (typeof window !== 'undefined') {
      if (isOpen) {
        document.addEventListener('keydown', handleKeydown);
      } else {
        document.removeEventListener('keydown', handleKeydown);
      }
    }
  }
</script>

{#if isOpen}
  <div 
    class="saved-search-overlay" 
    on:click={close}
    transition:fade={{ duration: 150 }}
  />
  
  <div 
    class="saved-search-dropdown"
    style="top: {position.top}px; left: {position.left}px;"
    transition:slide={{ duration: 200 }}
  >
    <div class="dropdown-header">
      <h3>Saved Searches</h3>
      <button class="btn-close" on:click={close}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="dropdown-actions">
      <button class="btn-action" on:click={saveCurrentSearch}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 5v14m-7-7h14"/>
        </svg>
        Save Current
      </button>
      
      <input
        type="text"
        placeholder="Filter searches..."
        bind:value={searchFilter}
        class="search-filter"
      />
    </div>

    <div class="tabs">
      <button 
        class="tab {activeTab === 'recent' ? 'active' : ''}"
        on:click={() => { activeTab = 'recent'; selectedIndex = 0; }}
      >
        Recent
      </button>
      <button 
        class="tab {activeTab === 'favorites' ? 'active' : ''}"
        on:click={() => { activeTab = 'favorites'; selectedIndex = 0; }}
      >
        Favorites
      </button>
      <button 
        class="tab {activeTab === 'frequent' ? 'active' : ''}"
        on:click={() => { activeTab = 'frequent'; selectedIndex = 0; }}
      >
        Frequent
      </button>
      <button 
        class="tab {activeTab === 'all' ? 'active' : ''}"
        on:click={() => { activeTab = 'all'; selectedIndex = 0; }}
      >
        All ({$savedSearchesStore.length})
      </button>
    </div>

    <div class="search-list">
      {#if filteredSearches.length === 0}
        <div class="empty-state">
          {#if searchFilter}
            No searches match "{searchFilter}"
          {:else if activeTab === 'favorites'}
            No favorite searches yet
          {:else}
            No saved searches yet
          {/if}
        </div>
      {:else}
        {#each filteredSearches as search, index (search.id)}
          <div 
            class="search-item {selectedIndex === index ? 'selected' : ''} {hoveredId === search.id ? 'hovered' : ''}"
            on:click={() => loadSearch(search)}
            on:mouseenter={() => { hoveredId = search.id; selectedIndex = index; }}
            on:mouseleave={() => hoveredId = null}
            animate:flip={{ duration: 200 }}
          >
            <div class="search-main">
              {#if editingId === search.id}
                <input
                  type="text"
                  bind:value={editingName}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  on:blur={saveEdit}
                  on:click|stopPropagation
                  class="edit-input"
                  autofocus
                />
              {:else}
                <div class="search-header">
                  <span class="search-name">{search.name}</span>
                  <div class="search-meta">
                    {#if search.usageCount > 1}
                      <span class="usage-count" title="Used {search.usageCount} times">
                        {search.usageCount}×
                      </span>
                    {/if}
                    <span class="search-date">{formatDate(search.lastUsed || search.timestamp)}</span>
                  </div>
                </div>
                <div class="search-description">
                  {getSearchDescription(search)}
                </div>
              {/if}
            </div>
            
            <div class="search-actions">
              <button
                class="btn-icon {search.isFavorite ? 'active' : ''}"
                on:click|stopPropagation|preventDefault={(e) => toggleFavorite(search.id, e)}
                title="Toggle favorite"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={search.isFavorite ? 'currentColor' : 'none'} stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
              
              {#if !editingId}
                <button 
                  class="btn-icon"
                  on:click={(e) => startEditing(search, e)}
                  title="Edit name"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              {/if}
              
              <button
                class="btn-icon delete"
                on:click|stopPropagation|preventDefault={(e) => deleteSearch(search.id, e)}
                title="Delete"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if $savedSearchesStore.length > 0}
      <div class="dropdown-footer">
        <button class="btn-link" on:click={clearAllSearches}>
          Clear all searches
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .saved-search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .saved-search-dropdown {
    position: absolute;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    width: 500px;
    max-height: 600px;
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .dropdown-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .btn-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .btn-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dropdown-actions {
    padding: 0.75rem 1rem;
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .btn-action:hover {
    background: var(--primary-hover);
  }

  .search-filter {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .search-filter:focus {
    outline: none;
    border-color: var(--primary);
  }

  .tabs {
    display: flex;
    padding: 0 1rem;
    border-bottom: 1px solid var(--border);
  }

  .tab {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }

  .search-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .search-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    margin-bottom: 0.25rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .search-item:hover,
  .search-item.hovered {
    background: var(--bg-hover);
  }

  .search-item.selected {
    background: var(--primary-bg);
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .search-main {
    flex: 1;
    min-width: 0;
  }

  .search-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .search-name {
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .usage-count {
    padding: 0.125rem 0.375rem;
    background: var(--primary-bg);
    color: var(--primary);
    border-radius: 12px;
    font-weight: 500;
  }

  .search-date {
    white-space: nowrap;
  }

  .search-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search-actions {
    display: flex;
    gap: 0.25rem;
    margin-left: 0.5rem;
  }

  .btn-icon {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-icon.active {
    color: var(--warning);
  }

  .btn-icon.delete:hover {
    background: var(--danger-bg);
    color: var(--danger);
  }

  .edit-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--primary);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .dropdown-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    text-align: center;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
    text-decoration: underline;
    transition: color 0.2s;
  }

  .btn-link:hover {
    color: var(--danger);
  }
</style>