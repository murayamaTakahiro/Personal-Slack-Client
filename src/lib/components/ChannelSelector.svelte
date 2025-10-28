<script lang="ts">
  import { onMount, onDestroy, afterUpdate, createEventDispatcher, tick } from 'svelte';
  import { channelStore, favoriteChannels, recentChannelsList, sortedChannels, channelGroups } from '../stores/channels';
  import { realtimeStore } from '../stores/realtime';
  import { showToast } from '../stores/toast';
  import { channelSelectorOpen } from '../stores/ui';
  import { accessKeyService } from '../services/accessKeyService';

  export let value = '';  // Currently selected channel(s)
  export let channels: [string, string][] = [];
  export let onEnterKey: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  // Access key registration IDs for cleanup
  let accessKeyRegistrations: string[] = [];

  // Track previous state to detect changes for access key re-registration
  let previousMode: string | undefined = undefined;
  let previousSelectedChannelsLength = 0;
  let previousFavoriteChannelsLength = 0;

  let searchInput = '';

  // Helper function to check if a channel is a DM or Group DM
  function isDMChannel(channelName: string): boolean {
    return channelName.startsWith('@') || channelName.startsWith('👥');
  }
  let showDropdown = false;
  let highlightedIndex = -1;
  let inputElement: HTMLInputElement;
  let dropdownElement: HTMLDivElement;

  // Button references for access keys
  let modeToggleButton: HTMLButtonElement;
  let favoritesButton: HTMLButtonElement;
  let recentButton: HTMLButtonElement;
  let realtimeToggleButton: HTMLButtonElement;  // LIVE/STOP toggle button
  let applyButtonInline: HTMLButtonElement;  // Apply button in selected-channels section
  let applyButtonDropdown: HTMLButtonElement;  // Apply button in dropdown footer
  
  $: mode = $channelStore.selectionMode;
  $: selectedChannels = $channelStore.selectedChannels;
  
  // Sync dropdown state with UI store
  $: channelSelectorOpen.set(showDropdown);
  
  // Sync searchInput when value is cleared externally (e.g., workspace switch)
  // Only clear searchInput if the component is not focused
  $: if (value === '' && searchInput !== '' && inputElement && document.activeElement !== inputElement) {
    searchInput = '';
  }
  
  // Filter channels based on search input
  $: filteredChannels = searchInput
    ? $sortedChannels.filter(ch => 
        ch.name.toLowerCase().includes(searchInput.toLowerCase())
      )
    : $sortedChannels;
  
  // Group channels for display
  // When no search results found, fall back to showing all channels to maintain UI structure
  $: displayChannels = filteredChannels.length === 0 && searchInput ? $sortedChannels : filteredChannels;

  $: groupedChannels = {
    favorites: displayChannels.filter(ch => ch.isFavorite),
    recent: $recentChannelsList.filter(ch =>
      !ch.isFavorite && displayChannels.some(fc => fc.id === ch.id)
    ).slice(0, 5),
    all: displayChannels.filter(ch =>
      !ch.isFavorite && !$recentChannelsList.some(rc => rc.id === ch.id)
    )
  };
  
  // Create a flat array that matches the visual order for index mapping
  $: flatChannelList = [
    ...groupedChannels.favorites,
    ...groupedChannels.recent,
    ...groupedChannels.all
  ];

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

      // Ctrl+F or Cmd+F to select all favorite channels
      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && !event.shiftKey) {
        event.preventDefault();
        selectAllFavorites();
        return;
      }

      // Note: Ctrl+L is now handled globally for Live mode

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

    // Initial setup of access keys
    tick().then(() => {
      setupAccessKeys();
    });

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });

  /**
   * Setup access keys for ChannelSelector buttons
   */
  function setupAccessKeys() {
    const registrations: string[] = [];

    console.log('[ChannelSelector] Setting up access keys, button refs:', {
      modeToggleButton: !!modeToggleButton,
      favoritesButton: !!favoritesButton,
      recentButton: !!recentButton,
      realtimeToggleButton: !!realtimeToggleButton,
      applyButtonInline: !!applyButtonInline,
      applyButtonDropdown: !!applyButtonDropdown
    });

    // 1: Mode toggle button (leftmost button)
    if (modeToggleButton) {
      const id = accessKeyService.register('1', modeToggleButton, () => {
        toggleMode();
      }, 10);
      if (id) registrations.push(id);
    }

    // 2: Favorites button (center ⭐ button)
    if (favoritesButton) {
      const id = accessKeyService.register('2', favoritesButton, () => {
        selectAllFavorites();
      }, 10);
      if (id) registrations.push(id);
    }

    // 3: Recent usage button (rightmost 🕒 button)
    if (recentButton) {
      const id = accessKeyService.register('3', recentButton, () => {
        selectRecentChannels();
      }, 10);
      if (id) registrations.push(id);
    }

    // 4: Realtime toggle button (LIVE/STOP button, only in multi-select mode)
    if (realtimeToggleButton && mode === 'multi' && selectedChannels.length > 0) {
      const id = accessKeyService.register('4', realtimeToggleButton, () => {
        console.log('[ChannelSelector] Access key 4 pressed: toggle realtime mode');
        realtimeToggleButton.click();
      }, 10);
      if (id) registrations.push(id);
    }

    // 7: Apply button (multi-select mode only) - inline or dropdown version
    const applyButton = applyButtonInline || applyButtonDropdown;
    if (applyButton && mode === 'multi' && selectedChannels.length > 0) {
      const id = accessKeyService.register('7', applyButton, () => {
        console.log('[ChannelSelector] Access key 7 pressed: applyMultiSelect');
        applyMultiSelect();
      }, 10);
      if (id) registrations.push(id);
    }

    accessKeyRegistrations = registrations;
    console.log(`[ChannelSelector] Registered ${registrations.length} access keys`);
  }

  /**
   * Cleanup access keys
   */
  function cleanupAccessKeys() {
    accessKeyRegistrations.forEach(id => {
      accessKeyService.unregister(id);
    });
    accessKeyRegistrations = [];
    console.log('[ChannelSelector] Cleaned up access keys');
  }

  // Re-setup access keys when mode, selection, or favorites change
  afterUpdate(() => {
    const currentFavoritesLength = $favoriteChannels?.length ?? 0;
    const currentSelectedLength = selectedChannels?.length ?? 0;

    if (previousMode !== mode ||
        previousSelectedChannelsLength !== currentSelectedLength ||
        previousFavoriteChannelsLength !== currentFavoritesLength) {

      console.log('[ChannelSelector] State changed, re-registering access keys:', {
        mode: `${previousMode} -> ${mode}`,
        selected: `${previousSelectedChannelsLength} -> ${currentSelectedLength}`,
        favorites: `${previousFavoriteChannelsLength} -> ${currentFavoritesLength}`
      });

      previousMode = mode;
      previousSelectedChannelsLength = currentSelectedLength;
      previousFavoriteChannelsLength = currentFavoritesLength;

      tick().then(() => {
        cleanupAccessKeys();
        setupAccessKeys();
      });
    }
  });

  onDestroy(() => {
    cleanupAccessKeys();
  });
  
  function handleInputFocus() {
    showDropdown = true;

    // Auto-highlight first item in ALL CHANNELS section for better visibility
    tick().then(() => {
      if (!searchInput) {
        // Only auto-highlight when there's no search query
        const targetIndex = getFirstAllChannelsIndex();
        if (targetIndex >= 0 && filteredChannels.length > 0) {
          highlightedIndex = targetIndex;
          scrollToHighlighted();
        }
      } else {
        highlightedIndex = -1;
      }
    });
  }
  
  function handleInput(event: Event) {
    // Update searchInput from the event target
    const target = event.target as HTMLInputElement;
    searchInput = target.value;
    
    // Open dropdown when user starts typing
    if (!showDropdown) {
      showDropdown = true;
    }
    // Reset highlight when search changes
    highlightedIndex = -1;
  }
  
  // Export function for keyboard shortcut integration
  export function toggleDropdown() {
    showDropdown = !showDropdown;
    if (showDropdown && inputElement) {
      inputElement.focus();

      // Auto-highlight for visibility
      tick().then(() => {
        if (!searchInput) {
          const targetIndex = getFirstAllChannelsIndex();
          if (targetIndex >= 0 && filteredChannels.length > 0) {
            highlightedIndex = targetIndex;
            scrollToHighlighted();
          }
        }
      });
    } else {
      highlightedIndex = -1;
    }
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
          const channel = flatChannelList[highlightedIndex];
          if (channel) {
            selectChannel(channel.id, channel.name);
          }
        } else if (mode === 'multi' && selectedChannels.length > 0) {
          // If nothing is highlighted but channels are selected, apply the selection
          applyMultiSelect();
        }
        break;
        
      case 'f':
      case 'F':
        // Toggle favorite for highlighted channel
        if (highlightedIndex >= 0 && highlightedIndex < totalItems) {
          event.preventDefault();
          event.stopPropagation();
          const channel = flatChannelList[highlightedIndex];
          if (channel) {
            channelStore.toggleFavorite(channel.id);
            // Show visual feedback
            showFavoriteToggleFeedback(channel.name, !channel.isFavorite);
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
  
  // Handle keyboard events on the dropdown (for when focus is on favorite buttons)
  function handleDropdownKeydown(event: KeyboardEvent) {
    // Handle 'f' key for favorite toggle when dropdown has focus
    if (event.key === 'f' || event.key === 'F') {
      if (highlightedIndex >= 0 && highlightedIndex < flatChannelList.length) {
        event.preventDefault();
        event.stopPropagation();
        const channel = flatChannelList[highlightedIndex];
        if (channel) {
          channelStore.toggleFavorite(channel.id);
          showFavoriteToggleFeedback(channel.name, !channel.isFavorite);
        }
      }
    }
    // Handle Esc key when focus is on any element within the dropdown
    else if (event.key === 'Escape') {
      event.preventDefault();
      showDropdown = false;
      highlightedIndex = -1;
      // Return focus to input
      if (inputElement) {
        inputElement.focus();
      }
    }
    // Handle Tab key to close dropdown and move to next component
    else if (event.key === 'Tab') {
      // Close dropdown but let Tab move focus naturally to next component
      showDropdown = false;
      highlightedIndex = -1;
    }
  }
  
  function scrollToHighlighted() {
    if (highlightedIndex < 0) return;

    const items = dropdownElement?.querySelectorAll('.channel-item');
    if (items && items[highlightedIndex]) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function getFirstAllChannelsIndex(): number {
    // Calculate index of first item in "ALL CHANNELS" section
    const favCount = groupedChannels.favorites.length;
    const recentCount = groupedChannels.recent.length;

    // If there are items in ALL CHANNELS section
    if (groupedChannels.all.length > 0) {
      return favCount + recentCount;
    }

    // Fallback to first item if ALL CHANNELS is empty
    return 0;
  }
  
  function showFavoriteToggleFeedback(channelName: string, isNowFavorite: boolean) {
    const message = isNowFavorite 
      ? `⭐ Added #${channelName} to favorites`
      : `☆ Removed #${channelName} from favorites`;
    showToast(message, 'success');
  }
  
  function selectChannel(channelId: string, channelName: string) {
    if (mode === 'multi') {
      // For multi-select, we'll need to handle this differently
      // For now, use the name for regular channels and ID for DM/Group DM channels
      const valueToUse = isDMChannel(channelName) ? channelId : channelName;
      channelStore.toggleChannelSelection(valueToUse);
      // Keep dropdown open in multi-select mode so user can see Apply Selection button
      // Don't update searchInput to keep it clear for further searching
    } else {
      // For DM channels (starting with @ or 👥), use the channel ID for search
      // but display the name in the input
      const channelValue = isDMChannel(channelName) ? channelId : channelName;
      value = channelValue;
      searchInput = channelName; // Always show the name in the input
      showDropdown = false;
      channelStore.addToRecent(channelName); // Store by name for display
      dispatch('change', { channel: channelValue }); // Pass the ID for DM/Group DM channels
    }
  }
  
  function toggleFavorite(channelId: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    channelStore.toggleFavorite(channelId);
    // Return focus to the input element after toggling favorite
    if (inputElement) {
      inputElement.focus();
    }
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
  
  export function toggleLiveMode() {
    // Always allow toggling Live mode, regardless of channel selection
    if ($realtimeStore.isEnabled) {
      // If Live mode is currently enabled, disable it
      realtimeStore.setEnabled(false);
      showToast('info', 'Live mode disabled');
    } else {
      // If Live mode is currently disabled, enable it
      // Only enable if channels are selected in multi mode
      if (mode === 'multi' && selectedChannels.length > 0) {
        realtimeStore.setEnabled(true);
        dispatch('enableRealtime');
        showToast('success', 'Live mode enabled');
      } else {
        // Can't enable without channels selected
        showToast('warning', 'Select channels first to enable Live mode');
      }
    }
  }
  
  function applyMultiSelect() {
    const channelString = selectedChannels.join(',');
    value = channelString;
    // Clear search input to allow further searching
    searchInput = '';
    showDropdown = false;
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
        value={searchInput}
        on:focus={handleInputFocus}
        on:input={handleInput}
        on:keydown={handleInputKeydown}
        placeholder={mode === 'multi' 
          ? (selectedChannels.length > 0 
            ? `Search to add more (${selectedChannels.length} selected)`
            : 'Search channels (multi-select)') 
          : 'Search or select a channel'}
        title="Use arrow keys to navigate, Enter to select, 'f' to toggle favorite (Ctrl+Shift+C to focus)"
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
        bind:this={modeToggleButton}
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
          bind:this={favoritesButton}
          on:click={selectAllFavorites}
          class="select-favorites"
          title="お気に入りチャンネルを全選択 (Ctrl+F)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      {/if}

      <button
        bind:this={recentButton}
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
              {group.name}
            </button>
          {/each}
        </div>
      {/if}
      
      {#if mode === 'multi' && selectedChannels.length > 0}
        <button
          bind:this={realtimeToggleButton}
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
        title="Apply selected channels to search (Ctrl+Shift+A)"
      >
        Apply ({selectedChannels.length})
      </button>
    </div>
  {/if}
  
  {#if showDropdown}
    <div bind:this={dropdownElement} class="channel-dropdown" on:keydown={handleDropdownKeydown}>
      {#if showDropdown && filteredChannels.length > 0}
        <div class="dropdown-help">
          <span class="help-text">↑↓ Navigate • Enter Select • f Toggle Favorite</span>
        </div>
      {/if}
      
      {#if groupedChannels.favorites.length > 0}
        <div class="channel-group">
          <div class="group-header">⭐ Favorites</div>
          {#each groupedChannels.favorites as channel, index}
            <div
              class="channel-item"
              class:highlighted={highlightedIndex === index}
              class:selected={mode === 'multi' ? selectedChannels.includes(isDMChannel(channel.name) ? channel.id : channel.name) : value === (isDMChannel(channel.name) ? channel.id : channel.name)}
              on:click={() => selectChannel(channel.id, channel.name)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(isDMChannel(channel.name) ? channel.id : channel.name)}
                  on:click|stopPropagation={() => channelStore.toggleChannelSelection(isDMChannel(channel.name) ? channel.id : channel.name)}
                />
              {/if}
              <span class="channel-name">{isDMChannel(channel.name) ? channel.name : '#' + channel.name}</span>
              <button
                on:click={(e) => toggleFavorite(channel.id, e)}
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
      
      {#if groupedChannels.recent.length > 0}
        <div class="channel-group">
          <div class="group-header">RECENT</div>
          {#each groupedChannels.recent as channel, index}
            {@const actualIndex = groupedChannels.favorites.length + index}
            <div
              class="channel-item"
              class:highlighted={highlightedIndex === actualIndex}
              class:selected={mode === 'multi' ? selectedChannels.includes(isDMChannel(channel.name) ? channel.id : channel.name) : value === (isDMChannel(channel.name) ? channel.id : channel.name)}
              on:click={() => selectChannel(channel.id, channel.name)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(isDMChannel(channel.name) ? channel.id : channel.name)}
                  on:click|stopPropagation={() => channelStore.toggleChannelSelection(isDMChannel(channel.name) ? channel.id : channel.name)}
                />
              {/if}
              <span class="channel-name">{isDMChannel(channel.name) ? channel.name : '#' + channel.name}</span>
              <button
                on:click={(e) => toggleFavorite(channel.id, e)}
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
      
      {#if groupedChannels.all.length > 0}
        <div class="channel-group">
          <div class="group-header">All Channels</div>
          {#each groupedChannels.all as channel, index}
            {@const actualIndex = groupedChannels.favorites.length + groupedChannels.recent.length + index}
            <div
              class="channel-item"
              class:highlighted={highlightedIndex === actualIndex}
              class:selected={mode === 'multi' ? selectedChannels.includes(isDMChannel(channel.name) ? channel.id : channel.name) : value === (isDMChannel(channel.name) ? channel.id : channel.name)}
              on:click={() => selectChannel(channel.id, channel.name)}
            >
              {#if mode === 'multi'}
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(isDMChannel(channel.name) ? channel.id : channel.name)}
                  on:click|stopPropagation={() => channelStore.toggleChannelSelection(isDMChannel(channel.name) ? channel.id : channel.name)}
                />
              {/if}
              <span class="channel-name">{isDMChannel(channel.name) ? channel.name : '#' + channel.name}</span>
              <button
                on:click={(e) => toggleFavorite(channel.id, e)}
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
      
      {#if filteredChannels.length === 0 && searchInput}
        <div class="no-results-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          No channels found matching "{searchInput}"
        </div>
      {/if}
      
      {#if mode === 'multi' && selectedChannels.length > 0}
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
    min-height: 400px;
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

  .no-results-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    margin: 0.5rem;
    background: var(--bg-secondary);
    border: 1px dashed var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-align: center;
  }

  .no-results-banner svg {
    flex-shrink: 0;
    opacity: 0.7;
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
</style>