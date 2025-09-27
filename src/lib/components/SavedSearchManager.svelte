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
  import { confirm, confirmationStore } from '../stores/confirmation';
  import { get } from 'svelte/store';
  import { cleanupDuplicateSavedSearches } from '../utils/cleanupSavedSearches';
  import { savedSearchOpen } from '../stores/savedSearchOpen';

  const dispatch = createEventDispatcher();

  export let isOpen = false;
  export let position = { top: 0, left: 0 };
  
  let activeTab: 'all' | 'recent' | 'favorites' | 'frequent' = 'recent';
  let searchFilter = '';
  let editingId: string | null = null;
  let editingName = '';
  let hoveredId: string | null = null;
  let selectedIndex = -1;
  let dropdownElement: HTMLDivElement;
  let searchFilterInput: HTMLInputElement;
  let closeButton: HTMLButtonElement;

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
      // Handle both Date objects and string formats
      fromDate: currentParams.fromDate ? (currentParams.fromDate instanceof Date ? currentParams.fromDate.toISOString().split('T')[0] : currentParams.fromDate) : undefined,
      toDate: currentParams.toDate ? (currentParams.toDate instanceof Date ? currentParams.toDate.toISOString().split('T')[0] : currentParams.toDate) : undefined
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
      userName: currentParams.userName,  // Save the display name if available
      // Handle both Date objects and string formats
      fromDate: currentParams.fromDate ? (currentParams.fromDate instanceof Date ? currentParams.fromDate.toISOString().split('T')[0] : currentParams.fromDate) : undefined,
      toDate: currentParams.toDate ? (currentParams.toDate instanceof Date ? currentParams.toDate.toISOString().split('T')[0] : currentParams.toDate) : undefined,
      limit: currentParams.limit
    });

    showToast(`Saved search: ${name}`, 'success');
  }

  function startEditing(searchId: string, currentName: string = '') {
    editingId = searchId;
    editingName = currentName;
  }

  async function saveEdit() {
    if (editingId && editingName.trim()) {
      await savedSearchesStore.updateSearch(editingId, { name: editingName.trim() });
      editingId = null;
      editingName = '';
      // Refocus the dropdown after saving
      setTimeout(() => {
        dropdownElement?.focus();
      }, 10);
    }
  }

  function cancelEdit() {
    editingId = null;
    editingName = '';
    // Refocus the dropdown after canceling
    setTimeout(() => {
      dropdownElement?.focus();
    }, 10);
  }

  function handleEditKeydown(event: KeyboardEvent) {
    // Stop all propagation immediately
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      saveEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
    // Allow normal text input including j, k, etc.
    // Only block navigation keys
    else if (['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
      event.preventDefault();
    }
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

  async function runCleanup() {
    const confirmed = await confirm({
      title: 'Fix Duplicate Searches',
      message: 'This will clean up duplicate saved searches that may have been created across workspaces. Continue?',
      confirmText: 'Fix Duplicates',
      cancelText: 'Cancel',
      dangerous: false
    });

    if (confirmed) {
      try {
        await cleanupDuplicateSavedSearches();
        // Re-initialize after cleanup
        await savedSearchesStore.initialize();
        showToast('Duplicate searches cleaned up successfully', 'success');
      } catch (error) {
        console.error('[SavedSearchManager] Cleanup failed:', error);
        showToast('Failed to clean up duplicate searches', 'error');
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    // Don't handle anything if we're editing
    if (editingId) {
      return;
    }

    // Don't handle keyboard events if confirmation dialog is open
    const confirmState = get(confirmationStore);
    if (confirmState.isOpen) return;

    // Check if the dropdown contains the event target - ensures we only handle events from within the dropdown
    if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
      return;
    }

    // Handle navigation keys
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
      case 'J':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        selectedIndex = Math.min(selectedIndex + 1, filteredSearches.length - 1);
        scrollToSelected();
        break;
      case 'ArrowUp':
      case 'k':
      case 'K':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollToSelected();
        break;
      case 'Enter':
      case ' ':
        // Check if the active element is a button or has explicit keyboard handling - if so, let it handle the event
        const activeEl = document.activeElement;
        if (activeEl && (
          activeEl.tagName === 'BUTTON' ||
          activeEl.classList.contains('btn-icon') ||
          activeEl.classList.contains('btn-link') ||
          activeEl.classList.contains('btn-action') ||
          activeEl.classList.contains('tab')
        )) {
          // Don't prevent default - let the button handle the click
          return;
        }
        // Otherwise, load the selected search
        event.preventDefault();
        event.stopPropagation();
        if (selectedIndex >= 0 && selectedIndex < filteredSearches.length) {
          loadSearch(filteredSearches[selectedIndex]);
        }
        break;
      case 'e':
      case 'E':
        // Edit alias for highlighted search
        if (selectedIndex >= 0 && selectedIndex < filteredSearches.length) {
          event.preventDefault();
          event.stopPropagation();
          const search = filteredSearches[selectedIndex];
          if (search) {
            startEditing(search.id, search.name);
          }
        }
        break;
      case 'f':
      case 'F':
        // Toggle favorite for highlighted search
        if (selectedIndex >= 0 && selectedIndex < filteredSearches.length) {
          event.preventDefault();
          event.stopPropagation();
          const search = filteredSearches[selectedIndex];
          if (search) {
            toggleFavorite(search.id, event);
          }
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        // Handle Ctrl+Tab and Ctrl+Shift+Tab for tab switching
        if (event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
          // Cycle through tabs
          const tabs = ['recent', 'favorites', 'frequent', 'all'];
          const currentIndex = tabs.indexOf(activeTab);
          if (event.shiftKey) {
            // Ctrl+Shift+Tab - go to previous tab
            activeTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length] as typeof activeTab;
          } else {
            // Ctrl+Tab - go to next tab
            activeTab = tabs[(currentIndex + 1) % tabs.length] as typeof activeTab;
          }
          selectedIndex = 0;
        } else {
          // Implement focus trap - prevent focus from leaving the dropdown
          const activeElement = document.activeElement;

          // Only trap Tab if focus would leave the dropdown
          if (!dropdownElement?.contains(activeElement as Node)) {
            // Focus is outside dropdown - bring it back
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
              // Shift+Tab - focus last focusable element
              const focusableElements = dropdownElement?.querySelectorAll(
                'button:not([tabindex="-1"]), input:not([tabindex="-1"]), [tabindex="0"]'
              );
              if (focusableElements && focusableElements.length > 0) {
                (focusableElements[focusableElements.length - 1] as HTMLElement).focus();
              }
            } else {
              // Tab - focus first focusable element (close button)
              closeButton?.focus();
            }
          } else {
            // Check if we're at the boundaries of the dropdown
            const focusableElements = dropdownElement?.querySelectorAll(
              'button:not([tabindex="-1"]), input:not([tabindex="-1"]), [tabindex="0"]'
            );

            if (focusableElements && focusableElements.length > 0) {
              const firstElement = focusableElements[0] as HTMLElement;
              const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

              if (event.shiftKey && activeElement === firstElement) {
                // Shift+Tab from first element - wrap to last
                event.preventDefault();
                lastElement.focus();
              } else if (!event.shiftKey && activeElement === lastElement) {
                // Tab from last element - wrap to first
                event.preventDefault();
                firstElement.focus();
              }
              // Otherwise, let normal tab behavior work within the dropdown
            }
          }
        }
        break;
    }
  }

  function scrollToSelected() {
    if (selectedIndex >= 0 && dropdownElement) {
      const items = dropdownElement.querySelectorAll('.search-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function close() {
    isOpen = false;
    selectedIndex = -1;
    searchFilter = '';
    savedSearchOpen.set(false);
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
    // Display userName if available, fallback to user or userId
    if (search.userName || search.user || search.userId) {
      const displayName = search.userName || search.user || search.userId;
      parts.push(`User: ${displayName}`);
    }
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
    // Register keyboard shortcuts
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.registerHandler('quickSaveSearch', {
        action: saveCurrentSearch,
        allowInInput: true
      });
    }

    // If already open on mount, set focus
    if (isOpen && searchFilterInput) {
      setTimeout(() => {
        searchFilterInput?.focus();
      }, 100);
    }
  });

  onDestroy(() => {
    // Clean up event listeners
    document.removeEventListener('keydown', handleKeydown, true);

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

  // Watch for isOpen changes to manage event listeners and focus
  $: {
    if (typeof window !== 'undefined') {
      if (isOpen) {
        // Update the global store to indicate the saved search is open
        savedSearchOpen.set(true);
        // Use capture phase to intercept events before they bubble
        document.addEventListener('keydown', handleKeydown, true);
        // Set focus to the dropdown after a short delay to ensure it's rendered
        setTimeout(() => {
          if (searchFilterInput) {
            searchFilterInput.focus();
          } else if (dropdownElement) {
            dropdownElement.focus();
          }
        }, 100);
      } else {
        savedSearchOpen.set(false);
        document.removeEventListener('keydown', handleKeydown, true);
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
    bind:this={dropdownElement}
    style="top: {position.top}px; left: {position.left}px;"
    transition:slide={{ duration: 200 }}
    tabindex="-1"
    on:keydown={handleKeydown}
  >
    <div class="dropdown-header">
      <h3>Saved Searches</h3>
      <button bind:this={closeButton} class="btn-close" on:click={close}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="dropdown-help">
      <span class="help-text">↑↓/j/k Navigate • Enter/Space Select • e Edit Name (Ctrl+Enter to save) • f Toggle Favorite • Ctrl+Tab/Ctrl+Shift+Tab Switch Tabs</span>
    </div>

    <div class="dropdown-actions">
      <button class="btn-action" on:click={saveCurrentSearch} tabindex="-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 5v14m-7-7h14"/>
        </svg>
        Save Current
      </button>
      
      <input
        type="text"
        placeholder="Filter searches..."
        bind:this={searchFilterInput}
        bind:value={searchFilter}
        class="search-filter"
        on:keydown={(e) => {
          // Don't propagate arrow keys from the filter input
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            handleKeydown(e);
          }
        }}
      />
    </div>

    <div class="tabs">
      <button
        class="tab {activeTab === 'recent' ? 'active' : ''}"
        on:click={() => { activeTab = 'recent'; selectedIndex = 0; }}
        tabindex="-1"
      >
        Recent
      </button>
      <button
        class="tab {activeTab === 'favorites' ? 'active' : ''}"
        on:click={() => { activeTab = 'favorites'; selectedIndex = 0; }}
        tabindex="-1"
      >
        Favorites
      </button>
      <button
        class="tab {activeTab === 'frequent' ? 'active' : ''}"
        on:click={() => { activeTab = 'frequent'; selectedIndex = 0; }}
        tabindex="-1"
      >
        Frequent
      </button>
      <button
        class="tab {activeTab === 'all' ? 'active' : ''}"
        on:click={() => { activeTab = 'all'; selectedIndex = 0; }}
        tabindex="-1"
      >
        All ({$savedSearchesStore.length})
      </button>
    </div>

    <div class="search-list" tabindex="0" on:focus={() => { if (selectedIndex < 0 && filteredSearches.length > 0) selectedIndex = 0; }} on:keydown={handleKeydown}>
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
                  on:keydown={handleEditKeydown}
                  on:blur={saveEdit}
                  on:click|stopPropagation
                  class="edit-input"
                  placeholder="Enter name... (Ctrl+Enter to save)"
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
                on:keydown|stopPropagation={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleFavorite(search.id, e);
                  }
                }}
                title="Toggle favorite"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={search.isFavorite ? 'currentColor' : 'none'} stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>

              <button
                class="btn-icon"
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditing(search.id, search.name);
                }}
                on:keydown|stopPropagation={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startEditing(search.id, search.name);
                  }
                }}
                title="Edit name (e)"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>

              <button
                class="btn-icon delete"
                on:click|stopPropagation|preventDefault={(e) => deleteSearch(search.id, e)}
                on:keydown|stopPropagation={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    deleteSearch(search.id, e);
                  }
                }}
                title="Delete"
                tabindex="0"
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
        <button
          class="btn-link"
          on:click={clearAllSearches}
          on:keydown|stopPropagation={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              clearAllSearches();
            }
          }}
          tabindex="0"
        >
          Clear all searches
        </button>
        <button
          class="btn-link"
          on:click={runCleanup}
          on:keydown|stopPropagation={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              runCleanup();
            }
          }}
          title="Fix duplicate searches across workspaces"
          tabindex="0"
        >
          Fix Duplicates
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
    outline: none;
  }

  .saved-search-dropdown:focus {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
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

  .dropdown-help {
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: center;
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    letter-spacing: 0.025em;
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
    outline: none;
  }

  .search-list:focus {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
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

  .edit-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
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