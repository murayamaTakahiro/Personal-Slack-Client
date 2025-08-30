<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { userService } from '../services/userService';
  import type { SlackUser, UserFavorite } from '../types/slack';
  
  export let searchQuery: string = '';
  export let position: { x: number; y: number };
  
  const dispatch = createEventDispatcher();
  
  let selectedIndex = 0;
  let filteredUsers: (SlackUser | UserFavorite)[] = [];
  let dropdownElement: HTMLDivElement;
  let loading = false;
  let userFavorites: UserFavorite[] = [];
  
  onMount(() => {
    console.log('MentionAutocomplete mounted with searchQuery:', searchQuery);
    
    // Load favorites
    userFavorites = userService.getUserFavorites();
    
    // Initial search
    searchUsers(searchQuery);
    
    // Add keyboard event listener
    document.addEventListener('keydown', handleKeydown);
    
    // Position dropdown
    if (dropdownElement) {
      adjustDropdownPosition();
    }
  });
  
  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
  
  $: searchUsers(searchQuery);
  
  async function searchUsers(query: string) {
    console.log('Searching users with query:', query);
    loading = true;
    
    try {
      // If query is empty, show favorites first
      if (query.length === 0) {
        const allUsers = await userService.getAllUsers();
        console.log('Got all users:', allUsers.length);
        
        // Combine favorites with all users
        const favoriteUsers = userFavorites.slice(0, 5);
        const otherUsers = allUsers
          .filter(u => !userFavorites.some(f => f.id === u.id))
          .slice(0, 5);
        
        filteredUsers = [...favoriteUsers, ...otherUsers];
      } else {
        // Search for users matching the query
        const searchResults = await userService.searchUsers(query);
        console.log('Search results:', searchResults.length);
        
        // Sort to prioritize favorites
        filteredUsers = searchResults.sort((a, b) => {
          const aIsFavorite = userFavorites.some(f => f.id === a.id);
          const bIsFavorite = userFavorites.some(f => f.id === b.id);
          
          if (aIsFavorite && !bIsFavorite) return -1;
          if (!aIsFavorite && bIsFavorite) return 1;
          return 0;
        }).slice(0, 10);
      }
      
      console.log('Filtered users:', filteredUsers.length);
      
      // Reset selection index if needed
      if (selectedIndex >= filteredUsers.length) {
        selectedIndex = 0;
      }
    } catch (error) {
      console.error('Failed to search users:', error);
      filteredUsers = [];
    } finally {
      loading = false;
    }
  }
  
  function handleKeydown(event: KeyboardEvent) {
    switch(event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredUsers.length - 1);
        scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollToSelected();
        break;
      case 'Enter':
        event.preventDefault();
        if (filteredUsers[selectedIndex]) {
          selectUser(filteredUsers[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        dispatch('close');
        break;
    }
  }
  
  function selectUser(user: SlackUser | UserFavorite) {
    dispatch('select', { user });
  }
  
  function scrollToSelected() {
    if (!dropdownElement) return;
    
    const items = dropdownElement.querySelectorAll('.mention-item');
    const selectedItem = items[selectedIndex] as HTMLElement;
    
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  
  function adjustDropdownPosition() {
    if (!dropdownElement) return;
    
    const rect = dropdownElement.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    
    // Adjust vertical position if dropdown goes below viewport
    if (rect.bottom > windowHeight) {
      dropdownElement.style.top = `${position.y - rect.height - 20}px`;
    }
    
    // Adjust horizontal position if dropdown goes beyond viewport
    if (rect.right > windowWidth) {
      dropdownElement.style.left = `${windowWidth - rect.width - 10}px`;
    }
  }
  
  function getUserDisplayName(user: SlackUser | UserFavorite): string {
    if ('alias' in user && user.alias) {
      return user.alias;
    }
    return user.displayName || user.realName || user.name;
  }
  
  function isFavorite(user: SlackUser | UserFavorite): boolean {
    return userFavorites.some(f => f.id === user.id);
  }
</script>

<div 
  bind:this={dropdownElement}
  class="mention-dropdown"
  style="left: {position.x || 100}px; top: {position.y || 200}px"
>
  <!-- Debug: position = {JSON.stringify(position)} -->
  {#if loading}
    <div class="loading">Searching...</div>
  {:else if filteredUsers.length === 0}
    <div class="no-results">No users found</div>
  {:else}
    {#each filteredUsers as user, index}
      <div 
        class="mention-item"
        class:selected={index === selectedIndex}
        on:click={() => selectUser(user)}
        on:mouseenter={() => selectedIndex = index}
      >
        {#if user.avatar}
          <img src={user.avatar} alt={user.name} class="user-avatar" />
        {:else}
          <div class="user-avatar-placeholder">
            {getUserDisplayName(user).charAt(0).toUpperCase()}
          </div>
        {/if}
        <div class="user-info">
          <div class="user-name">
            @{user.name}
            {#if isFavorite(user)}
              <span class="favorite-badge">★</span>
            {/if}
          </div>
          <div class="user-real-name">
            {getUserDisplayName(user)}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .mention-dropdown {
    position: fixed;
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 300px;
    width: 280px;
    overflow-y: auto;
    z-index: 100001; /* Higher z-index to ensure it's above dialog */
    display: block; /* Ensure it's visible */
  }
  
  .loading,
  .no-results {
    padding: 12px;
    text-align: center;
    color: var(--color-text-secondary, #666);
    font-size: 13px;
  }
  
  .mention-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.1s;
    border-bottom: 1px solid var(--color-border-light, #f0f0f0);
  }
  
  .mention-item:last-child {
    border-bottom: none;
  }
  
  .mention-item:hover,
  .mention-item.selected {
    background: var(--color-hover, #f5f5f5);
  }
  
  .user-avatar,
  .user-avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    margin-right: 10px;
    flex-shrink: 0;
  }
  
  .user-avatar {
    object-fit: cover;
  }
  
  .user-avatar-placeholder {
    background: var(--color-primary, #4a90e2);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
  }
  
  .user-info {
    flex: 1;
    min-width: 0;
  }
  
  .user-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .favorite-badge {
    color: gold;
    font-size: 12px;
  }
  
  .user-real-name {
    font-size: 12px;
    color: var(--color-text-secondary, #666);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  /* Dark mode adjustments */
  :global([data-theme='dark']) .mention-dropdown {
    background: #2a2a2a;
    border-color: #444;
  }
  
  :global([data-theme='dark']) .mention-item {
    border-bottom-color: #3a3a3a;
  }
  
  :global([data-theme='dark']) .mention-item:hover,
  :global([data-theme='dark']) .mention-item.selected {
    background: #3a3a3a;
  }
  
  :global([data-theme='dark']) .user-name {
    color: #fff;
  }
  
  :global([data-theme='dark']) .user-real-name {
    color: #999;
  }
</style>