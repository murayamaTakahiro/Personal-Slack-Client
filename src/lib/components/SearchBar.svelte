<script lang="ts">
  import { searchQuery, searchParams, searchLoading, searchProgress, selectedMessage, searchError } from '../stores/search';
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import ChannelSelector from './ChannelSelector.svelte';
  import UserSelector from './UserSelector.svelte';
  import SavedSearchManager from './SavedSearchManager.svelte';
  import { savedSearchesStore } from '../stores/savedSearches';
  import { showToast } from '../stores/toast';
  import { getKeyboardService } from '../services/keyboardService';
  import { userService } from '../services/userService';
  import { realtimeStore } from '../stores/realtime';
  import { channelStore, favoriteChannels, recentChannelsList } from '../stores/channels';
  import { getThreadFromUrl, getUnmutedMemberChannels, markMessageAsRead } from '../api/slack';
  import { isPostDialogOpen } from '../stores/postDialog';
  import UrlHistoryManager from './UrlHistoryManager.svelte';
  import { urlHistoryStore } from '../stores/urlHistory';
  import SearchKeywordHistory from './SearchKeywordHistory.svelte';
  import { searchKeywordHistoryStore } from '../stores/searchKeywordHistory';
  import BookmarkManager from './BookmarkManager.svelte';
  import { bookmarkStore } from '../stores/bookmarks';

  export let channels: [string, string][] = [];
  export let showAdvanced = true;
  
  const dispatch = createEventDispatcher();
  
  let channel = '';
  let user = '';
  let userId = '';  // Store the actual user ID
  let userIds: string[] = [];  // Store multiple user IDs for multi-select
  let fromDate = '';
  let toDate = '';
  let limit = 1000;
  let hasFiles = false;  // Filter messages with attachments
  let searchInput: HTMLInputElement;
  let showChannelSelector = false;
  let channelSelectorComponent: ChannelSelector;
  let userSelectorComponent: UserSelector;
  let urlInput = '';
  let urlLoading = false;
  let urlInputElement: HTMLInputElement;
  let showSavedSearches = false;
  let savedSearchButton: HTMLButtonElement;
  let savedSearchKey = 0; // Key to force component recreation
  let showUrlHistory = false;
  let urlHistoryButton: HTMLButtonElement;
  let showKeywordHistory = false;
  let keywordHistoryButton: HTMLButtonElement;
  let showBookmarks = false;
  let bookmarkButton: HTMLButtonElement;
  let catchUpLoading = false;
  let showFromDateTooltip = false;
  let isTodaysCatchupSearch = false; // Flag to prevent recent channel updates during Today's Catchup

  // Keep local filter values in sync with searchParams store
  // This ensures filters persist when dialogs are opened/closed or focus changes
  $: if ($searchParams && !$searchLoading) {
    // Only sync if we're not currently loading (to avoid race conditions)
    if ($searchParams.channel !== undefined && channel !== $searchParams.channel) {
      channel = $searchParams.channel || '';
    }
    if ($searchParams.user !== undefined && userId !== $searchParams.user) {
      userId = $searchParams.user || '';
    }
    // CRITICAL: Sync isTodaysCatchup flag from searchParams
    // This ensures refresh (Ctrl+Shift+R) preserves the flag
    if ($searchParams.isTodaysCatchup !== undefined) {
      isTodaysCatchupSearch = $searchParams.isTodaysCatchup;
    }
  }
  
  async function handleSearch(isRealtimeUpdate: boolean = false) {
    // If realtime mode is enabled (for both initial and updates), auto-set today's date
    // This ensures we always search for today's messages in Live mode
    if ($realtimeStore.isEnabled) {
      // Use local date instead of UTC to get today in user's timezone
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      fromDate = `${year}-${month}-${day}`;

      // Don't set toDate - we want all messages from today onward
      toDate = '';
      // Clear query for realtime mode to focus on channel-based filtering
      searchQuery.set('');
    }

    // Check if we have either a query or at least one filter
    const hasFilters = channel || userId || fromDate || toDate;
    const hasQuery = $searchQuery.trim();

    if (hasQuery || hasFilters) {
      // Save keyword to history if it's a non-empty query
      if (hasQuery && !isRealtimeUpdate) {
        searchKeywordHistoryStore.saveKeyword(hasQuery);
      }
      // Save to saved searches if not a duplicate
      const searchToSave = {
        query: $searchQuery.trim() || undefined,
        channel: channel || undefined,
        userId: userId || undefined,
        userName: user || undefined,  // Save the display name
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit,
        hasFiles: hasFiles === true ? true : undefined  // Only send true when explicitly checked
      };
      
      // Check for duplicate before auto-saving
      const duplicate = savedSearchesStore.isDuplicate(searchToSave);
      if (!duplicate && !isRealtimeUpdate) {
        // Auto-save search (without prompting for name)
        savedSearchesStore.saveSearch(searchToSave);
      } else if (duplicate && !isRealtimeUpdate) {
        // Increment usage count for duplicate
        savedSearchesStore.useSearch(duplicate.id);
      }
      // Resolve user input to user ID if needed
      let resolvedUserId = userId;
      if (user && !userId) {
        // User typed something manually, try to resolve it
        resolvedUserId = await userService.resolveUserToId(user) || '';
      }

      // Clean up channel - remove # symbol if present
      let cleanChannel = channel.trim();
      if (cleanChannel.startsWith('#')) {
        cleanChannel = cleanChannel.substring(1);
      }

      // Record channel usage for recent channels tracking
      // Skip this for Today's Catchup to ensure consistent search history keys
      if (cleanChannel && !isTodaysCatchupSearch) {
        // For multi-channel mode, channel might be comma-separated
        const channelList = cleanChannel.split(',').map(ch => ch.trim());
        channelList.forEach(ch => {
          if (ch) {
            channelStore.addToRecent(ch);
          }
        });
      }

      // Fix date handling to be inclusive
      // Send dates as YYYY-MM-DD strings directly to backend
      // Backend will handle the inclusive search logic
      const params = {
        query: $searchQuery.trim() || undefined,  // Make query optional
        channel: cleanChannel || undefined,
        user: resolvedUserId || undefined,
        userName: user || undefined,  // Include the display name
        fromDate: fromDate || undefined,  // Send as string YYYY-MM-DD
        toDate: toDate || undefined,      // Send as string YYYY-MM-DD
        limit,
        hasFiles: hasFiles === true ? true : undefined,  // Only send true when explicitly checked
        isRealtimeUpdate, // Pass this flag through
        lastSearchTimestamp: isRealtimeUpdate ? realtimeStore.getLastSearchTimestamp() : undefined, // For incremental updates
        isTodaysCatchup: isTodaysCatchupSearch  // Flag for Today's Catchup searches
      };
      searchParams.set(params);
      dispatch('search', params);
    }
  }
  
  async function handleUrlPaste() {
    if (!urlInput.trim()) return;

    urlLoading = true;
    searchError.set(null);

    try {
      const thread = await getThreadFromUrl(urlInput);
      selectedMessage.set(thread.parent);

      // Save URL to history
      await urlHistoryStore.saveUrl(urlInput);

      urlInput = '';
    } catch (err) {
      let errorMessage = 'Failed to load thread from URL';
      if (err instanceof Error) {
        errorMessage = err.message;
        // Extract more specific error details if available
        if (err.message.includes('Invalid Slack URL')) {
          errorMessage = 'Invalid Slack URL format. Please paste a valid Slack message link.';
        } else if (err.message.includes('Authentication') || err.message.includes('No Slack token')) {
          errorMessage = 'Authentication failed. Please check your Slack token in Settings.';
        } else if (err.message.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.message.includes('not found')) {
          errorMessage = 'Thread not found. The message may have been deleted or you may not have access.';
        }
      }
      searchError.set(errorMessage);
      console.error('URL parse error:', err);
    } finally {
      urlLoading = false;
    }
  }

  // Export for external triggering (from App.svelte for realtime updates)
  export function triggerRealtimeSearch() {
    // Preserve all current filters from searchParams when doing realtime updates
    // This fixes the bug where filters get cleared after keyboard actions (P, T, R, Ctrl+,)
    const currentParams = $searchParams;
    if (currentParams) {
      // Restore filters from searchParams if local values are empty
      // This ensures filters persist across dialog opens/closes and keyboard actions
      if (currentParams.channel && !channel) {
        channel = currentParams.channel;
      }
      if (currentParams.user && !userId) {
        userId = currentParams.user;
      }
      // Note: fromDate and toDate are set fresh in handleSearch for realtime mode
    }
    // Pass isRealtimeUpdate: true to enable reconciliation even for initial search
    // This ensures smooth updates without visible refresh
    handleSearch(true);
  }
  
  function handleKeydown(e: KeyboardEvent) {
    // Don't handle keys if export dialog is open
    if (document.querySelector('.export-dialog')) {
      return;
    }

    // Handle arrow keys for keyword history navigation
    if (showKeywordHistory && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      // Let the SearchKeywordHistory component handle navigation
      return;
    }

    // Handle Enter for search when this input has focus
    // Focus-based isolation: this input handles Enter independently
    if (e.key === 'Enter' && !$searchLoading) {
      // Prevent default form submission behavior and stop event propagation
      e.preventDefault();
      e.stopPropagation();
      handleSearch();
    }
  }

  function toggleKeywordHistory() {
    showKeywordHistory = !showKeywordHistory;
    if (!showKeywordHistory) {
      // Return focus to the button when closing
      if (keywordHistoryButton) {
        keywordHistoryButton.focus();
      }
    }
  }

  function handleKeywordSelect(event: CustomEvent<{ keyword: string }>) {
    searchQuery.set(event.detail.keyword);
    showKeywordHistory = false;
    // Focus back on search input
    if (searchInput) {
      searchInput.focus();
    }
  }

  function closeKeywordHistory() {
    showKeywordHistory = false;
    // Return focus to the button when closing
    if (keywordHistoryButton) {
      keywordHistoryButton.focus();
    }
  }

  function handleBookmarkSelect(event: CustomEvent<{
    messageTs: string;
    channelId: string;
    channelName: string;  // BookmarkManagerから追加で受け取る
    timestamp: Date;       // BookmarkManagerから追加で受け取る
  }>) {
    const { messageTs, channelId, channelName, timestamp } = event.detail;
    showBookmarks = false;

    console.log('[SearchBar] Bookmark selected', { messageTs, channelId, channelName, timestamp });

    // メッセージの日付を取得
    const messageDate = new Date(parseFloat(messageTs) * 1000);
    const dateStr = messageDate.toISOString().split('T')[0]; // YYYY-MM-DD形式

    console.log('[SearchBar] Setting filters', { channel: channelName, fromDate: dateStr, toDate: dateStr });

    // チャンネルと日付でフィルタを設定
    channel = channelName;
    fromDate = dateStr;
    toDate = dateStr;

    // 検索完了後にメッセージにフォーカス
    // searchLoadingの変化を監視して、loadingがfalseになったらfocusを実行
    let hasStartedLoading = false;
    const unsubscribe = searchLoading.subscribe(isLoading => {
      if (isLoading) {
        hasStartedLoading = true;
      } else if (hasStartedLoading) {
        // 検索が完了した（loading: true → false）
        console.log('[SearchBar] Search completed, dispatching focusMessage event');
        // 少し遅延させて、検索結果が確実に反映されてから実行
        setTimeout(() => {
          dispatch('focusMessage', { messageTs });
        }, 100);
        unsubscribe();
      }
    });

    // 検索を実行
    console.log('[SearchBar] Executing search');
    handleSearch();
  }

  function closeBookmarks() {
    showBookmarks = false;
    // Return focus to the button when closing
    if (bookmarkButton) {
      bookmarkButton.focus();
    }
  }

  // Helper function to group messages by channel
  function groupMessagesByChannel(messages: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const msg of messages) {
      if (!grouped[msg.channel]) {
        grouped[msg.channel] = [];
      }
      grouped[msg.channel].push(msg);
    }

    // Sort messages by timestamp (newest first) within each channel
    for (const channelId in grouped) {
      grouped[channelId].sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
    }

    return grouped;
  }

  // Today's Catch Up handler
  async function handleTodaysCatchUp() {
    catchUpLoading = true;

    try {
      // Step 1: Fetch unmuted member channels (1-2 seconds)
      console.log('[CatchUp] Fetching unmuted channels...');
      const unmutedChannels = await getUnmutedMemberChannels();

      if (unmutedChannels.length === 0) {
        showToast('No unmuted channels found', 'info');
        return;
      }

      console.log(`[CatchUp] Found ${unmutedChannels.length} unmuted channels`);

      // Step 2: Prioritize favorites + recent (max 30 channels)
      const favoriteIds = $favoriteChannels.map(ch => ch.id);
      const recentIds = $recentChannelsList.map(ch => ch.id);

      const priorityChannels = unmutedChannels
        .filter(([id]) => favoriteIds.includes(id) || recentIds.includes(id))
        .slice(0, 30);

      const targetChannels = priorityChannels.length > 0
        ? priorityChannels
        : unmutedChannels.slice(0, 30);

      console.log(`[CatchUp] Targeting ${targetChannels.length} channels (${priorityChannels.length} priority)`);

      // Step 3: Set today's date for search
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      channel = targetChannels.map(([_, name]) => name).join(',');
      fromDate = dateStr;
      toDate = dateStr;

      console.log(`[CatchUp] Searching messages from ${dateStr} in ${targetChannels.length} channels`);
      showToast(`Searching ${targetChannels.length} channels...`, 'info');

      // Step 4: Set flag to prevent recent channel updates (ensures consistent search history keys)
      isTodaysCatchupSearch = true;

      // Step 5: Execute search using existing functionality
      await handleSearch();

      // Step 5: Mark latest message in each channel as read
      // Wait for search results to be available
      await tick();

      // Group messages by channel
      const currentSearchParams = $searchParams;
      if (currentSearchParams && currentSearchParams.messages) {
        const messagesGroupedByChannel = groupMessagesByChannel(currentSearchParams.messages);

        let markedCount = 0;
        for (const [channelId, messages] of Object.entries(messagesGroupedByChannel)) {
          if (messages.length > 0) {
            const latestMessage = messages[0]; // Already sorted newest first
            try {
              await markMessageAsRead(channelId, latestMessage.ts);
              markedCount++;
              console.log(`[CatchUp] Marked ${channelId} as read at ${latestMessage.ts}`);
            } catch (err) {
              console.warn(`[CatchUp] Failed to mark ${channelId} as read:`, err);
              // Continue with other channels even if one fails
            }
          }
        }

        console.log(`[CatchUp] Marked ${markedCount}/${Object.keys(messagesGroupedByChannel).length} channels as read`);
      }

      showToast(`✅ Caught up on ${targetChannels.length} channels!`, 'success');

    } catch (error) {
      console.error('[CatchUp] Failed:', error);
      showToast('Failed to catch up. Please try again.', 'error');
    } finally {
      catchUpLoading = false;
      isTodaysCatchupSearch = false; // Reset flag
    }
  }

  // Store the last valid date values to restore if needed
  let lastValidFromDate = '';
  let lastValidToDate = '';

  function toggleUrlHistory() {
    showUrlHistory = !showUrlHistory;
    if (showUrlHistory) {
      showSavedSearches = false;
      // The UrlHistoryManager component will handle focus in its onMount
    } else {
      // Return focus to the button when closing
      if (urlHistoryButton) {
        urlHistoryButton.focus();
      }
    }
  }

  function handleUrlSelect(event: CustomEvent<{ url: string }>) {
    urlInput = event.detail.url;
    showUrlHistory = false;
    // Automatically load the selected URL
    handleUrlPaste();
  }

  function closeUrlHistory() {
    showUrlHistory = false;
    // Return focus to the button when closing
    if (urlHistoryButton) {
      urlHistoryButton.focus();
    }
  }
  
  // Helper function to get the maximum day for a given month/year
  function getMaxDayInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }
  
  // Helper function to adjust date when it would be invalid
  function adjustDateForValidRange(year: number, month: number, day: number): { year: number; month: number; day: number } {
    // Handle month overflow/underflow
    if (month > 12) {
      year += Math.floor((month - 1) / 12);
      month = ((month - 1) % 12) + 1;
    } else if (month < 1) {
      year -= Math.floor((12 - month) / 12);
      month = 12 - (Math.abs(month) % 12);
      if (month === 0) month = 12;
    }
    
    // Ensure day is valid for the month
    const maxDay = getMaxDayInMonth(year, month);
    if (day > maxDay) {
      day = maxDay;
    } else if (day < 1) {
      day = 1;
    }
    
    return { year, month, day };
  }
  
  function handleDateKeydown(e: KeyboardEvent) {
    // Don't handle keys if export dialog is open
    if (document.querySelector('.export-dialog')) {
      return;
    }

    const input = e.target as HTMLInputElement;
    const currentValue = input.value;

    // Handle arrow keys to prevent invalid date clearing
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && currentValue) {
      const dateParts = currentValue.split('-');
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts.map(Number);
        const currentMaxDay = getMaxDayInMonth(year, month);
        const isArrowUp = e.key === 'ArrowUp';
        const isArrowDown = e.key === 'ArrowDown';
        
        // Check if we're at a month boundary based on direction
        const atMonthBoundary = (isArrowUp && day === currentMaxDay) || (isArrowDown && day === 1);
        
        if (atMonthBoundary) {
          const increment = isArrowUp ? 1 : -1;
          let newDay = day + increment;
          let newMonth = month;
          let newYear = year;
          
          // Handle day overflow (e.g., Sep 30 -> Oct 1)
          if (newDay > currentMaxDay) {
            newDay = 1;
            newMonth++;
            if (newMonth > 12) {
              newMonth = 1;
              newYear++;
            }
          } else if (newDay < 1) {
            // Handle day underflow (e.g., Oct 1 -> Sep 30)
            newMonth--;
            if (newMonth < 1) {
              newMonth = 12;
              newYear--;
            }
            newDay = getMaxDayInMonth(newYear, newMonth);
          }
          
          // Validate and adjust the new date
          const adjusted = adjustDateForValidRange(newYear, newMonth, newDay);
          
          // Format and set the new date
          const formattedDate = `${adjusted.year}-${String(adjusted.month).padStart(2, '0')}-${String(adjusted.day).padStart(2, '0')}`;
          
          // Set the value immediately to prevent browser default behavior
          setTimeout(() => {
            if (input.id === 'fromDate') {
              fromDate = formattedDate;
            } else if (input.id === 'toDate') {
              toDate = formattedDate;
            }
          }, 0);
          
          // Prevent the default behavior that would clear the input
          e.preventDefault();
        }
      }
    } else if (e.key === 'Enter' && !$searchLoading) {
      // Handle Enter for search when this input has focus
      // Focus-based isolation: if this input has focus, we handle the event
      e.preventDefault();
      e.stopPropagation();
      handleSearch();
    }
    
    // Store the current valid value
    if (currentValue) {
      if (input.id === 'fromDate') {
        lastValidFromDate = currentValue;
      } else if (input.id === 'toDate') {
        lastValidToDate = currentValue;
      }
    }
  }
  
  function handleDateInput(e: Event) {
    const input = e.target as HTMLInputElement;
    
    // If the input becomes empty (which happens when an invalid date is entered)
    // restore the last valid value
    if (!input.value) {
      if (input.id === 'fromDate' && lastValidFromDate) {
        // Use a microtask to restore the value after the browser clears it
        Promise.resolve().then(() => {
          fromDate = lastValidFromDate;
        });
      } else if (input.id === 'toDate' && lastValidToDate) {
        Promise.resolve().then(() => {
          toDate = lastValidToDate;
        });
      }
    } else {
      // Update the last valid value
      if (input.id === 'fromDate') {
        lastValidFromDate = input.value;
      } else if (input.id === 'toDate') {
        lastValidToDate = input.value;
      }
    }
  }
  
  function handleDateChange(e: Event) {
    const input = e.target as HTMLInputElement;
    
    // Update the last valid value on successful change
    if (input.value) {
      if (input.id === 'fromDate') {
        lastValidFromDate = input.value;
      } else if (input.id === 'toDate') {
        lastValidToDate = input.value;
      }
    }
  }

  function handleUrlKeydown(e: KeyboardEvent) {
    // Don't handle keys if export dialog is open
    if (document.querySelector('.export-dialog')) {
      return;
    }

    // Handle Enter (plain, no modifiers) for URL paste when this input has focus
    // Focus-based isolation: this input handles Enter independently
    if (e.key === 'Enter' && !urlLoading && urlInput.trim()) {
      // Prevent default form submission behavior and stop event propagation
      e.preventDefault();
      e.stopPropagation();
      handleUrlPaste();
    }
  }

  // Custom tooltip handlers for fromDate input
  function handleFromDateFocus() {
    showFromDateTooltip = true;
  }

  function handleFromDateBlur() {
    showFromDateTooltip = false;
  }
  
  // Check if search is possible
  $: canSearch = $searchQuery.trim() || channel || userId || user || fromDate || toDate;
  
  function toggleAdvanced() {
    showAdvanced = !showAdvanced;
  }
  
  function clearFilters() {
    channel = '';
    user = '';
    userId = '';
    fromDate = '';
    toDate = '';
    limit = 1000;
    hasFiles = false;
    // Reset Today's Catchup flag when filters are cleared
    isTodaysCatchupSearch = false;
    // Also clear the ChannelSelector component
    if (channelSelectorComponent) {
      channelSelectorComponent.clearSelection();
    }
    // Also clear the UserSelector component
    if (userSelectorComponent) {
      userSelectorComponent.clearSelection();
    }
  }
  
  // Exported methods for keyboard shortcuts
  export function focusSearchInput() {
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  export function focusUrlInput() {
    if (urlInputElement) {
      urlInputElement.focus();
      urlInputElement.select();
    }
  }
  
  export function toggleAdvancedSearch() {
    showAdvanced = !showAdvanced;
  }
  
  export function isAdvancedOpen() {
    return showAdvanced;
  }
  
  export function toggleChannelSelector() {
    if (channelSelectorComponent && channelSelectorComponent.toggleDropdown) {
      channelSelectorComponent.toggleDropdown();
    }
  }

  export function toggleLiveMode() {
    if (channelSelectorComponent && channelSelectorComponent.toggleLiveMode) {
      channelSelectorComponent.toggleLiveMode();
    }
  }

  export function focusUserSelector() {
    if (userSelectorComponent) {
      // Open dropdown to make the input visible and focus it
      userSelectorComponent.toggleDropdown();
    }
  }

  export function focusFromDate() {
    const fromDateInput = document.getElementById('fromDate') as HTMLInputElement;
    if (fromDateInput) {
      fromDateInput.focus();
    }
  }

  export function clearAllFilters() {
    // Clear all search filters
    channel = '';
    user = '';
    userId = '';
    fromDate = '';
    toDate = '';
    // Reset Today's Catchup flag when filters are cleared
    isTodaysCatchupSearch = false;

    // Clear the channel selector if it exists
    if (channelSelectorComponent && channelSelectorComponent.clearSelection) {
      channelSelectorComponent.clearSelection();
    }

    // Clear the user selector if it exists
    if (userSelectorComponent && userSelectorComponent.clearSelection) {
      userSelectorComponent.clearSelection();
    }

    // Also reset searchParams to ensure UI consistency
    searchParams.set({
      query: $searchQuery || '',
      limit: 1000
    });
  }
  
  // Keep the old function name for backward compatibility
  export function clearChannelSelection() {
    clearAllFilters();
  }
  
  // Set user for favorite user shortcuts
  export function setUser(userName: string, userIdValue: string) {
    user = userName;
    userId = userIdValue;
    
    // Update search params
    searchParams.update(params => ({
      ...params,
      user: userIdValue
    }));
  }
  
  // Saved search functions
  export function toggleSavedSearches() {
    showSavedSearches = !showSavedSearches;
    // Increment key to force component recreation if there were issues
    if (showSavedSearches) {
      savedSearchKey++;
    }
  }

  // Bookmark manager functions
  export function toggleBookmarks() {
    showBookmarks = !showBookmarks;
    if (!showBookmarks) {
      // Return focus to the button when closing
      if (bookmarkButton) {
        bookmarkButton.focus();
      }
    }
  }
  
  function handleSavedSearchLoad(event: CustomEvent) {
    const search = event.detail;

    // Load search parameters
    if (search.query !== undefined) searchQuery.set(search.query);
    if (search.channel !== undefined) channel = search.channel;
    if (search.userId !== undefined) {
      userId = search.userId;
      // Try to resolve user name
      userService.getUserById(search.userId).then(userInfo => {
        if (userInfo) {
          user = userInfo.name;
        }
      });
    }
    if (search.fromDate !== undefined) fromDate = search.fromDate;
    if (search.toDate !== undefined) toDate = search.toDate;
    if (search.limit !== undefined) limit = search.limit;
    if (search.hasFiles !== undefined) hasFiles = search.hasFiles;

    // Execute the search
    handleSearch();
  }
  
  export function saveCurrentSearch() {
    if (!$searchQuery.trim() && !channel && !userId && !fromDate && !toDate) {
      showToast('No search parameters to save', 'warning');
      return;
    }
    
    const name = prompt('Enter a name for this search:');
    if (!name) return;
    
    savedSearchesStore.saveSearch({
      name,
      query: $searchQuery.trim() || undefined,
      channel: channel || undefined,
      userId: userId || undefined,
      userName: user || undefined,  // Save the display name
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit
    });
    
    showToast(`Saved search: ${name}`, 'success');
  }
  
  // Setup keyboard handlers
  onMount(() => {
    const keyboardService = getKeyboardService();
    if (!keyboardService) return;

    // Execute Search (Enter key is already handled in input)
    // NOTE: allowInInput is set to false to prevent interference with INPUT elements
    // Individual input fields handle Enter key themselves (e.g., URL input, keyword search, date inputs)
    keyboardService.registerHandler('executeSearch', {
      action: () => {
        if (canSearch && !$searchLoading) {
          handleSearch();
        }
      },
      allowInInput: false // CRITICAL: Don't interfere with INPUT elements
    });

    // Clear Search
    keyboardService.registerHandler('clearSearch', {
      action: () => {
        if ($searchQuery || channel || userId || user || fromDate || toDate) {
          $searchQuery = '';
          clearFilters();
        }
      },
      allowInInput: true
    });

    // Today's Catch Up
    keyboardService.registerHandler('todaysCatchUp', {
      action: () => {
        if (!catchUpLoading) {
          handleTodaysCatchUp();
        }
      },
      allowInInput: false
    });

    // Toggle Keyword History
    keyboardService.registerHandler('toggleKeywordHistory', {
      action: () => {
        toggleKeywordHistory();
      },
      allowInInput: false
    });

    // Toggle URL History
    keyboardService.registerHandler('toggleUrlHistory', {
      action: () => {
        toggleUrlHistory();
      },
      allowInInput: false
    });

    // Focus User Selector
    keyboardService.registerHandler('focusUserSelector', {
      action: () => {
        focusUserSelector();
      },
      allowInInput: false
    });

    // Focus From Date
    keyboardService.registerHandler('focusFromDate', {
      action: () => {
        focusFromDate();
      },
      allowInInput: false
    });

    // Note: toggleSavedSearches and saveCurrentSearch handlers are now registered in App.svelte
    // to ensure proper timing and avoid conflicts
  });
  
  onDestroy(() => {
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.unregisterHandler('executeSearch');
      keyboardService.unregisterHandler('clearSearch');
      keyboardService.unregisterHandler('todaysCatchUp');
      keyboardService.unregisterHandler('toggleKeywordHistory');
      keyboardService.unregisterHandler('toggleUrlHistory');
      keyboardService.unregisterHandler('focusUserSelector');
      keyboardService.unregisterHandler('focusFromDate');
      // Note: toggleSavedSearches and saveCurrentSearch are handled by App.svelte
    }
  });
</script>

<div class="search-bar">
  <div class="search-main">
    <button
      on:click={toggleAdvanced}
      class="btn-toggle {showAdvanced ? 'active' : ''}"
      title="Toggle filters (Ctrl+Shift+F)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 4h18v2.172a2 2 0 0 1-.586 1.414l-6.828 6.828A2 2 0 0 0 13 15.828V20l-4 2v-6.172a2 2 0 0 0-.586-1.414L1.586 7.586A2 2 0 0 1 1 6.172V4z"/>
      </svg>
      {#if $searchQuery || urlInput || channel || user || fromDate || toDate}
        <span class="filter-indicator"></span>
      {/if}
    </button>

    <button
      on:click={handleTodaysCatchUp}
      class="btn-toggle catch-up-toggle"
      class:loading={catchUpLoading}
      class:disabled={catchUpLoading}
      title="Catch up on today's messages from unmuted channels (favorites + recent) (Ctrl+Shift+T)"
      disabled={catchUpLoading}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <circle cx="9" cy="10" r="1" fill="currentColor"/>
        <circle cx="12" cy="10" r="1" fill="currentColor"/>
        <circle cx="15" cy="10" r="1" fill="currentColor"/>
      </svg>
      {#if catchUpLoading}
        <span class="catch-up-loading">Catching up...</span>
      {:else}
        <span class="catch-up-text">📬</span>
      {/if}
    </button>

    <button
      bind:this={savedSearchButton}
      on:click={toggleSavedSearches}
      class="btn-toggle {showSavedSearches ? 'active' : ''}"
      title="Saved searches (Ctrl+/)"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 8.5l-7.5 7.5L9 11.5l-6 6"/>
        <path d="M21 8.5h-6"/>
        <path d="M21 8.5v6"/>
      </svg>
      {#if $savedSearchesStore.length > 0}
        <span class="saved-count">{$savedSearchesStore.length}</span>
      {/if}
    </button>

    <div class="bookmark-button-container">
      <button
        bind:this={bookmarkButton}
        on:click={toggleBookmarks}
        class="btn-toggle {showBookmarks ? 'active' : ''}"
        title="Bookmarked messages (Ctrl+B)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        {#if $bookmarkStore.length > 0}
          <span class="saved-count">{$bookmarkStore.length}</span>
        {/if}
      </button>

      {#if showBookmarks && bookmarkButton}
        <BookmarkManager
          on:select={handleBookmarkSelect}
          on:close={closeBookmarks}
          triggerElement={bookmarkButton}
        />
      {/if}
    </div>

    <button
      on:click={handleSearch}
      disabled={$searchLoading || (!$searchQuery.trim() && !channel && !user && !fromDate && !toDate)}
      class="btn-primary"
    >
      {#if $searchLoading}
        {#if $searchProgress}
          Searching {$searchProgress.channel || ''} ({$searchProgress.current}/{$searchProgress.total})
        {:else}
          Searching...
        {/if}
      {:else}
        Search
      {/if}
    </button>
  </div>
  
  {#if $searchLoading && $searchProgress && $searchProgress.total > 1}
    <div class="progress-bar">
      <div class="progress-fill" style="width: {($searchProgress.current / $searchProgress.total) * 100}%"></div>
      <div class="progress-text">
        チャンネル検索中: {$searchProgress.channel || 'Loading...'} ({$searchProgress.current}/{$searchProgress.total})
      </div>
    </div>
  {/if}

  {#if showAdvanced}
    <div class="search-advanced">
      <div class="search-section">
        <h3>Search & Thread URL</h3>
        
        <div class="input-group">
          <label>
            Search Keywords:
            <div class="keyword-input-container">
              <div class="keyword-input-wrapper">
                <input
                  type="text"
                  bind:this={searchInput}
                  bind:value={$searchQuery}
                  on:keydown={handleKeydown}
                  placeholder="Search messages... (optional with filters)"
                  disabled={$searchLoading}
                  class="search-input"
                />
                <button
                  bind:this={keywordHistoryButton}
                  on:click={toggleKeywordHistory}
                  class="btn-keyword-history {showKeywordHistory ? 'active' : ''}"
                  title="Search History (Ctrl+H)"
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {#if $searchKeywordHistoryStore.length > 0}
                    <span class="history-count">{$searchKeywordHistoryStore.length}</span>
                  {/if}
                </button>
              </div>
              {#if showKeywordHistory}
                <SearchKeywordHistory
                  isOpen={showKeywordHistory}
                  triggerElement={keywordHistoryButton}
                  on:select={handleKeywordSelect}
                  on:close={closeKeywordHistory}
                />
              {/if}
            </div>
          </label>
        </div>

        <div class="input-group">
          <label>
            Thread URL:
            <div class="url-input-container">
              <div class="url-input-wrapper">
                <input
                  type="text"
                  bind:this={urlInputElement}
                  bind:value={urlInput}
                  placeholder="Paste a Slack thread URL to view..."
                  on:keydown={handleUrlKeydown}
                  disabled={urlLoading}
                  class="url-input"
                />
                <button
                  bind:this={urlHistoryButton}
                  on:click={toggleUrlHistory}
                  class="btn-url-history {showUrlHistory ? 'active' : ''}"
                  title="URL History (Ctrl+T)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {#if $urlHistoryStore.length > 0}
                    <span class="history-count">{$urlHistoryStore.length}</span>
                  {/if}
                </button>
                <button
                  on:click={handleUrlPaste}
                  disabled={!urlInput.trim() || urlLoading}
                  class="btn-secondary"
                >
                  {urlLoading ? 'Loading...' : 'Load Thread'}
                </button>
              </div>
              {#if showUrlHistory}
                <UrlHistoryManager
                  on:select={handleUrlSelect}
                  on:close={closeUrlHistory}
                  onLoadUrl={handleUrlPaste}
                  hideSearchInput={true}
                  triggerElement={urlHistoryButton}
                />
              {/if}
            </div>
          </label>
        </div>
      </div>

      <div class="search-section">
        <h3>Filters</h3>
        
        {#if !$searchQuery.trim() && (channel || user || fromDate || toDate)}
          <div class="info-message">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>You can search with filters only - no search term required!</span>
          </div>
        {/if}
        
        {#if channel || user || fromDate || toDate || hasFiles}
          <div class="active-filters">
            <span class="filter-label">Active filters:</span>
            {#if channel}
              <span class="filter-tag">Channel: {channel}</span>
            {/if}
            {#if userId || user}
              <span class="filter-tag">User: {user || userId}</span>
            {/if}
            {#if fromDate}
              <span class="filter-tag">From: {fromDate}</span>
            {/if}
            {#if toDate}
              <span class="filter-tag">To: {toDate}</span>
            {/if}
            {#if hasFiles}
              <span class="filter-tag">📎 Has Attachments</span>
            {/if}
          </div>
        {/if}
        
        <div class="filter-row">
        <div class="filter-field">
          <label for="channel-selector" class="channel-label">Channel:</label>
          <ChannelSelector 
            id="channel-selector"
            bind:this={channelSelectorComponent}
            bind:value={channel}
            {channels}
            onEnterKey={handleSearch}
            on:change={(e) => {
              // Always use e.detail.channel if available (for both single and multi-select)
              if (e.detail.channel !== undefined) {
                channel = e.detail.channel;
              } else if (e.detail.channels) {
                // Fallback for multi-select mode (legacy)
                channel = e.detail.channels.join(',');
              } else {
                channel = '';
              }
            }}
            on:enableRealtime={() => {
              // When realtime mode is enabled, trigger an immediate search
              triggerRealtimeSearch();
            }}
          />
        </div>
        
        <div class="filter-field">
          <label for="user-selector">User:</label>
          <UserSelector
            id="user-selector"
            bind:this={userSelectorComponent}
            bind:value={userId}
            onEnterKey={handleSearch}
            on:change={(e) => {
              // Handle both single and multi-user selection
              if (e.detail.userIds && e.detail.userIds.length > 0) {
                // Multi-user selection
                userIds = e.detail.userIds;
                userId = e.detail.userId || '';  // Comma-separated user IDs
                user = e.detail.userName || '';
              } else {
                // Single user selection
                userIds = [];
                userId = e.detail.userId || '';
                user = e.detail.userName || '';
              }
            }}
          />
        </div>

        <div class="filter-field filter-checkbox">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={hasFiles}
            />
            <span class="checkbox-icon">📎</span>
            <span>Has Attachments</span>
          </label>
        </div>
      </div>
      
      <div class="filter-row">
        <label class="from-date-container">
          From:
          <input
            type="date"
            id="fromDate"
            name="fromDate"
            bind:value={fromDate}
            on:keydown={handleDateKeydown}
            on:input={handleDateInput}
            on:change={handleDateChange}
            on:focus={handleFromDateFocus}
            on:blur={handleFromDateBlur}
          />
          {#if showFromDateTooltip}
            <div class="from-date-tooltip">
              Press Ctrl+Shift+D to focus this field
            </div>
          {/if}
        </label>

        <label>
          To:
          <input
            type="date"
            id="toDate"
            name="toDate"
            bind:value={toDate}
            on:keydown={handleDateKeydown}
            on:input={handleDateInput}
            on:change={handleDateChange}
          />
        </label>
        
        <label>
          Max results:
          <input
            type="number"
            bind:value={limit}
            min="10"
            max="10000"
            step="10"
            on:keydown={handleKeydown}
          />
        </label>
      </div>
      
        <div class="filter-actions">
          <button on:click={clearFilters} class="btn-secondary">
            Clear filters
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Saved Search Manager -->
  {#if showSavedSearches && savedSearchButton}
    {#key savedSearchKey}
      <SavedSearchManager
        isOpen={showSavedSearches}
        position={{
          top: savedSearchButton?.getBoundingClientRect().bottom + 5 || 100,
          left: savedSearchButton?.getBoundingClientRect().left || 100
        }}
        on:load={handleSavedSearchLoad}
        on:close={() => {
          showSavedSearches = false;
        }}
      />
    {/key}
  {/if}


</div>

<style>
  .search-bar {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    box-shadow: var(--shadow-sm);
  }
  
  .search-main {
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
  }
  
  .btn-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    font-size: 0.875rem;
  }

  .btn-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .btn-toggle.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .bookmark-button-container {
    position: relative;
  }

  .search-advanced {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
    animation: slideDown 0.3s ease-out;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .search-section {
    margin-bottom: 0.75rem;
  }
  
  .search-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .input-group {
    margin-bottom: 0.5rem;
  }
  
  .input-group label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .search-input,
  .url-input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    width: 100%;
    transition: all 0.15s ease;
  }

  .search-input:focus,
  .url-input:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px rgba(74, 111, 165, 0.1);
  }
  
  .search-input:disabled,
  .url-input:disabled {
    opacity: 0.6;
  }
  
  .keyword-input-container,
  .url-input-container {
    position: relative;
  }

  .keyword-input-wrapper,
  .url-input-wrapper {
    display: flex;
    gap: 0.5rem;
  }

  .url-input {
    flex: 1;
  }

  .btn-keyword-history {
    padding: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-keyword-history:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
  }

  .btn-keyword-history.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .btn-keyword-history .history-count {
    padding: 1px 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
    min-width: 16px;
    text-align: center;
  }

  .btn-url-history {
    padding: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-url-history:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
  }

  .btn-url-history.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .btn-url-history .history-count {
    padding: 1px 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
    min-width: 16px;
    text-align: center;
  }
  
  
  .filter-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .filter-row label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .filter-row input {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  /* Improve visibility of date input calendar icons */
  /* Webkit-specific calendar icon styling for Chromium browsers (Chrome, Edge, etc.) */
  .filter-row input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(1) brightness(2);
    cursor: pointer;
    opacity: 0.9;
  }

  .filter-row input[type="date"]::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
    filter: invert(1) brightness(2.5);
  }
  
  .filter-actions {
    display: flex;
    justify-content: flex-end;
  }
  
  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: var(--primary);
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .btn-secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    background: var(--bg-hover);
  }
  
  
  .filter-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: var(--primary);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  
  .saved-count {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.4);
    }
    70% {
      box-shadow: 0 0 0 6px rgba(74, 144, 226, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(74, 144, 226, 0);
    }
  }
  
  .active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: var(--primary-bg);
    border-radius: 4px;
    border: 1px solid var(--primary);
  }
  
  .filter-label {
    font-weight: 500;
    color: var(--text-secondary);
    margin-right: 0.5rem;
  }
  
  .filter-tag {
    padding: 0.25rem 0.75rem;
    background: white;
    border: 1px solid var(--primary);
    border-radius: 16px;
    font-size: 0.875rem;
    color: var(--primary);
  }

  .filter-checkbox {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    color: var(--text-primary);
    font-size: 0.875rem;
    user-select: none;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
    width: 18px;
    height: 18px;
    accent-color: var(--primary);
  }

  /* Focus state - highly visible */
  .checkbox-label input[type="checkbox"]:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(77, 144, 254, 0.2);
  }

  /* Focus-visible for keyboard navigation */
  .checkbox-label input[type="checkbox"]:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(77, 144, 254, 0.3);
  }

  .checkbox-icon {
    font-size: 1.1rem;
    transition: all 0.2s ease;
  }

  .checkbox-label:hover {
    color: var(--primary);
  }

  .checkbox-label:hover .checkbox-icon {
    transform: scale(1.1);
  }

  /* When checkbox is focused, highlight the entire label */
  .checkbox-label:has(input:focus) {
    color: var(--primary);
    font-weight: 500;
  }

  .checkbox-label input[type="checkbox"]:checked + .checkbox-icon {
    color: var(--primary);
  }

  .bookmark-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .bookmark-field label {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .btn-bookmarks {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary);
    transition: all 0.2s;
    min-width: 80px;
  }

  .btn-bookmarks:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
    color: var(--primary);
  }

  .btn-bookmarks.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .bookmark-count {
    padding: 1px 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
    min-width: 16px;
    text-align: center;
  }

  .btn-bookmarks:not(.active) .bookmark-count {
    background: var(--primary);
    color: white;
  }

  .info-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 1rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 4px;
    color: var(--primary);
    font-size: 0.875rem;
  }
  
  .info-message svg {
    flex-shrink: 0;
  }
  
  .channel-label {
    flex: 2;
    min-width: 300px;
  }
  
  .filter-row .channel-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .progress-bar {
    position: relative;
    width: 100%;
    height: 24px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin-top: 0.5rem;
  }
  
  .progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, var(--primary) 0%, var(--primary-hover) 100%);
    transition: width 0.3s ease;
    animation: shimmer 1.5s infinite;
  }
  
  @keyframes shimmer {
    0% {
      opacity: 0.8;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.8;
    }
  }
  
  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.75rem;
    color: var(--text-primary);
    font-weight: 500;
    z-index: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* Today's Catch Up button styles */
  .catch-up-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    transition: all 0.2s ease;
  }

  .catch-up-toggle:hover:not(.disabled) {
    background: var(--bg-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .catch-up-toggle.loading {
    opacity: 0.7;
    cursor: wait;
  }

  .catch-up-toggle.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .catch-up-text {
    font-size: 1rem;
  }

  .catch-up-loading {
    font-size: 0.75rem;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Custom tooltip for from-date input */
  .from-date-container {
    position: relative;
  }

  .from-date-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: var(--text-primary);
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    animation: tooltipFadeIn 0.2s ease-out;
  }

  .from-date-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 16px;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--border);
  }

  .from-date-tooltip::before {
    content: '';
    position: absolute;
    top: 100%;
    left: 17px;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid var(--bg-primary);
    z-index: 1;
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

</style>