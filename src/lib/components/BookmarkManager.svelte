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

      case 'Tab':
        // Implement focus trap within the dropdown
        event.preventDefault();
        event.stopPropagation();

        const focusableElements = dropdownElement?.querySelectorAll(
          'button:not([tabindex="-1"]):not(:disabled), input:not([tabindex="-1"]):not(:disabled), [tabindex="0"]'
        );

        if (!focusableElements || focusableElements.length === 0) {
          break;
        }

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        const activeElement = document.activeElement as HTMLElement;

        if (event.shiftKey) {
          // Shift+Tab - move backwards
          if (activeElement === firstElement || !dropdownElement?.contains(activeElement)) {
            lastElement.focus();
          } else {
            // Find the previous focusable element
            const currentIndex = Array.from(focusableElements).indexOf(activeElement);
            if (currentIndex > 0) {
              (focusableElements[currentIndex - 1] as HTMLElement).focus();
            }
          }
        } else {
          // Tab - move forwards
          if (activeElement === lastElement || !dropdownElement?.contains(activeElement)) {
            firstElement.focus();
          } else {
            // Find the next focusable element
            const currentIndex = Array.from(focusableElements).indexOf(activeElement);
            if (currentIndex < focusableElements.length - 1) {
              (focusableElements[currentIndex + 1] as HTMLElement).focus();
            }
          }
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
      channelId: bookmark.channelId,
      channelName: bookmark.channelName,  // 追加: チャンネル名
      timestamp: bookmark.timestamp        // 追加: タイムスタンプ
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

    if (event.key === 'Enter') {
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

  function getBookmarkDisplay(bookmark: MessageBookmark): { summary: string; channel: string } {
    // Always show the original message summary
    const summary = bookmark.summary;

    // Show alias in channel section if it exists
    const channel = bookmark.alias
      ? `#${bookmark.channelName} · ${bookmark.alias}`
      : `#${bookmark.channelName}`;

    return { summary, channel };
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
          <span class="help-text">↑↓ Navigate • Enter/Space Select • e Edit Alias (Enter to save) • f Toggle Favorite</span>
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
                    placeholder="Enter alias... (Enter to save)"
                    autofocus
                  />
                {:else}
                  {@const display = getBookmarkDisplay(bookmark)}
                  <span class="bookmark-name">{display.summary}</span>
                  <span class="bookmark-channel">{display.channel}</span>
                {/if}
              </div>
              <span class="bookmark-meta">{formatDate(bookmark.lastUsed || bookmark.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(bookmark.id, bookmark.alias || '');
                }}
                class="btn-icon"
                title="Edit alias (e)"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                on:click={(e) => toggleFavorite(bookmark.id, e)}
                class="btn-icon active"
                title="Remove from favorites"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
              <button
                on:click={(e) => deleteBookmark(bookmark.id, e)}
                class="btn-icon delete"
                title="Delete bookmark"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if groupedBookmarks.recent.length > 0}
        <div class="bookmark-group">
          <div class="group-header">RECENT</div>
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
                    placeholder="Enter alias... (Enter to save)"
                    autofocus
                  />
                {:else}
                  {@const display = getBookmarkDisplay(bookmark)}
                  <span class="bookmark-name">{display.summary}</span>
                  <span class="bookmark-channel">{display.channel}</span>
                {/if}
              </div>
              <span class="bookmark-meta">{formatDate(bookmark.lastUsed || bookmark.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(bookmark.id, bookmark.alias || '');
                }}
                class="btn-icon"
                title="Edit alias (e)"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                on:click={(e) => toggleFavorite(bookmark.id, e)}
                class="btn-icon"
                title="Add to favorites"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
              <button
                on:click={(e) => deleteBookmark(bookmark.id, e)}
                class="btn-icon delete"
                title="Delete bookmark"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if groupedBookmarks.all.length > 0}
        <div class="bookmark-group">
          <div class="group-header">ALL BOOKMARKS</div>
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
                    placeholder="Enter alias... (Enter to save)"
                    autofocus
                  />
                {:else}
                  {@const display = getBookmarkDisplay(bookmark)}
                  <span class="bookmark-name">{display.summary}</span>
                  <span class="bookmark-channel">{display.channel}</span>
                {/if}
              </div>
              <span class="bookmark-meta">{formatDate(bookmark.lastUsed || bookmark.timestamp)}</span>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(bookmark.id, bookmark.alias || '');
                }}
                class="btn-icon"
                title="Edit alias (e)"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                on:click={(e) => toggleFavorite(bookmark.id, e)}
                class="btn-icon"
                title="Add to favorites"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
              <button
                on:click={(e) => deleteBookmark(bookmark.id, e)}
                class="btn-icon delete"
                title="Delete bookmark"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                </svg>
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
    right: 0;
    margin-top: 4px;
    z-index: 1000;
    min-width: 500px;
    max-width: 800px;
  }

  .bookmark-dropdown {
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
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
    opacity: 1;
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
