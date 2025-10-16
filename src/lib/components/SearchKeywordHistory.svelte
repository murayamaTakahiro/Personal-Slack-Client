<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import {
    searchKeywordHistoryStore,
    favoriteKeywords,
    recentKeywords,
    frequentKeywords,
    type SearchKeyword
  } from '../stores/searchKeywordHistory';
  import { showToast } from '../stores/toast';

  const dispatch = createEventDispatcher();

  export let isOpen = false;
  export let triggerElement: HTMLElement | null = null;

  let activeTab: 'all' | 'recent' | 'favorites' | 'frequent' = 'recent';
  let searchFilter = '';
  let selectedIndex = -1;
  let dropdownElement: HTMLDivElement;
  let searchFilterInput: HTMLInputElement;
  let position: { top: number; left: number; width: number; maxHeight?: number } = { top: 0, left: 0, width: 0 };

  $: filteredKeywords = getFilteredKeywords($searchKeywordHistoryStore, activeTab, searchFilter);

  function getFilteredKeywords(keywords: SearchKeyword[], tab: string, filter: string): SearchKeyword[] {
    let result = keywords;

    // Apply tab filter
    switch (tab) {
      case 'recent':
        result = $recentKeywords;
        break;
      case 'favorites':
        result = $favoriteKeywords;
        break;
      case 'frequent':
        result = $frequentKeywords;
        break;
      case 'all':
      default:
        // Sort all by last used (newest first)
        result = [...keywords].sort((a, b) =>
          b.lastUsed.getTime() - a.lastUsed.getTime()
        );
    }

    // Apply search filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(k =>
        k.keyword.toLowerCase().includes(lowerFilter)
      );
    }

    return result;
  }

  function selectKeyword(keyword: SearchKeyword) {
    // Increment usage count
    searchKeywordHistoryStore.useKeyword(keyword.id);

    // Emit event for parent component
    dispatch('select', { keyword: keyword.keyword });

    // Close the dropdown
    close();
  }

  async function toggleFavorite(e: MouseEvent, keywordId: string) {
    e.stopPropagation();
    await searchKeywordHistoryStore.toggleFavorite(keywordId);
    const keyword = searchKeywordHistoryStore.getById(keywordId);
    if (keyword) {
      showToast(
        keyword.isFavorite ?
        `Added "${keyword.keyword}" to favorites` :
        `Removed "${keyword.keyword}" from favorites`,
        'success'
      );
    }
  }

  async function deleteKeyword(e: MouseEvent, keywordId: string, keywordText: string) {
    e.stopPropagation();
    if (confirm(`Delete "${keywordText}" from history?`)) {
      await searchKeywordHistoryStore.deleteKeyword(keywordId);
      showToast(`Deleted "${keywordText}" from history`, 'success');

      // Reset selected index
      selectedIndex = -1;
    }
  }

  function close() {
    dispatch('close');
    selectedIndex = -1;
  }

  function handleKeydown(e: KeyboardEvent) {
    const items = filteredKeywords;

    // Check if the dropdown contains the event target
    if (dropdownElement && !dropdownElement.contains(e.target as Node)) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        scrollToSelected();
        break;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollToSelected();
        break;

      case 'Enter':
        // Check if the active element is a button - if so, let it handle the event
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.classList.contains('btn-icon') || activeEl.tagName === 'BUTTON')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          selectKeyword(items[selectedIndex]);
        } else if (searchFilter) {
          // If there's a filter text and no selection, use it as new search
          dispatch('select', { keyword: searchFilter });
          close();
        }
        break;

      // Escape is handled by global handler now

      case 'Delete':
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          e.stopPropagation();
          const item = items[selectedIndex];
          deleteKeyword(e, item.id, item.keyword);
        }
        break;

      case 'Tab':
        // Handle Ctrl+Tab and Ctrl+Shift+Tab for tab switching
        if (e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          // Cycle through tabs
          const tabs = ['recent', 'favorites', 'frequent', 'all'];
          const currentIndex = tabs.indexOf(activeTab);
          if (e.shiftKey) {
            // Ctrl+Shift+Tab - go to previous tab
            activeTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length] as typeof activeTab;
          } else {
            // Ctrl+Tab - go to next tab
            activeTab = tabs[(currentIndex + 1) % tabs.length] as typeof activeTab;
          }
          selectedIndex = 0;
        } else {
          // Normal Tab behavior - let it navigate through focusable elements
          // Check if we're at the boundaries of the dropdown
          const activeElement = document.activeElement;
          const focusableElements = dropdownElement?.querySelectorAll(
            'button:not([tabindex="-1"]), input:not([tabindex="-1"]), [tabindex="0"]'
          );

          if (focusableElements && focusableElements.length > 0) {
            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            if (e.shiftKey && activeElement === firstElement) {
              // Shift+Tab from first element - wrap to last
              e.preventDefault();
              lastElement.focus();
            } else if (!e.shiftKey && activeElement === lastElement) {
              // Tab from last element - wrap to first
              e.preventDefault();
              firstElement.focus();
            }
            // Otherwise, let normal tab behavior work within the dropdown
          }
        }
        break;
    }
  }

  function scrollToSelected() {
    if (selectedIndex >= 0 && dropdownElement) {
      const items = dropdownElement.querySelectorAll('.keyword-item');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleClickOutside(e: MouseEvent) {
    if (dropdownElement && !dropdownElement.contains(e.target as Node) &&
        triggerElement && !triggerElement.contains(e.target as Node)) {
      close();
    }
  }

  function updatePosition() {
    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect();
      const dropdownWidth = 450; // Fixed width for dropdown
      const dropdownHeight = 500; // Max height of dropdown
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const spaceRight = viewportWidth - rect.left;

      let leftPosition = rect.left;

      // Check if dropdown would overflow the right edge
      if (rect.left + dropdownWidth > viewportWidth - 20) {
        // Position from the right edge of the button, aligned to the right
        leftPosition = rect.right - dropdownWidth;

        // Make sure it doesn't go off the left edge
        if (leftPosition < 20) {
          leftPosition = 20;
        }
      }

      // Vertical position calculation
      let topPosition = rect.bottom + 4;
      let maxHeight = dropdownHeight;

      // If not enough space below and more space above, show above the button
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        topPosition = rect.top - dropdownHeight - 4;
      } else if (spaceBelow < dropdownHeight) {
        // Limit height if showing below
        maxHeight = Math.min(dropdownHeight, spaceBelow - 20);
      }

      position = {
        top: topPosition,
        left: leftPosition,
        width: dropdownWidth,
        maxHeight
      };
    }
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'just now';
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    // Handle Escape key globally when dropdown is open
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  onMount(() => {
    updatePosition();
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeydown, true); // Use capture phase
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    // Focus the filter input when opening via button
    // This is appropriate since the user explicitly opened the history dropdown
    setTimeout(() => {
      if (searchFilterInput) {
        searchFilterInput.focus();
        searchFilterInput.select();
      }
    }, 50);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleGlobalKeydown, true);
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
  });
</script>

{#if isOpen}
  <div
    bind:this={dropdownElement}
    class="search-keyword-history"
    style="top: {position.top}px; left: {position.left}px; width: {position.width}px; {position.maxHeight ? `max-height: ${position.maxHeight}px;` : ''}"
    on:keydown={handleKeydown}
    transition:fade={{ duration: 200 }}
    tabindex="-1"
  >
    <div class="history-header">
      <div class="tabs">
        <button
          class="tab {activeTab === 'recent' ? 'active' : ''}"
          on:click={() => activeTab = 'recent'}
          tabindex="-1"
        >
          Recent
        </button>
        <button
          class="tab {activeTab === 'favorites' ? 'active' : ''}"
          on:click={() => activeTab = 'favorites'}
          tabindex="-1"
        >
          Favorites
          {#if $favoriteKeywords.length > 0}
            <span class="count">{$favoriteKeywords.length}</span>
          {/if}
        </button>
        <button
          class="tab {activeTab === 'frequent' ? 'active' : ''}"
          on:click={() => activeTab = 'frequent'}
          tabindex="-1"
        >
          Frequent
        </button>
        <button
          class="tab {activeTab === 'all' ? 'active' : ''}"
          on:click={() => activeTab = 'all'}
          tabindex="-1"
        >
          All
        </button>
      </div>

      <div class="search-filter">
        <input
          bind:this={searchFilterInput}
          bind:value={searchFilter}
          type="text"
          placeholder="Filter keywords..."
          class="filter-input"
          on:keydown={handleKeydown}
        />
      </div>
    </div>

    <div class="history-content">
      {#if $searchKeywordHistoryStore.length === 0}
        <div class="empty-state">
          <p>検索履歴がまだありません</p>
          <p class="hint">検索を実行すると、キーワードが自動的に保存されます</p>
        </div>
      {:else if filteredKeywords.length === 0}
        <div class="empty-state">
          {#if searchFilter}
            No keywords matching "{searchFilter}"
          {:else if activeTab === 'favorites'}
            No favorite keywords yet
          {:else}
            No keywords in this category
          {/if}
        </div>
      {:else}
        <ul class="keyword-list">
          {#each filteredKeywords as keyword, index (keyword.id)}
            <li
              class="keyword-item {selectedIndex === index ? 'selected' : ''}"
              on:click={() => selectKeyword(keyword)}
              on:mouseenter={() => { selectedIndex = index; }}
              animate:flip={{ duration: 200 }}
            >
              <div class="keyword-content">
                <span class="keyword-text">{keyword.keyword}</span>
                <div class="keyword-meta">
                  <span class="usage-count" title="Used {keyword.usageCount} time{keyword.usageCount !== 1 ? 's' : ''}">
                    {keyword.usageCount}×
                  </span>
                  <span class="last-used" title="Last used: {keyword.lastUsed.toLocaleString()}">
                    {formatDate(keyword.lastUsed)}
                  </span>
                </div>
              </div>

              <div class="keyword-actions">
                <button
                  class="btn-icon {keyword.isFavorite ? 'active' : ''}"
                  on:click={(e) => toggleFavorite(e, keyword.id)}
                  title="{keyword.isFavorite ? 'Remove from' : 'Add to'} favorites"
                  tabindex="0"
                >
                  {#if keyword.isFavorite}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  {:else}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  {/if}
                </button>
                <button
                  class="btn-icon delete"
                  on:click={(e) => deleteKeyword(e, keyword.id, keyword.keyword)}
                  title="Delete from history"
                  tabindex="0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="history-footer">
      <div class="footer-info">
        {#if filteredKeywords.length > 0}
          <span class="shortcut">↑↓ Navigate • Enter Select • Delete Remove • Ctrl+Tab Switch tabs</span>
        {:else if $searchKeywordHistoryStore.length === 0}
          <span class="shortcut">Esc Close</span>
        {:else}
          <span class="shortcut">Ctrl+Tab/Ctrl+Shift+Tab Switch tabs • Esc Close</span>
        {/if}
      </div>
      {#if $searchKeywordHistoryStore.length > 0}
        <button
          class="btn-clear"
          on:click={async () => {
            if (confirm('Clear all search keyword history?')) {
              await searchKeywordHistoryStore.clearAll();
              showToast('Search history cleared', 'success');
              close();
            }
          }}
        >
          Clear All
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .search-keyword-history {
    position: fixed;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    z-index: 1000;
    max-height: 500px;
    display: flex;
    flex-direction: column;
    min-width: 400px;
  }

  .history-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .tab {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
    position: relative;
  }

  .tab:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--primary-bg);
    color: var(--primary);
    border-color: var(--primary);
  }

  .tab .count {
    margin-left: 0.25rem;
    padding: 0 0.25rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    font-size: 0.75rem;
  }

  .search-filter {
    width: 100%;
  }

  .filter-input {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .filter-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .history-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .empty-state p {
    margin: 0 0 0.5rem 0;
  }

  .empty-state .hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    opacity: 0.8;
  }

  .keyword-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .keyword-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .keyword-item:hover,
  .keyword-item.selected {
    background: var(--bg-hover);
  }

  .keyword-content {
    flex: 1;
    min-width: 0;
  }

  .keyword-text {
    display: block;
    color: var(--text-primary);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .keyword-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .usage-count,
  .last-used {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .usage-count {
    font-weight: 600;
    color: var(--primary);
  }

  .keyword-actions {
    display: flex;
    gap: 0.25rem;
    align-items: center;
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

  .history-footer {
    padding: 0.75rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-info {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .shortcut {
    font-family: monospace;
  }

  .btn-clear {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-clear:hover {
    background: var(--error-bg);
    color: var(--error);
    border-color: var(--error);
  }
</style>