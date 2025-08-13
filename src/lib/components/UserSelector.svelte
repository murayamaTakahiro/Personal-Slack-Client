<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { userService } from '../services/userService';
  import type { UserFavorite, SlackUser } from '../types/slack';
  
  export let value = '';
  export let onEnterKey: (() => void) | undefined = undefined;
  
  const dispatch = createEventDispatcher();
  
  let showDropdown = false;
  let searchQuery = '';
  let selectedIndex = 0;
  let userFavorites: UserFavorite[] = [];
  let searchResults: SlackUser[] = [];
  let loading = false;
  let inputElement: HTMLInputElement;
  let dropdownElement: HTMLDivElement;
  let editingAlias: string | null = null;
  let aliasInput = '';
  
  // Load favorites on mount
  onMount(() => {
    userFavorites = userService.getUserFavorites();
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
  
  async function handleInput() {
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
    value = user.id;
    searchQuery = '';
    searchResults = [];
    showDropdown = false;
    
    dispatch('change', { 
      userId: user.id,
      userName: 'alias' in user && user.alias 
        ? user.alias 
        : user.displayName || user.realName || user.name
    });
  }
  
  async function toggleFavorite(user: SlackUser | UserFavorite, event: MouseEvent) {
    event.stopPropagation();
    
    if (userService.isUserFavorite(user.id)) {
      userService.removeUserFavorite(user.id);
    } else {
      await userService.addUserFavorite(user.id);
    }
    
    userFavorites = userService.getUserFavorites();
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
    value = '';
    searchQuery = '';
    dispatch('change', { userId: '', userName: '' });
  }
  
  export function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown && inputElement) {
      inputElement.focus();
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (!showDropdown) {
      if (e.key === 'ArrowDown') {
        showDropdown = true;
      } else if (e.key === 'Enter') {
        // If dropdown is closed and Enter is pressed, trigger search
        if (onEnterKey) {
          onEnterKey();
        }
      }
      return;
    }
    
    const items = [...userFavorites, ...searchResults];
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();  // Stop Enter from bubbling up and triggering search
        if (items[selectedIndex]) {
          selectUser(items[selectedIndex]);
        }
        break;
      case 'Escape':
        showDropdown = false;
        searchQuery = '';
        searchResults = [];
        break;
        
      case 'Tab':
        // Close dropdown and allow Tab to move to next field
        showDropdown = false;
        // Don't prevent default - let Tab move focus naturally
        break;
    }
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(e: MouseEvent) {
    if (dropdownElement && !dropdownElement.contains(e.target as Node) && 
        inputElement && !inputElement.contains(e.target as Node)) {
      showDropdown = false;
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="user-selector">
  <div class="input-wrapper">
    <input
      bind:this={inputElement}
      type="text"
      bind:value={searchQuery}
      on:input={handleInput}
      on:focus={() => showDropdown = true}
      on:keydown={handleKeydown}
      placeholder={displayValue || "Search users or select from favorites"}
      class="user-input"
    />
    
    {#if value}
      <button 
        on:click={clearSelection}
        class="clear-btn"
        title="Clear selection"
      >
        ×
      </button>
    {/if}
    
    <button 
      on:click={toggleDropdown}
      class="dropdown-toggle"
      title="Toggle user list"
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2 4l4 4 4-4" stroke="currentColor" fill="none" stroke-width="2"/>
      </svg>
    </button>
  </div>
  
  {#if showDropdown}
    <div bind:this={dropdownElement} class="dropdown">
      {#if userFavorites.length > 0}
        <div class="dropdown-section">
          <div class="section-header">Favorite Users</div>
          {#each userFavorites as favorite, i}
            <div 
              class="dropdown-item {selectedIndex === i ? 'selected' : ''}"
              on:click={() => selectUser(favorite)}
            >
              <div class="user-info">
                <span class="user-name">
                  {#if favorite.alias}
                    <strong>{favorite.alias}</strong>
                    <span class="user-detail">({favorite.displayName || favorite.realName || favorite.name})</span>
                  {:else}
                    {favorite.displayName || favorite.realName || favorite.name}
                  {/if}
                </span>
                <span class="user-id">{favorite.id}</span>
              </div>
              
              <div class="item-actions">
                {#if editingAlias === favorite.id}
                  <input
                    type="text"
                    bind:value={aliasInput}
                    on:click|stopPropagation
                    on:keydown|stopPropagation={(e) => {
                      if (e.key === 'Enter') saveAlias(favorite, e);
                      if (e.key === 'Escape') cancelEditAlias(e);
                    }}
                    placeholder="Enter alias"
                    class="alias-input"
                  />
                  <button 
                    on:click={(e) => saveAlias(favorite, e)}
                    class="icon-btn"
                    title="Save alias"
                  >
                    ✓
                  </button>
                  <button 
                    on:click={cancelEditAlias}
                    class="icon-btn"
                    title="Cancel"
                  >
                    ×
                  </button>
                {:else}
                  <button 
                    on:click={(e) => startEditAlias(favorite, e)}
                    class="icon-btn"
                    title="Edit alias"
                  >
                    ✏️
                  </button>
                {/if}
                
                <button 
                  on:click={(e) => toggleFavorite(favorite, e)}
                  class="icon-btn favorite active"
                  title="Remove from favorites"
                >
                  ★
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if searchQuery.length >= 2}
        <div class="dropdown-section">
          <div class="section-header">
            {#if loading}
              Searching...
            {:else if searchResults.length > 0}
              Search Results
            {:else}
              No users found
            {/if}
          </div>
          
          {#each searchResults as user, i}
            <div 
              class="dropdown-item {selectedIndex === userFavorites.length + i ? 'selected' : ''}"
              on:click={() => selectUser(user)}
            >
              <div class="user-info">
                <span class="user-name">
                  {user.displayName || user.realName || user.name}
                </span>
                <span class="user-id">{user.id}</span>
              </div>
              
              <button 
                on:click={(e) => toggleFavorite(user, e)}
                class="icon-btn favorite {userService.isUserFavorite(user.id) ? 'active' : ''}"
                title="{userService.isUserFavorite(user.id) ? 'Remove from' : 'Add to'} favorites"
              >
                {userService.isUserFavorite(user.id) ? '★' : '☆'}
              </button>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if !searchQuery && userFavorites.length === 0}
        <div class="dropdown-section">
          <div class="empty-state">
            <p>No favorite users yet.</p>
            <p class="hint">Search for users and click the star to add them to favorites.</p>
          </div>
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
  
  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .user-input {
    flex: 1;
    padding: 0.5rem 2.5rem 0.5rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .user-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .clear-btn,
  .dropdown-toggle {
    position: absolute;
    right: 0.25rem;
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1.2rem;
    line-height: 1;
  }
  
  .clear-btn {
    right: 2rem;
  }
  
  .clear-btn:hover,
  .dropdown-toggle:hover {
    color: var(--text-primary);
  }
  
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
  }
  
  .dropdown-section {
    padding: 0.5rem 0;
  }
  
  .dropdown-section:not(:first-child) {
    border-top: 1px solid var(--border);
  }
  
  .section-header {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
  }
  
  .dropdown-item {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background-color 0.2s;
  }
  
  .dropdown-item:hover,
  .dropdown-item.selected {
    background: var(--bg-hover);
  }
  
  .user-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  
  .user-name {
    color: var(--text-primary);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .user-detail {
    color: var(--text-secondary);
    font-size: 0.75rem;
    margin-left: 0.5rem;
  }
  
  .user-id {
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-family: monospace;
  }
  
  .item-actions {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  
  .icon-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1;
    transition: color 0.2s;
  }
  
  .icon-btn:hover {
    color: var(--text-primary);
  }
  
  .icon-btn.favorite {
    font-size: 1rem;
  }
  
  .icon-btn.favorite.active {
    color: gold;
  }
  
  .alias-input {
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.75rem;
    width: 120px;
  }
  
  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
  }
  
  .empty-state p {
    margin: 0.5rem 0;
  }
  
  .hint {
    font-size: 0.75rem;
    font-style: italic;
  }
</style>