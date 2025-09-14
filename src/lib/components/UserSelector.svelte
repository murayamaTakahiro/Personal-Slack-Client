<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { userService } from '../services/userService';
  import { settings } from '../stores/settings';
  import { showToast } from '../stores/toast';
  import { userSelectionStore, selectedUserIds, isMultiSelectMode, selectedUserDisplayNames } from '../stores/userSelection';
  import type { UserFavorite, SlackUser } from '../types/slack';
  
  export let value = '';
  export let onEnterKey: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  // Subscribe to multi-select mode and selected users
  $: mode = $isMultiSelectMode ? 'multi' : 'single';
  $: selectedUsers = $selectedUserIds;
  
  let showDropdown = false;
  let searchQuery = '';
  let selectedIndex = 0;
  let userFavorites: UserFavorite[] = [];
  let searchResults: SlackUser[] = [];
  let recentUsers: SlackUser[] = [];
  let loading = false;
  let inputElement: HTMLInputElement;
  let dropdownElement: HTMLDivElement;
  let editingAlias: string | null = null;
  let aliasInput = '';
  let unsubscribeSettings: (() => void) | null = null;
  let highlightedIndex = -1;
  
  // Load favorites on mount and subscribe to settings changes
  onMount(() => {
    // Initial load
    userFavorites = userService.getUserFavorites();
    recentUsers = userService.getRecentUsers();

    // Subscribe to settings changes to update favorites
    unsubscribeSettings = settings.subscribe(currentSettings => {
      if (currentSettings.userFavorites) {
        userFavorites = currentSettings.userFavorites;
      }
      if (currentSettings.recentUsers) {
        recentUsers = currentSettings.recentUsers;
      }
    });

    // Clean up subscription on component destroy
    return () => {
      if (unsubscribeSettings) {
        unsubscribeSettings();
      }
    };
  });
  
  // Update displayed value when value prop changes
  $: displayValue = getDisplayValue(value);
  
  function getDisplayValue(userId: string): string {
    if (!userId) return '';
    
    // Check if it's a user ID
    if (/^U[A-Z0-9]+$/.test(userId)) {
      // Try to find in favorites
      const favorite = userFavorites.find(f => f.id === userId);
      if (favorite) {
        return favorite.alias || favorite.displayName || favorite.realName || favorite.name;
      }
      // Return the ID for now, will be resolved when user info is fetched
      return userId;
    }
    
    return userId;
  }
  
  async function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;

    if (!showDropdown) {
      showDropdown = true;
    }

    highlightedIndex = -1;

    const query = searchQuery.trim();

    if (query.length < 2) {
      searchResults = [];
      return;
    }

    loading = true;
    try {
      searchResults = await userService.searchUsers(query);
    } catch (error) {
      console.error('Failed to search users:', error);
      searchResults = [];
    } finally {
      loading = false;
    }
  }
  
  function selectUser(user: SlackUser | UserFavorite) {
    if (mode === 'multi') {
      userSelectionStore.toggleUserSelection(user.id, user);
      // Keep dropdown open in multi-select mode
      // Don't update searchQuery to keep it clear for further searching
    } else {
      value = user.id;
      const displayName = 'alias' in user && user.alias
        ? user.alias
        : user.displayName || user.realName || user.name;
      searchQuery = displayName;
      searchResults = [];
      showDropdown = false;
      userSelectionStore.selectUser(user.id, user);
      userService.addToRecentUsers(user.id);
      dispatch('change', {
        userId: user.id,
        userName: displayName
      });
    }
  }
  
  async function toggleFavorite(user: SlackUser | UserFavorite, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();

    const isFavorite = userService.isUserFavorite(user.id);
    if (isFavorite) {
      userService.removeUserFavorite(user.id);
      showFavoriteToggleFeedback(getUserDisplayName(user), false);
    } else {
      await userService.addUserFavorite(user.id);
      showFavoriteToggleFeedback(getUserDisplayName(user), true);
    }

    userFavorites = userService.getUserFavorites();
    recentUsers = userService.getRecentUsers();

    // Return focus to the input element after toggling favorite
    if (inputElement) {
      inputElement.focus();
    }
  }

  function getUserDisplayName(user: SlackUser | UserFavorite): string {
    return 'alias' in user && user.alias
      ? user.alias
      : user.displayName || user.realName || user.name;
  }

  function showFavoriteToggleFeedback(userName: string, isNowFavorite: boolean) {
    const message = isNowFavorite
      ? `⭐ Added ${userName} to favorites`
      : `☆ Removed ${userName} from favorites`;
    showToast(message, 'success');
  }
  
  function startEditAlias(favorite: UserFavorite, event: MouseEvent) {
    event.stopPropagation();
    editingAlias = favorite.id;
    aliasInput = favorite.alias || '';
  }
  
  function saveAlias(favorite: UserFavorite, event: MouseEvent) {
    event.stopPropagation();
    
    if (aliasInput.trim()) {
      userService.updateUserAlias(favorite.id, aliasInput.trim());
      userFavorites = userService.getUserFavorites();
    }
    
    editingAlias = null;
    aliasInput = '';
  }
  
  function cancelEditAlias(event: MouseEvent) {
    event.stopPropagation();
    editingAlias = null;
    aliasInput = '';
  }
  
  export function clearSelection() {
    if (mode === 'multi') {
      userSelectionStore.clearSelection();
    }
    value = '';
    searchQuery = '';
    dispatch('change', { userId: '', userName: '', userIds: [] });
  }

  function toggleMode() {
    userSelectionStore.toggleSelectionMode();
  }

  function applyMultiSelect() {
    const userString = userSelectionStore.getFormattedUserString();
    const displayNames = userSelectionStore.getSelectedUserDisplayNames();
    value = userString;
    // Clear search input to allow further searching
    searchQuery = '';
    showDropdown = false;
    // Dispatch both formats for compatibility
    dispatch('change', {
      userIds: selectedUsers,
      userId: userString,  // Comma-separated for multi-user
      userName: displayNames.join(', ')
    });
  }

  function selectAllFavorites() {
    userSelectionStore.selectAllFavorites();
    // Wait for store update then apply
    setTimeout(() => {
      if (mode === 'multi' && selectedUsers.length > 0) {
        applyMultiSelect();
      }
    }, 50);
  }

  function selectRecentUsers() {
    userSelectionStore.selectRecentUsers(5);
    // Wait for store update then apply
    setTimeout(() => {
      if (mode === 'multi' && selectedUsers.length > 0) {
        applyMultiSelect();
      }
    }, 50);
  }
  
  export function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown && inputElement) {
      inputElement.focus();
    }
    highlightedIndex = -1;
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (!showDropdown && e.key === 'ArrowDown') {
      showDropdown = true;
      return;
    }

    if (!showDropdown && e.key === 'Enter') {
      // If dropdown is closed and Enter is pressed, trigger search
      if (onEnterKey) {
        onEnterKey();
      }
      return;
    }

    if (!showDropdown) return;

    const allUsers = getAllVisibleUsers();
    const totalItems = allUsers.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % totalItems;
        scrollToHighlighted();
        break;

      case 'ArrowUp':
        e.preventDefault();
        highlightedIndex = highlightedIndex <= 0 ? totalItems - 1 : highlightedIndex - 1;
        scrollToHighlighted();
        break;

      case 'Enter':
        e.preventDefault();
        e.stopPropagation();  // Stop Enter from bubbling up and triggering search
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          const user = allUsers[highlightedIndex];
          if (user) {
            selectUser(user);
          }
        }
        break;

      case 'f':
      case 'F':
        // Toggle favorite for highlighted user
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          e.preventDefault();
          e.stopPropagation();
          const user = allUsers[highlightedIndex];
          if (user) {
            toggleFavorite(user, e);
          }
        }
        break;

      case 'Escape':
        showDropdown = false;
        highlightedIndex = -1;
        break;

      case 'Tab':
        // Close dropdown and allow Tab to move to next field
        showDropdown = false;
        highlightedIndex = -1;
        // Don't prevent default - let Tab move focus naturally
        break;
    }
  }

  function getAllVisibleUsers() {
    const favoriteIds = new Set(userFavorites.map(f => f.id));
    const recentNonFavorites = recentUsers.filter(u => !favoriteIds.has(u.id)).slice(0, 5);
    const searchNonFavorites = searchResults.filter(u => !favoriteIds.has(u.id) && !recentNonFavorites.some(r => r.id === u.id));

    return [...userFavorites, ...recentNonFavorites, ...searchNonFavorites];
  }

  function scrollToHighlighted() {
    if (highlightedIndex < 0) return;

    const items = dropdownElement?.querySelectorAll('.user-item');
    if (items && items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(e: MouseEvent) {
    if (inputElement && !inputElement.contains(e.target as Node) &&
        dropdownElement && !dropdownElement.contains(e.target as Node)) {
      showDropdown = false;
    }
  }

  // Global keyboard shortcuts
  function handleGlobalKeydown(event: KeyboardEvent) {
    // Ctrl+U or Cmd+U to toggle multi-select mode
    if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
      event.preventDefault();
      toggleMode();
      return;
    }

    // Ctrl+Shift+U or Cmd+Shift+U to apply selected users
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'U' || event.key === 'u')) {
      event.preventDefault();
      if (mode === 'multi' && selectedUsers.length > 0) {
        applyMultiSelect();
      }
      return;
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });
</script>

<div class="user-selector">
  <div class="selector-header">
    <div class="input-wrapper">
      <input
        bind:this={inputElement}
        type="text"
        value={searchQuery}
        on:input={handleInput}
        on:focus={() => showDropdown = true}
        on:keydown={handleKeydown}
        placeholder={mode === 'multi'
          ? (selectedUsers.length > 0
            ? `Search to add more (${selectedUsers.length} selected)`
            : 'Search users (multi-select)')
          : (displayValue || "Search users or select from favorites")}
        title="Use arrow keys to navigate, Enter to select, 'f' to toggle favorite"
        class="user-input"
        class:has-selection={selectedUsers.length > 0 || value}
      />

      {#if value || selectedUsers.length > 0}
        <button
          on:click={clearSelection}
          class="clear-btn"
          title="Clear selection"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>

    <div class="selector-controls">
      <button
        on:click={toggleMode}
        class="mode-toggle"
        class:active={mode === 'multi'}
        title={mode === 'multi'
          ? 'Multi-select mode: Select multiple users (Ctrl+U to switch to single)'
          : 'Single-select mode: Select one user (Ctrl+U to switch to multi)'}
        aria-label={mode === 'multi' ? 'Switch to single select' : 'Switch to multi-select'}
      >
        {#if mode === 'multi'}
          <div class="button-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
            </svg>
            {#if selectedUsers.length > 0}
              <span class="badge">{selectedUsers.length}</span>
            {/if}
          </div>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        {/if}
      </button>

      {#if userFavorites.length > 0}
        <button
          on:click={selectAllFavorites}
          class="select-favorites"
          title="Select all favorite users"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      {/if}

      <button
        on:click={selectRecentUsers}
        class="select-recent"
        title="Select recent 5 users"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </button>
    </div>
  </div>

  {#if mode === 'multi' && selectedUsers.length > 0}
    <div class="selected-users">
      <span class="selected-label">Selected ({selectedUsers.length}):</span>
      {#each $selectedUserDisplayNames as displayName, index}
        <span class="selected-tag">
          {displayName}
          <button
            on:click={() => {
              const userId = selectedUsers[index];
              if (userId) {
                userSelectionStore.toggleUserSelection(userId);
              }
            }}
            class="remove-tag"
          >
            ×
          </button>
        </span>
      {/each}
      <button
        on:click={applyMultiSelect}
        class="apply-btn-inline"
        title="Apply selected users to search (Ctrl+Shift+U)"
      >
        Apply ({selectedUsers.length})
      </button>
    </div>
  {/if}

  {#if showDropdown}
    <div bind:this={dropdownElement} class="user-dropdown">
      {#if showDropdown}
        <div class="dropdown-help">
          <span class="help-text">↑↓ Navigate • Enter Select • f Toggle Favorite</span>
        </div>
      {/if}

      {#if userFavorites.length > 0}
        <div class="user-group">
          <div class="group-header">⭐ Favorite Users</div>
          {#each userFavorites as favorite, index}
            <div
              class="user-item"
              class:highlighted={highlightedIndex === index}
              class:selected={mode === 'multi' ? selectedUsers.includes(favorite.id) : value === favorite.id}
              on:click={() => selectUser(favorite)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(favorite.id)}
                  on:click|stopPropagation={() => userSelectionStore.toggleUserSelection(favorite.id, favorite)}
                />
              {/if}
              <span class="user-name">
                {#if favorite.alias}
                  <strong>{favorite.alias}</strong>
                  <span class="user-detail">({favorite.displayName || favorite.realName || favorite.name})</span>
                {:else}
                  {favorite.displayName || favorite.realName || favorite.name}
                {/if}
              </span>
              <button
                on:click={(e) => startEditAlias(favorite, e)}
                class="edit-btn"
                title="Edit alias"
                tabindex="-1"
              >
                ✏️
              </button>
              <button
                on:click={(e) => toggleFavorite(favorite, e)}
                class="favorite-btn active"
                title="Remove from favorites (press 'f' when highlighted)"
                tabindex="-1"
              >
                ⭐
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if recentUsers.filter(u => !userFavorites.some(f => f.id === u.id)).length > 0}
        <div class="user-group">
          <div class="group-header">🕐 Recent</div>
          {#each recentUsers.filter(u => !userFavorites.some(f => f.id === u.id)).slice(0, 5) as user, index}
            {@const actualIndex = userFavorites.length + index}
            <div
              class="user-item"
              class:highlighted={highlightedIndex === actualIndex}
              class:selected={mode === 'multi' ? selectedUsers.includes(user.id) : value === user.id}
              on:click={() => selectUser(user)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  on:click|stopPropagation={() => userSelectionStore.toggleUserSelection(user.id, user)}
                />
              {/if}
              <span class="user-name">
                {user.displayName || user.realName || user.name}
              </span>
              <button
                on:click={(e) => toggleFavorite(user, e)}
                class="favorite-btn"
                title="Add to favorites (press 'f' when highlighted)"
                tabindex="-1"
              >
                ☆
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if searchResults.length > 0}
        {@const favoriteIds = new Set(userFavorites.map(f => f.id))}
        {@const recentIds = new Set(recentUsers.map(u => u.id))}
        {@const searchFiltered = searchResults.filter(u => !favoriteIds.has(u.id) && !recentIds.has(u.id))}
        {#if searchFiltered.length > 0}
          <div class="user-group">
            <div class="group-header">Search Results</div>
            {#each searchFiltered as user, index}
              {@const actualIndex = userFavorites.length + Math.min(5, recentUsers.filter(u => !userFavorites.some(f => f.id === u.id)).length) + index}
              <div
                class="user-item"
                class:highlighted={highlightedIndex === actualIndex}
                class:selected={mode === 'multi' ? selectedUsers.includes(user.id) : value === user.id}
                on:click={() => selectUser(user)}
              >
                {#if mode === 'multi'}
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    on:click|stopPropagation={() => userSelectionStore.toggleUserSelection(user.id, user)}
                  />
                {/if}
                <span class="user-name">
                  {user.displayName || user.realName || user.name}
                </span>
                <button
                  on:click={(e) => toggleFavorite(user, e)}
                  class="favorite-btn"
                  title="Add to favorites (press 'f' when highlighted)"
                  tabindex="-1"
                >
                  ☆
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      {#if !searchQuery && userFavorites.length === 0}
        <div class="no-results">
          No favorite users yet. Search for users to add them to favorites.
        </div>
      {/if}

      {#if editingAlias}
        <div class="alias-edit-modal">
          <input
            type="text"
            bind:value={aliasInput}
            on:keydown={(e) => {
              if (e.key === 'Enter') {
                const fav = userFavorites.find(f => f.id === editingAlias);
                if (fav) saveAlias(fav, e);
              }
              if (e.key === 'Escape') cancelEditAlias(e);
            }}
            placeholder="Enter alias"
            class="alias-input"
            autofocus
          />
          <button
            on:click={(e) => {
              const fav = userFavorites.find(f => f.id === editingAlias);
              if (fav) saveAlias(fav, e);
            }}
            class="alias-save-btn"
          >
            Save
          </button>
          <button
            on:click={cancelEditAlias}
            class="alias-cancel-btn"
          >
            Cancel
          </button>
        </div>
      {/if}

      {#if mode === 'multi' && selectedUsers.length > 0}
        <div class="dropdown-footer">
          <button
            on:click={applyMultiSelect}
            class="apply-btn"
          >
            Apply Selection ({selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''}) (Ctrl+Shift+U)
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .user-selector {
    position: relative;
    width: 100%;
  }

  .selector-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .input-wrapper {
    flex: 1;
    position: relative;
  }

  .user-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .user-input.has-selection {
    background: var(--primary-bg);
    border-color: var(--primary);
    font-weight: 500;
  }

  .user-input:focus {
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

  .selector-controls {
    display: flex;
    gap: 0.25rem;
  }

  .mode-toggle,
  .select-favorites,
  .select-recent {
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

  .mode-toggle:hover,
  .select-favorites:hover,
  .select-recent:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .mode-toggle.active {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
  }

  .button-content {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: var(--primary);
    color: white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .selected-users {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-hover);
    border-radius: 4px;
  }

  .selected-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-right: 0.5rem;
  }

  .selected-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--primary);
  }

  .remove-tag {
    background: transparent;
    border: none;
    color: var(--primary);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
    margin-left: 0.25rem;
  }

  .apply-btn-inline {
    padding: 0.25rem 0.75rem;
    background: var(--primary);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    margin-left: auto;
    transition: background 0.2s;
  }

  .apply-btn-inline:hover {
    background: var(--primary-hover);
  }

  .user-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    max-height: 400px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
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

  .user-group {
    border-bottom: 1px solid var(--border);
  }

  .user-group:last-child {
    border-bottom: none;
  }

  .group-header {
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .user-item {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .user-item input[type="checkbox"] {
    margin-right: 0.5rem;
  }

  .user-item:hover,
  .user-item.highlighted {
    background: var(--bg-hover);
  }

  .user-item.selected {
    background: var(--primary-bg);
  }

  .favorite-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--primary-bg, rgba(66, 184, 221, 0.1));
    color: var(--primary, #42b8dd);
    font-size: 0.75rem;
    font-weight: 600;
    margin-right: 0.5rem;
    flex-shrink: 0;
  }

  .user-name {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .user-detail {
    color: var(--text-secondary);
    font-size: 0.75rem;
    margin-left: 0.5rem;
  }

  .edit-btn,
  .favorite-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    transition: color 0.2s;
    margin-left: 0.25rem;
  }

  .edit-btn {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .edit-btn:hover {
    color: var(--text-primary);
  }

  .favorite-btn {
    color: var(--text-secondary);
  }

  .favorite-btn:hover {
    color: gold;
  }

  .favorite-btn.active {
    color: gold;
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .alias-edit-modal {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: flex;
    gap: 0.5rem;
    align-items: center;
    z-index: 1001;
  }

  .alias-input {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    width: 200px;
  }

  .alias-save-btn,
  .alias-cancel-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .alias-save-btn {
    background: var(--primary);
    color: white;
  }

  .alias-save-btn:hover {
    background: var(--primary-hover);
  }

  .alias-cancel-btn {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .alias-cancel-btn:hover {
    background: var(--bg-hover);
  }

  .user-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .user-dropdown::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  .user-dropdown::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  .user-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  .dropdown-footer {
    padding: 0.75rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .apply-btn {
    width: 100%;
    padding: 0.5rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .apply-btn:hover {
    background: var(--primary-hover);
  }
</style>