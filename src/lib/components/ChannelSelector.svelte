<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { channelStore, favoriteChannels, recentChannelsList, sortedChannels, channelGroups } from '../stores/channels';
  import { realtimeStore } from '../stores/realtime';
  
  export let value = '';  // Currently selected channel(s)
  export let channels: [string, string][] = [];
  export let onEnterKey: (() => void) | undefined = undefined;
  
  const dispatch = createEventDispatcher();
  
  let searchInput = '';
  let showDropdown = false;
  let highlightedIndex = -1;
  let inputElement: HTMLInputElement;
  let dropdownElement: HTMLDivElement;
  
  $: mode = $channelStore.selectionMode;
  $: selectedChannels = $channelStore.selectedChannels;
  
  // Sync searchInput when value is cleared externally (e.g., workspace switch)
  $: if (value === '' && searchInput !== '') {
    searchInput = '';
  }
  
  // Filter channels based on search input
  $: filteredChannels = searchInput
    ? $sortedChannels.filter(ch => 
        ch.name.toLowerCase().includes(searchInput.toLowerCase())
      )
    : $sortedChannels;
  
  // Group channels for display
  $: groupedChannels = {
    favorites: filteredChannels.filter(ch => ch.isFavorite),
    recent: $recentChannelsList.filter(ch => 
      !ch.isFavorite && filteredChannels.some(fc => fc.id === ch.id)
    ).slice(0, 5),
    all: filteredChannels.filter(ch => 
      !ch.isFavorite && !$recentChannelsList.some(rc => rc.id === ch.id)
    )
  };
  
  onMount(() => {
    // Initialize channel store with channels
    channelStore.initChannels(channels);
    
    // Close dropdown on outside click
    function handleClickOutside(event: MouseEvent) {
      if (inputElement && !inputElement.contains(event.target as Node) &&
          dropdownElement && !dropdownElement.contains(event.target as Node)) {
        showDropdown = false;
      }
    }
    
    // Global keyboard shortcuts
    function handleGlobalKeydown(event: KeyboardEvent) {
      // Ctrl+M or Cmd+M to toggle multi-select mode
      if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
        event.preventDefault();
        toggleMode();
        return;
      }
      
      // Ctrl+R or Cmd+R to select recent channels
      if ((event.ctrlKey || event.metaKey) && event.key === 'r' && !event.shiftKey) {
        event.preventDefault();
        selectRecentChannels();
        return;
      }
      
      // Ctrl+L or Cmd+L to toggle LIVE mode
      if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
        event.preventDefault();
        toggleLiveMode();
        return;
      }
      
      // Ctrl+Shift+A or Cmd+Shift+A to apply selected channels
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'A' || event.key === 'a')) {
        event.preventDefault();
        if (mode === 'multi' && selectedChannels.length > 0) {
          applyMultiSelect();
        }
        return;
      }
    }
    
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });
  
  function handleInputFocus() {
    showDropdown = true;
    highlightedIndex = -1;
  }
  
  // Export function for keyboard shortcut integration
  export function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown && inputElement) {
      inputElement.focus();
    }
    highlightedIndex = -1;
  }
  
  function handleInputKeydown(event: KeyboardEvent) {
    if (!showDropdown && event.key === 'ArrowDown') {
      showDropdown = true;
      return;
    }
    
    if (!showDropdown && event.key === 'Enter') {
      // If dropdown is closed and Enter is pressed, trigger search
      if (onEnterKey) {
        onEnterKey();
      }
      return;
    }
    
    if (!showDropdown) return;
    
    const totalItems = filteredChannels.length;
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % totalItems;
        scrollToHighlighted();
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        highlightedIndex = highlightedIndex <= 0 ? totalItems - 1 : highlightedIndex - 1;
        scrollToHighlighted();
        break;
        
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();  // Stop Enter from bubbling up and triggering search
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          selectChannel(filteredChannels[highlightedIndex].name);
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
  
  function scrollToHighlighted() {
    if (highlightedIndex < 0) return;
    
    const items = dropdownElement?.querySelectorAll('.channel-item');
    if (items && items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  
  function selectChannel(channelName: string) {
    if (mode === 'multi') {
      channelStore.toggleChannelSelection(channelName);
      // Keep dropdown open in multi-select mode so user can see Apply Selection button
      // Don't update searchInput to keep it clear for further searching
    } else {
      value = channelName;
      searchInput = channelName;
      showDropdown = false;
      channelStore.addToRecent(channelName);
      dispatch('change', { channel: channelName });
    }
  }
  
  function toggleFavorite(channelId: string, event: MouseEvent) {
    event.stopPropagation();
    channelStore.toggleFavorite(channelId);
  }
  
  function toggleMode() {
    channelStore.toggleSelectionMode();
  }
  
  export function clearSelection() {
    if (mode === 'multi') {
      channelStore.clearSelection();
    }
    value = '';
    searchInput = '';
    dispatch('change', { channel: '', channels: [] });
  }
  
  function selectAllFavorites() {
    channelStore.selectAllFavorites();
    // Wait for store update then apply
    setTimeout(() => {
      if (mode === 'multi' && selectedChannels.length > 0) {
        applyMultiSelect();
      }
    }, 50);
  }
  
  function selectAllChannels() {
    if (mode === 'multi') {
      const allChannelNames = filteredChannels.map(ch => ch.name);
      channelStore.selectMultipleChannels(allChannelNames);
      setTimeout(() => {
        applyMultiSelect();
      }, 50);
    }
  }
  
  function selectRecentChannels() {
    channelStore.selectRecentChannels(5);
    // Wait for store update then apply
    setTimeout(() => {
      if (mode === 'multi' && selectedChannels.length > 0) {
        applyMultiSelect();
      }
    }, 50);
  }
  
  function toggleLiveMode() {
    if (mode === 'multi' && selectedChannels.length > 0) {
      if ($realtimeStore.isEnabled) {
        realtimeStore.setEnabled(false);
      } else {
        realtimeStore.setEnabled(true);
        dispatch('enableRealtime');
      }
    }
  }
  
  function applyMultiSelect() {
    const channelString = selectedChannels.join(',');
    value = channelString;
    // Clear search input to allow further searching
    searchInput = '';
    showDropdown = false;
    console.log('Applying multi-select with channels:', selectedChannels);
    console.log('Channel string:', channelString);
    // Dispatch both formats for compatibility
    dispatch('change', { 
      channels: selectedChannels,
      channel: channelString  // Add this for SearchBar compatibility
    });
  }
  
  // Don't update search input when value changes externally to keep it clear for searching
  // This was causing the issue where the input field was populated with "X channels selected"
</script>

<div class="channel-selector">
  <div class="selector-header">
    <div class="input-wrapper">
      <input
        bind:this={inputElement}
        type="text"
        bind:value={searchInput}
        on:focus={handleInputFocus}
        on:keydown={handleInputKeydown}
        placeholder={mode === 'multi' 
          ? (selectedChannels.length > 0 
            ? `Search to add more (${selectedChannels.length} selected)`
            : 'Search channels (multi-select)') 
          : 'Search or select a channel'}
        class="channel-input"
        class:has-selection={selectedChannels.length > 0 || value}
      />
      
      {#if value || selectedChannels.length > 0}
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
        class:pulse={mode === 'single' && channels.length > 1}
        title={mode === 'multi' 
          ? 'マルチ選択モード: 複数のチャンネルを選択して一括検索できます (Ctrl+M でシングル選択に切替)' 
          : 'シングル選択モード: 1つのチャンネルのみ選択可能 (Ctrl+M でマルチ選択に切替)'}
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
            {#if selectedChannels.length > 0}
              <span class="badge">{selectedChannels.length}</span>
            {/if}
          </div>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        {/if}
      </button>
      
      {#if $favoriteChannels.length > 0}
        <button
          on:click={selectAllFavorites}
          class="select-favorites"
          title="お気に入りチャンネルを全選択"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      {/if}
      
      <button
        on:click={() => channelStore.selectRecentChannels(5)}
        class="select-recent"
        title="最近使用した5チャンネルを選択 (Ctrl+R)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </button>
      
      {#if $channelGroups.length > 0}
        <div class="channel-groups">
          {#each $channelGroups as group}
            <button
              on:click={() => channelStore.loadChannelGroup(group.name)}
              class="group-btn"
              title={`グループ "${group.name}" を読み込み`}
            >
              {group.icon || '📁'} {group.name}
            </button>
          {/each}
        </div>
      {/if}
      
      {#if mode === 'multi' && selectedChannels.length > 0}
        <button
          on:click={() => {
            if ($realtimeStore.isEnabled) {
              realtimeStore.setEnabled(false);
            } else {
              realtimeStore.setEnabled(true);
              dispatch('enableRealtime');
            }
          }}
          class="realtime-toggle {$realtimeStore.isEnabled ? 'active' : ''}"
          title={$realtimeStore.isEnabled ? 'リアルタイムモードを停止 (Ctrl+L)' : 'リアルタイムモード: 選択したチャンネルの今日の投稿を定期的に取得 (Ctrl+L)'}
        >
          {#if $realtimeStore.isEnabled}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="9" y="9" width="6" height="6" rx="1"/>
            </svg>
            <span class="realtime-label">STOP</span>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            <span class="realtime-label">LIVE</span>
          {/if}
        </button>
      {/if}
    </div>
  </div>
  
  {#if mode === 'multi' && selectedChannels.length > 0}
    <div class="selected-channels">
      <span class="selected-label">Selected ({selectedChannels.length}):</span>
      {#each selectedChannels as channel}
        <span class="selected-tag">
          {channel}
          <button
            on:click={() => channelStore.toggleChannelSelection(channel)}
            class="remove-tag"
          >
            ×
          </button>
        </span>
      {/each}
      <button
        on:click={applyMultiSelect}
        class="apply-btn-inline"
        title="Apply selected channels to search (Ctrl+Shift+A)"
      >
        Apply ({selectedChannels.length})
      </button>
    </div>
  {/if}
  
  {#if showDropdown}
    <div bind:this={dropdownElement} class="channel-dropdown">
      {#if groupedChannels.favorites.length > 0}
        <div class="channel-group">
          <div class="group-header">⭐ Favorites</div>
          {#each groupedChannels.favorites as channel, index}
            <div
              class="channel-item"
              class:highlighted={highlightedIndex === index}
              class:selected={mode === 'multi' ? selectedChannels.includes(channel.name) : value === channel.name}
              on:click={() => selectChannel(channel.name)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel.name)}
                  on:click|stopPropagation={() => channelStore.toggleChannelSelection(channel.name)}
                />
              {/if}
              <span class="channel-name">#{channel.name}</span>
              <button
                on:click={(e) => toggleFavorite(channel.id, e)}
                class="favorite-btn active"
                title="Remove from favorites"
              >
                ⭐
              </button>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if groupedChannels.recent.length > 0}
        <div class="channel-group">
          <div class="group-header">🕐 Recent</div>
          {#each groupedChannels.recent as channel, index}
            {@const actualIndex = groupedChannels.favorites.length + index}
            <div
              class="channel-item"
              class:highlighted={highlightedIndex === actualIndex}
              class:selected={mode === 'multi' ? selectedChannels.includes(channel.name) : value === channel.name}
              on:click={() => selectChannel(channel.name)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel.name)}
                  on:click|stopPropagation={() => channelStore.toggleChannelSelection(channel.name)}
                />
              {/if}
              <span class="channel-name">#{channel.name}</span>
              <button
                on:click={(e) => toggleFavorite(channel.id, e)}
                class="favorite-btn"
                title="Add to favorites"
              >
                ☆
              </button>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if groupedChannels.all.length > 0}
        <div class="channel-group">
          <div class="group-header">All Channels</div>
          {#each groupedChannels.all as channel, index}
            {@const actualIndex = groupedChannels.favorites.length + groupedChannels.recent.length + index}
            <div
              class="channel-item"
              class:highlighted={highlightedIndex === actualIndex}
              class:selected={mode === 'multi' ? selectedChannels.includes(channel.name) : value === channel.name}
              on:click={() => selectChannel(channel.name)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel.name)}
                  on:click|stopPropagation={() => channelStore.toggleChannelSelection(channel.name)}
                />
              {/if}
              <span class="channel-name">#{channel.name}</span>
              <button
                on:click={(e) => toggleFavorite(channel.id, e)}
                class="favorite-btn"
                title="Add to favorites"
              >
                ☆
              </button>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if filteredChannels.length === 0}
        <div class="no-results">
          No channels found matching "{searchInput}"
        </div>
      {/if}
      
      {#if mode === 'multi' && selectedChannels.length > 0}
        <div class="dropdown-footer">
          <button
            on:click={applyMultiSelect}
            class="apply-btn"
          >
            Apply Selection ({selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''}) (Ctrl+Shift+A)
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .channel-selector {
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
  
  .channel-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .channel-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .channel-input.has-selection {
    background: var(--primary-bg);
    border-color: var(--primary);
    font-weight: 500;
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
  .select-recent,
  .realtime-toggle {
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
  .select-recent:hover,
  .realtime-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .realtime-toggle {
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
  }
  
  .realtime-toggle.active {
    background: #ff4444;
    border-color: #ff4444;
    color: white;
    animation: pulse-live 2s ease-in-out infinite;
  }
  
  .realtime-toggle.active:hover {
    background: #cc0000;
    border-color: #cc0000;
  }
  
  .realtime-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  
  @keyframes pulse-live {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }
  
  .channel-groups {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  
  .group-btn {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    transition: all 0.2s;
  }
  
  .group-btn:hover {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
  }
  
  .mode-toggle.active {
    background: var(--primary-bg);
    border-color: var(--primary);
    color: var(--primary);
  }
  
  .mode-toggle.pulse {
    animation: pulse 2s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
      border-color: var(--primary);
    }
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
  
  .selected-channels {
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
  
  .channel-dropdown {
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
  
  .channel-group {
    border-bottom: 1px solid var(--border);
  }
  
  .channel-group:last-child {
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
  
  .channel-item {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: background 0.1s;
  }
  
  .channel-item:hover,
  .channel-item.highlighted {
    background: var(--bg-hover);
  }
  
  .channel-item.selected {
    background: var(--primary-bg);
  }
  
  .channel-item input[type="checkbox"] {
    margin-right: 0.5rem;
  }
  
  .channel-name {
    flex: 1;
    font-size: 0.875rem;
  }
  
  .favorite-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1rem;
    transition: color 0.2s;
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
  
  .channel-dropdown::-webkit-scrollbar {
    width: 8px;
  }
  
  .channel-dropdown::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }
  
  .channel-dropdown::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .channel-dropdown::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
</style>