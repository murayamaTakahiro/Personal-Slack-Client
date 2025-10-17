<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { userService } from '../services/userService';
  import { settings } from '../stores/settings';
  import { showToast } from '../stores/toast';
  import { userSelectionStore, selectedUserIds, isMultiSelectMode, selectedUserDisplayNames } from '../stores/userSelection';
  import type { UserFavorite, SlackUser } from '../types/slack';
  import { accessKeyService } from '../services/accessKeyService';

  export let value = '';
  export let onEnterKey: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  // Access key registration IDs for cleanup
  let accessKeyRegistrations: string[] = [];

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
  let editingUserId: string | null = null;
  let editingAlias = '';
  let unsubscribeSettings: (() => void) | null = null;
  let highlightedIndex = -1;

  // Button references for access keys
  let modeToggleButton: HTMLButtonElement;
  let favoritesButton: HTMLButtonElement;
  let recentButton: HTMLButtonElement;
  let applyButtonInline: HTMLButtonElement;  // Apply button in selected-users section
  let applyButtonDropdown: HTMLButtonElement;  // Apply button in dropdown footer
  
  // Reactively re-register access keys when user favorites or selection changes
  $: if (userFavorites || selectedUsers || mode) {
    // Clean up existing registrations
    cleanupAccessKeys();
    // Re-register after a short delay to ensure DOM is updated
    tick().then(() => {
      setupAccessKeys();
    });
  }

  // Load favorites on mount and listen for workspace switches
  function setupAccessKeys() {
    const registrations: string[] = [];

    console.log('[UserSelector] Setting up access keys, button refs:', {
      modeToggleButton: !!modeToggleButton,
      favoritesButton: !!favoritesButton,
      recentButton: !!recentButton,
      applyButtonInline: !!applyButtonInline,
      applyButtonDropdown: !!applyButtonDropdown
    });

    // 4: モード切替ボタン (左端のボタン)
    if (modeToggleButton) {
      const id = accessKeyService.register('4', modeToggleButton, () => {
        console.log('[UserSelector] Access key 4 pressed: toggleMode');
        toggleMode();
      }, 10);
      if (id) registrations.push(id);
    }

    // 5: お気に入りボタン (中央の⭐ボタン)
    if (favoritesButton) {
      const id = accessKeyService.register('5', favoritesButton, () => {
        console.log('[UserSelector] Access key 5 pressed: selectAllFavorites');
        selectAllFavorites();
      }, 10);
      if (id) registrations.push(id);
    }

    // 6: 最近使用ボタン (右端の🕒ボタン)
    if (recentButton) {
      const id = accessKeyService.register('6', recentButton, () => {
        console.log('[UserSelector] Access key 6 pressed: selectRecentUsers');
        selectRecentUsers();
      }, 10);
      if (id) registrations.push(id);
    }

    // 8: Apply button (マルチセレクトモードのみ) - inline or dropdown version
    const applyButton = applyButtonInline || applyButtonDropdown;
    if (applyButton && mode === 'multi' && selectedUsers.length > 0) {
      const id = accessKeyService.register('8', applyButton, () => {
        console.log('[UserSelector] Access key 8 pressed: applyMultiSelect');
        applyMultiSelect();
      }, 10);
      if (id) registrations.push(id);
    }

    accessKeyRegistrations = registrations;
    console.log(`[UserSelector] Registered ${registrations.length} access keys`);
  }

  function cleanupAccessKeys() {
    accessKeyRegistrations.forEach(id => {
      accessKeyService.unregister(id);
    });
    accessKeyRegistrations = [];
    console.log('[UserSelector] Cleaned up access keys');
  }

  onMount(async () => {
    // Function to load user data
    const loadUserData = () => {
      userFavorites = userService.getUserFavorites();
      recentUsers = userService.getRecentUsers();

      console.log('[UserSelector] Loaded users:', {
        favorites: userFavorites.length,
        favoriteIds: userFavorites.map(f => f.id),
        recent: recentUsers.length,
        recentUserData: recentUsers.map(u => ({ id: u.id, name: u.name || u.displayName })),
        recentNonFavorites: recentUsers.filter(u => !userFavorites.some(f => f.id === u.id)).length
      });

      // Set initial highlight if dropdown is open
      if (showDropdown && getAllVisibleUsers().length > 0) {
        highlightedIndex = 0;
      }
    };

    // Listen for UserService initialization completion
    const handleUserServiceInit = () => {
      console.log('[UserSelector] UserService initialized event received');
      loadUserData();
    };

    // Listen for workspace switch events
    const handleWorkspaceSwitch = () => {
      // Add small delay to ensure workspace data is loaded
      setTimeout(() => {
        userFavorites = userService.getUserFavorites();
        recentUsers = userService.getRecentUsers();
        // Clear any selected users when switching workspace
        if (mode === 'multi') {
          userSelectionStore.clearSelection();
        }
        value = '';
        searchQuery = '';
        searchResults = []; // Clear search results when switching workspace
      }, 100);
    };

    window.addEventListener('userservice-initialized', handleUserServiceInit);
    window.addEventListener('workspace-switched', handleWorkspaceSwitch);

    // Load initial data (in case UserService is already initialized)
    await tick();
    loadUserData();

    // Setup access keys after DOM is ready
    tick().then(() => {
      setupAccessKeys();
    });

    // Clean up event listeners on component destroy
    return () => {
      window.removeEventListener('userservice-initialized', handleUserServiceInit);
      window.removeEventListener('workspace-switched', handleWorkspaceSwitch);
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
      // Add to recent users in multi-select mode as well
      userService.addToRecentUsers(user.id);
      // Update local recentUsers list
      recentUsers = userService.getRecentUsers();
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
  
  function startEditingAlias(userId: string, currentAlias: string = '') {
    editingUserId = userId;
    editingAlias = currentAlias;
  }

  async function saveAlias() {
    if (editingUserId) {
      if (editingAlias.trim()) {
        userService.updateUserAlias(editingUserId, editingAlias.trim());
        userFavorites = userService.getUserFavorites();
      }
      editingUserId = null;
      editingAlias = '';
      // Refocus the dropdown after saving
      setTimeout(() => {
        dropdownElement?.focus();
      }, 10);
    }
  }

  function cancelEditingAlias() {
    editingUserId = null;
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
    // Allow normal text input including j, k, etc.
    // Only block navigation keys
    else if (['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
      event.preventDefault();
    }
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

    // Add selected users to recent history with force=true
    // This ensures favorites are also tracked in usage history
    selectedUsers.forEach(userId => {
      userService.addToRecentUsers(userId, true).catch(err => {
        console.warn('Failed to add user to recent:', err);
      });
    });

    // Update local recentUsers list
    recentUsers = userService.getRecentUsers();

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
    // If we're editing an alias, don't handle any navigation keys
    if (editingUserId) {
      return;
    }

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
      case 'j':
      case 'J':
        e.preventDefault();
        e.stopPropagation();
        highlightedIndex = (highlightedIndex + 1) % totalItems;
        scrollToHighlighted();
        break;

      case 'ArrowUp':
      case 'k':
      case 'K':
        e.preventDefault();
        e.stopPropagation();
        highlightedIndex = highlightedIndex <= 0 ? totalItems - 1 : highlightedIndex - 1;
        scrollToHighlighted();
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();  // Stop Enter from bubbling up and triggering search
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          const user = allUsers[highlightedIndex];
          if (user) {
            selectUser(user);
          }
        } else if (mode === 'multi' && selectedUsers.length > 0) {
          // If nothing is highlighted but users are selected, apply the selection
          applyMultiSelect();
        }
        break;

      case 'e':
      case 'E':
        // Edit alias for highlighted user (only for favorites)
        if (highlightedIndex >= 0 && highlightedIndex < userFavorites.length) {
          e.preventDefault();
          e.stopPropagation();
          const favorite = userFavorites[highlightedIndex];
          if (favorite) {
            startEditingAlias(favorite.id, favorite.alias || '');
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
        e.preventDefault();
        e.stopPropagation();
        showDropdown = false;
        highlightedIndex = -1;
        // Return focus to input element
        if (inputElement) {
          setTimeout(() => {
            inputElement.focus();
          }, 10);
        }
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

  onMount(() => {
    // Global keyboard handler that always works
    function handleGlobalKeydown(event: KeyboardEvent) {
      // Don't handle anything if we're editing an alias
      if (editingUserId) {
        return;
      }

      // Only handle if dropdown is visible and the target is within our component
      if (showDropdown &&
          (event.target && (dropdownElement?.contains(event.target as Node) ||
                           inputElement?.contains(event.target as Node)))) {
        handleKeydown(event);
      }
    }

    // Always add the global keydown listener with capture
    document.addEventListener('keydown', handleGlobalKeydown, true);
    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown, true);
      document.removeEventListener('click', handleClickOutside);
    };
  });

  onDestroy(() => {
    cleanupAccessKeys();
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
        title="Use arrow keys to navigate, Enter to select, 'f' to toggle favorite (Ctrl+Shift+U to focus)"
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
        bind:this={modeToggleButton}
        on:click={toggleMode}
        class="mode-toggle"
        class:active={mode === 'multi'}
        title={mode === 'multi'
          ? 'Multi-select mode: Select multiple users'
          : 'Single-select mode: Select one user'}
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
          bind:this={favoritesButton}
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
        bind:this={recentButton}
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
        bind:this={applyButtonInline}
        on:click={applyMultiSelect}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            applyMultiSelect();
          }
        }}
        class="apply-btn-inline"
        title="Apply selected users to search (Ctrl+Shift+U)"
      >
        Apply ({selectedUsers.length})
      </button>
    </div>
  {/if}

  {#if showDropdown}
    <div bind:this={dropdownElement} class="user-dropdown" tabindex="0" on:keydown|stopPropagation={handleKeydown}>
      {#if showDropdown}
        <div class="dropdown-help">
          <span class="help-text">↑↓ Navigate • Enter/Space Select • e Edit Alias (Enter to save) • f Toggle Favorite</span>
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
              <div class="user-info">
                {#if editingUserId === favorite.id}
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
                  <span class="user-name">
                    {#if favorite.alias}
                      <strong>{favorite.alias}</strong>
                      <span class="user-detail">({favorite.displayName || favorite.realName || favorite.name})</span>
                    {:else}
                      {favorite.displayName || favorite.realName || favorite.name}
                    {/if}
                  </span>
                {/if}
              </div>
              <button
                on:click|stopPropagation={(e) => {
                  e.preventDefault();
                  startEditingAlias(favorite.id, favorite.alias || '');
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
                on:click={(e) => toggleFavorite(favorite, e)}
                class="btn-icon active"
                title="Remove from favorites (press 'f' when highlighted)"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
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
                class="btn-icon"
                title="Add to favorites (press 'f' when highlighted)"
                tabindex="0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
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
                  class="btn-icon"
                  title="Add to favorites (press 'f' when highlighted)"
                  tabindex="0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
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


      {#if mode === 'multi' && selectedUsers.length > 0}
        <div class="dropdown-footer">
          <button
            bind:this={applyButtonDropdown}
            on:click={applyMultiSelect}
            on:keydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                applyMultiSelect();
              }
            }}
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

  .user-dropdown:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
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
    position: relative;
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

  .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .user-name {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .user-detail {
    color: var(--text-secondary);
    font-size: 0.75rem;
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
    margin-left: 0.25rem;
  }

  .btn-icon:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-icon.active {
    color: var(--warning);
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
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