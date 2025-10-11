<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { bookmarkStore, favoriteBookmarks, recentBookmarks } from '../stores/bookmarks';
  import { showToast } from '../stores/toast';
  import { get } from 'svelte/store';
  import type { MessageBookmark } from '../types/slack';

  const dispatch = createEventDispatcher();

  export let triggerElement: HTMLElement | null = null;

  let searchInput = '';
  let showDropdown = false;
  let highlightedIndex = 0; // Start with first item highlighted
  let dropdownElement: HTMLDivElement;
  let editingBookmarkId: string | null = null;
  let editingAlias = '';

  // Filter bookmarks based on search input
  $: filteredBookmarks = searchInput
    ? $bookmarkStore.filter(b =>
        (b.alias && b.alias.toLowerCase().includes(searchInput.toLowerCase())) ||
        b.summary.toLowerCase().includes(searchInput.toLowerCase()) ||
        b.channelName.toLowerCase().includes(searchInput.toLowerCase())
      )
    : $bookmarkStore;

  // Group bookmarks for display
  $: groupedBookmarks = {
    favorites: filteredBookmarks.filter(b => b.isFavorite),
    recent: $recentBookmarks.filter(b =>
      !b.isFavorite && filteredBookmarks.some(fb => fb.id === b.id)
    ).slice(0, 5),
    all: filteredBookmarks.filter(b =>
      !b.isFavorite && !$recentBookmarks.some(rb => rb.id === b.id)
    )
  };

  // Create flat array for index mapping
  $: flatBookmarkList = [
    ...groupedBookmarks.favorites,
    ...groupedBookmarks.recent,
    ...groupedBookmarks.all
  ];

  onMount(() => {
    showDropdown = true;
    // Set initial highlight to first item if there are items
    if (flatBookmarkList.length > 0) {
      highlightedIndex = 0;
    }

    // Focus handling
    setTimeout(() => {
      if (dropdownElement) {
        dropdownElement.focus();
      }
    }, 10);

    // Global keyboard handler
    function handleGlobalKeydown(event: KeyboardEvent) {
      // Don't handle anything if we're editing an alias
      if (editingBookmarkId) {
        return;
      }

      // Only handle if dropdown is visible
      if (showDropdown &&
          (event.target && (dropdownElement?.contains(event.target as Node)))) {
        handleInputKeydown(event);
      }
    }

    // Close dropdown on outside click
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownElement && !dropdownElement.contains(target) &&
          (!triggerElement || !triggerElement.contains(target))) {
        close();
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown, true);
    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('click', handleClickOutside);
    };
  });

  function handleInputKeydown(event: KeyboardEvent) {
    // If we're editing an alias, don't handle any navigation keys
    if (editingBookmarkId) {
      return;
    }

    const totalItems = flatBookmarkList.length;

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
        // Don't handle Space key if a button is focused
        if (event.key === ' ' && document.activeElement?.tagName === 'BUTTON') {
          return;
        }
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          const bookmark = flatBookmarkList[highlightedIndex];
          if (bookmark) {
            selectBookmark(bookmark);
          }
        }
        break;

      case 'e':
      case 'E':
        // Edit alias for highlighted bookmark
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          event.preventDefault();
          event.stopPropagation();
          const bookmark = flatBookmarkList[highlightedIndex];
          if (bookmark) {
            startEditingAlias(bookmark.id, bookmark.alias || '');
          }
        }
        break;

      case 'f':
      case 'F':
        // Toggle favorite for highlighted bookmark
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          event.preventDefault();
          event.stopPropagation();
          const bookmark = flatBookmarkList[highlightedIndex];
          if (bookmark) {
            toggleFavorite(bookmark.id, event as any);
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
    }
  }

  function scrollToHighlighted() {
    if (highlightedIndex < 0) return;

    const items = dropdownElement?.querySelectorAll('.bookmark-item');
    if (items && items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function selectBookmark(bookmark: MessageBookmark) {
    // Increment usage count
    bookmarkStore.useBookmark(bookmark.id);

    // Emit event with message details to jump to the message
    dispatch('select', {
      messageTs: bookmark.messageTs,
      channelId: bookmark.channelId
    });

    // Close the dropdown
    close();
  }

  function toggleFavorite(bookmarkId: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    bookmarkStore.toggleFavorite(bookmarkId);

    const bookmark = $bookmarkStore.find(b => b.id === bookmarkId);
    if (bookmark) {
      const message = bookmark.isFavorite
        ? `⭐ Added to favorites`
        : `☆ Removed from favorites`;
      showToast(message, 'success');
    }
  }

  function clearBookmarks() {
    if (confirm('Clear all bookmarks? This cannot be undone.')) {
      bookmarkStore.clearAll();
      showToast('Bookmarks cleared', 'success');
    }
  }

  function deleteBookmark(bookmarkId: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    bookmarkStore.deleteBookmark(bookmarkId);
    showToast('Bookmark removed', 'success');
  }

  function close() {
    showDropdown = false;
    editingBookmarkId = null;
    editingAlias = '';
    dispatch('close');
  }

  function startEditingAlias(bookmarkId: string, currentAlias: string = '') {
    editingBookmarkId = bookmarkId;
    editingAlias = currentAlias;
  }

  async function saveAlias() {
    if (editingBookmarkId) {
      await bookmarkStore.updateAlias(editingBookmarkId, editingAlias);
      editingBookmarkId = null;
      editingAlias = '';
      // Refocus the dropdown after saving
      setTimeout(() => {
        dropdownElement?.focus();
      }, 10);
    }
  }

  function cancelEditingAlias() {
    editingBookmarkId = null;
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
    // Allow normal text input
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

  function getBookmarkDisplay(bookmark: MessageBookmark): string {
    // If alias exists, use it
    if (bookmark.alias) {
      return bookmark.alias;
    }

    // Use channel name and summary
    return `#${bookmark.channelName}: ${bookmark.summary}`;
  }
</script>

<div class="bookmark-manager-wrapper">
  {#if showDropdown}
    <div bind:this={dropdownElement}
         class="bookmark-dropdown"
         tabindex="0"
         on:keydown|stopPropagation={handleInputKeydown}>
      {#if flatBookmarkList.length > 0}
        <div class="dropdown-help">
          <span class="help-text">↑↓ Navigate • Enter/Space Select • e Edit Alias (Ctrl+Enter to save) • f Toggle Favorite</span>
        </div>
      {/if}

      {#if groupedBookmarks.favorites.length > 0}
        <div class="bookmark-group">
          <div class="group-header">⭐ FAVORITES</div>
          {#each groupedBookmarks.favorites as bookmark, index}
            <div
              class="bookmark-item"
              class:highlighted={highlightedIndex === index}
              on:click={() => selectBookmark(bookmark)}
            >
              <div class="bookmark-info">
                {#if editingBookmarkId === bookmark.id}
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
                  <span class="bookmark-name">{getBookmarkDisplay(bookmark)}</span>
                  <span class="bookmark-channel">#{bookmark.channelName}</span>
                {/if}
              </div>
              <span class="bookmark-meta">{formatDate(bookmark.lastUsed || bookmark.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(bookmark.id, bookmark.alias || '');
                }}
                class="edit-btn"
                title="Edit alias (e)"
                style="opacity: 0.3;"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(bookmark.id, e)}
                class="favorite-btn active"
                title="Remove from favorites"
              >
                ⭐
              </button>
              <button
                on:click={(e) => deleteBookmark(bookmark.id, e)}
                class="delete-btn"
                title="Delete bookmark"
              >
                🗑️
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if groupedBookmarks.recent.length > 0}
        <div class="bookmark-group">
          <div class="group-header">🕐 RECENT</div>
          {#each groupedBookmarks.recent as bookmark, index}
            {@const actualIndex = groupedBookmarks.favorites.length + index}
            <div
              class="bookmark-item"
              class:highlighted={highlightedIndex === actualIndex}
              on:click={() => selectBookmark(bookmark)}
            >
              <div class="bookmark-info">
                {#if editingBookmarkId === bookmark.id}
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
                  <span class="bookmark-name">{getBookmarkDisplay(bookmark)}</span>
                  <span class="bookmark-channel">#{bookmark.channelName}</span>
                {/if}
              </div>
              <span class="bookmark-meta">{formatDate(bookmark.lastUsed || bookmark.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(bookmark.id, bookmark.alias || '');
                }}
                class="edit-btn"
                title="Edit alias (e)"
                style="opacity: 0.3;"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(bookmark.id, e)}
                class="favorite-btn"
                title="Add to favorites"
              >
                ☆
              </button>
              <button
                on:click={(e) => deleteBookmark(bookmark.id, e)}
                class="delete-btn"
                title="Delete bookmark"
              >
                🗑️
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if groupedBookmarks.all.length > 0}
        <div class="bookmark-group">
          <div class="group-header">📁 ALL BOOKMARKS</div>
          {#each groupedBookmarks.all as bookmark, index}
            {@const actualIndex = groupedBookmarks.favorites.length + groupedBookmarks.recent.length + index}
            <div
              class="bookmark-item"
              class:highlighted={highlightedIndex === actualIndex}
              on:click={() => selectBookmark(bookmark)}
            >
              <div class="bookmark-info">
                {#if editingBookmarkId === bookmark.id}
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
                  <span class="bookmark-name">{getBookmarkDisplay(bookmark)}</span>
                  <span class="bookmark-channel">#{bookmark.channelName}</span>
                {/if}
              </div>
              <span class="bookmark-meta">{formatDate(bookmark.lastUsed || bookmark.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(bookmark.id, bookmark.alias || '');
                }}
                class="edit-btn"
                title="Edit alias (e)"
                style="opacity: 0.3;"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(bookmark.id, e)}
                class="favorite-btn"
                title="Add to favorites"
              >
                ☆
              </button>
              <button
                on:click={(e) => deleteBookmark(bookmark.id, e)}
                class="delete-btn"
                title="Delete bookmark"
              >
                🗑️
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if flatBookmarkList.length === 0}
        <div class="empty-state">
          No bookmarks yet. Press "B" to bookmark a message.
        </div>
      {/if}

      {#if flatBookmarkList.length > 0}
        <div class="dropdown-footer">
          <button
            on:click={clearBookmarks}
            on:keydown|stopPropagation={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clearBookmarks();
              }
            }}
            class="clear-all-btn"
            title="Clear all bookmarks"
            tabindex="0"
          >
            Clear All
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bookmark-manager-wrapper {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    z-index: 1000;
  }

  .bookmark-dropdown {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .bookmark-dropdown:focus {
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

  .bookmark-group {
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

  .bookmark-item {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
    position: relative;
  }

  .bookmark-item:hover {
    background: var(--bg-hover);
  }

  .bookmark-item:hover .favorite-btn,
  .bookmark-item:hover .edit-btn,
  .bookmark-item:hover .delete-btn {
    opacity: 0.8;
  }

  .bookmark-item.highlighted {
    background: var(--primary-bg);
  }

  .bookmark-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .bookmark-name {
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .bookmark-channel {
    color: var(--text-secondary);
    font-size: 0.75rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bookmark-meta {
    margin-left: auto;
    margin-right: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .favorite-btn,
  .edit-btn,
  .delete-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s;
    opacity: 0.7;
    border-radius: 4px;
    min-width: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .favorite-btn:hover,
  .edit-btn:hover,
  .delete-btn:hover {
    opacity: 1;
    background: var(--bg-hover, #f5f5f5);
  }

  .delete-btn:hover {
    color: var(--danger, #e74c3c);
    background: rgba(231, 76, 60, 0.1);
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

  .dropdown-footer {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    background: var(--bg-secondary, #f8f9fa);
  }

  .clear-all-btn {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    transition: color 0.2s;
    font-weight: 500;
  }

  .clear-all-btn:hover {
    color: var(--danger, #e74c3c);
    text-decoration: underline;
  }
</style>
