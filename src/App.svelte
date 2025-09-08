<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import SearchBar from './lib/components/SearchBar.svelte';
  import ResultList from './lib/components/ResultList.svelte';
  import ThreadView from './lib/components/ThreadView.svelte';
  import WorkspaceSwitcher from './lib/components/WorkspaceSwitcher.svelte';
  import './styles/zoom.css';
  import { 
    searchResults, 
    searchLoading, 
    searchError,
    searchParams,
    selectedMessage,
    addToHistory,
    loadReactionsProgressive,
    reactionLoadingState
  } from './lib/stores/search';
  import { 
    updateTokenSecure, 
    updateWorkspaceSecure, 
    loadSecureSettings 
  } from './lib/stores/secureSettings';
  import { settings, initializeSettings, toggleDebugMode } from './lib/stores/settings';
  import { maskTokenClient } from './lib/api/secure';
  import { 
    searchMessages, 
    getUserChannels,
    getUsers, 
    testConnection,
    initTokenFromStorage 
  } from './lib/api/slack';
  import { searchMessagesWithBatching } from './lib/api/batchedSearch';
  import { initKeyboardService, type KeyboardService } from './lib/services/keyboardService';
  import KeyboardSettings from './lib/components/KeyboardSettings.svelte';
  import KeyboardHelp from './lib/components/KeyboardHelp.svelte';
  import EmojiSettings from './lib/components/EmojiSettings.svelte';
  import EmojiSearchDialog from './lib/components/EmojiSearchDialog.svelte';
  import RealtimeSettings from './lib/components/RealtimeSettings.svelte';
  import PerformanceSettings from './lib/components/PerformanceSettings.svelte';
  import PerformanceDashboard from './lib/components/PerformanceDashboard.svelte';
  import Toast from './lib/components/Toast.svelte';
  import { workspaceStore, activeWorkspace } from './lib/stores/workspaces';
  import { channelStore } from './lib/stores/channels';
  import userStore from './lib/stores/users';
  import { userService } from './lib/services/userService';
  import { reactionService, initializeReactionMappings } from './lib/services/reactionService';
  import { emojiService } from './lib/services/emojiService';
  import { clearAllCaches } from './lib/services/memoization';
  import { searchOptimizer } from './lib/services/searchOptimizer';
  import { initializeConfig, watchConfigFile } from './lib/services/configService';
  import { realtimeStore, timeUntilUpdate, formattedLastUpdate } from './lib/stores/realtime';
  import { zoomStore } from './lib/stores/zoom';
  import { showToast } from './lib/stores/toast';
  import { channelSelectorOpen } from './lib/stores/ui';
  import { performanceSettings, initializePerformanceSettings } from './lib/stores/performance';
  import { logger } from './lib/services/logger';
  import ErrorBoundary from './lib/components/ErrorBoundary.svelte';
  import LoadingSpinner from './lib/components/LoadingSpinner.svelte';
  import SkeletonLoader from './lib/components/SkeletonLoader.svelte';
  import { initializeCurrentUser } from './lib/stores/currentUser';
  import UserIdSettings from './lib/components/UserIdSettings.svelte';
  import PerformanceMonitor from './lib/components/PerformanceMonitor.svelte';
  
  let channels: [string, string][] = [];
  let showSettings = false;
  let token = '';
  let maskedToken = '';
  let workspace = '';
  let useMultiWorkspace = false; // Feature flag for multi-workspace mode
  let keyboardService: KeyboardService;
  let searchBarElement: SearchBar;
  let resultListElement: ResultList;
  let showKeyboardHelp = false;
  let showEmojiSearch = false;
  let realtimeInterval: NodeJS.Timeout | null = null;
  let previousMessageIds = new Set<string>();
  let unsubscribeRealtime: (() => void) | null = null;
  let unsubscribeSearchResults: (() => void) | null = null;
  
  onMount(async () => {
    // Simple initialization - just use DEFAULT_REACTION_MAPPINGS
    
    // Initialize settings from persistent store
    const currentSettings = await initializeSettings();
    
    // Initialize zoom store
    await zoomStore.initialize();
    
    // Initialize performance settings
    await initializePerformanceSettings();
    
    // Note: Emoji service will be initialized after token is loaded
    
    // Request notification permission if needed
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    
    // Setup realtime updates subscription
    let previousInterval: number | null = null;
    unsubscribeRealtime = realtimeStore.subscribe(state => {
      if (state.isEnabled) {
        // Check if interval has changed and restart if needed
        if (previousInterval !== null && previousInterval !== state.updateInterval) {
          // Interval changed - restart timer
          stopRealtimeUpdates();
          startRealtimeUpdates();
        } else if (previousInterval === null) {
          startRealtimeUpdates();
        }
        previousInterval = state.updateInterval;
      } else {
        stopRealtimeUpdates();
        previousInterval = null;
      }
    });
    
    // Subscribe to search results to detect new messages
    unsubscribeSearchResults = searchResults.subscribe(results => {
      const state = get(realtimeStore);
      if (!results || !state.isEnabled) return;
      
      // Calculate new messages
      const newMessages = results.messages.filter(m => !previousMessageIds.has(m.id));
      
      if (newMessages.length > 0) {
        // Found new messages
        
        // Show notification if enabled
        if (state.showNotifications && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('New Slack Messages', {
              body: `${newMessages.length} new message${newMessages.length > 1 ? 's' : ''} in monitored channels`,
              icon: '/slack-icon.png'
            });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
        
        // Auto-scroll if enabled
        if (state.autoScroll && resultListElement) {
          // Scroll to top to show new messages
          resultListElement.scrollToTop();
        }
      }
    });
    
    // Initialize keyboard service
    keyboardService = initKeyboardService(currentSettings.keyboardShortcuts || {
      executeSearch: 'Enter',
      toggleAdvancedSearch: 'Ctrl+Shift+F',
      focusSearchBar: 'Ctrl+K',
      focusResults: 'Ctrl+1',
      focusThread: 'Ctrl+2',
      focusUrlInput: 'Ctrl+U',
      toggleSettings: 'Ctrl+,',
      newSearch: 'Ctrl+N',
      nextResult: ['j', 'ArrowDown'],
      prevResult: ['k', 'ArrowUp'],
      openResult: 'Enter',
      clearSearch: 'Escape',
      toggleChannelSelector: 'Ctrl+L',
      toggleMultiSelectMode: 'Ctrl+M',
      selectRecentChannels: 'Ctrl+R',
      selectAllFavorites: 'Ctrl+F',
      applySelectedChannels: 'Ctrl+Shift+A',
      jumpToFirst: 'h',
      jumpToLast: 'e',
      postMessage: 'p',
      replyInThread: 't',
      openReactionPicker: 'r',
      openUrls: 'Alt+Enter',
      reaction1: '1',
      reaction2: '2',
      reaction3: '3',
      reaction4: '4',
      reaction5: '5',
      reaction6: '6',
      reaction7: '7',
      reaction8: '8',
      reaction9: '9',
      toggleKeyboardHelp: '?',
      toggleEmojiSearch: 'Ctrl+e',
      zoomIn: 'Ctrl+=',
      zoomOut: 'Ctrl+-',
      zoomReset: 'Ctrl+0',
      toggleChannelFavorite: 'f',
      togglePerformanceMonitor: 'Ctrl+Shift+P'
    });
    
    // The reaction service already loads mappings from localStorage
    // No need to load them again here unless we want to ensure sync
    // between settings store and reaction service store
    
    // Register keyboard handlers
    setupKeyboardHandlers();
    
    // Add global keyboard event listener
    document.addEventListener('keydown', handleGlobalKeydown);
    
    // Add workspace switch event listener
    window.addEventListener('workspace-switched', handleWorkspaceSwitched);
    
    // Check for multi-workspace mode preference
    const multiWorkspaceEnabled = localStorage.getItem('multiWorkspaceEnabled');
    if (multiWorkspaceEnabled === 'true') {
      useMultiWorkspace = true;
      await initializeMultiWorkspace();
    } else {
      // Legacy single workspace mode
      const { token: savedToken, workspace: savedWorkspace } = await loadSecureSettings();
      if (savedToken) {
        // Check if we should migrate to multi-workspace
        const existingWorkspaces = localStorage.getItem('workspaces');
        if (!existingWorkspaces) {
          // Offer migration to multi-workspace
          if (confirm('Would you like to enable multi-workspace support? This will allow you to manage multiple Slack workspaces.')) {
            useMultiWorkspace = true;
            localStorage.setItem('multiWorkspaceEnabled', 'true');
            await workspaceStore.migrateFromLegacy(savedToken, savedWorkspace || 'workspace');
            await initializeMultiWorkspace();
          } else {
            // Continue with legacy mode
            token = savedToken;
            maskedToken = maskTokenClient(savedToken);
            workspace = savedWorkspace || '';
            
            // Initialize token in backend
            try {
              const initialized = await initTokenFromStorage();
              if (initialized) {
                // Initialize current user ID
                logger.debug('[App] Initializing current user ID...');
                await initializeCurrentUser();
                logger.debug('[App] Current user ID initialized');
                
                // Initialize emoji service after token is loaded
                logger.debug('[App] Initializing emoji service after token load...');
                await emojiService.initialize();
                logger.debug('[App] Emoji service initialized');
                
                await loadChannels();
              } else {
                // Token found in frontend but not initialized in backend
                logger.warn('[App] Token not initialized in backend, skipping emoji service initialization');
              }
            } catch (err) {
              // Failed to initialize token
              logger.error('[App] Failed to initialize token:', err);
            }
          }
        } else {
          // Already has workspaces, use multi-workspace mode
          useMultiWorkspace = true;
          localStorage.setItem('multiWorkspaceEnabled', 'true');
          await initializeMultiWorkspace();
        }
      } else {
        // No token saved, show a helpful message
        searchError.set('Welcome! Please configure your Slack token in Settings to start searching.');
      }
    }
  });
  
  onDestroy(() => {
    // Clean up event listeners
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleGlobalKeydown);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('workspace-switched', handleWorkspaceSwitched);
    }
    // Clean up realtime updates
    stopRealtimeUpdates();
    // Unsubscribe from stores
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
    }
    if (unsubscribeSearchResults) {
      unsubscribeSearchResults();
    }
  });
  
  function handleGlobalKeydown(event: KeyboardEvent) {
    // If keyboard help is shown, let it handle its own keyboard events
    if (showKeyboardHelp && (event.key === 'Escape' || 
        ['ArrowUp', 'ArrowDown', 'j', 'k', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))) {
      // The KeyboardHelp component will handle these
      return;
    }
    
    // Check for help shortcut - works globally, not just when settings is closed
    if (event.key === '?') {
      // Check if we're in an input field where '?' should type normally
      const target = event.target as HTMLElement;
      const isInInput = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.contentEditable === 'true';
      
      if (!isInInput) {
        event.preventDefault();
        showKeyboardHelp = !showKeyboardHelp;
        return;
      }
    }
    
    if (keyboardService) {
      keyboardService.handleKeyboardEvent(event);
    }
  }
  
  function setupKeyboardHandlers() {
    console.log('🔍 DEBUG: Setting up keyboard handlers', {
      keyboardService: !!keyboardService,
      shortcuts: $settings.keyboardShortcuts
    });
    
    // Toggle Settings
    keyboardService.registerHandler('toggleSettings', {
      action: () => {
        showSettings = !showSettings;
      },
      allowInInput: true
    });
    
    // Focus Search Bar
    keyboardService.registerHandler('focusSearchBar', {
      action: () => {
        if (!showSettings && searchBarElement) {
          searchBarElement.focusSearchInput();
        }
      },
      allowInInput: true  // Allow from anywhere to provide quick navigation
    });
    
    // New Search - refreshes like workspace switching
    keyboardService.registerHandler('newSearch', {
      action: async () => {
        if (!showSettings) {
          // Clear current state similar to workspace switching
          searchResults.set(null);
          selectedMessage.set(null);
          // Reset searchParams to initial state completely
          searchParams.set({
            query: '',
            limit: 100
          });
          searchError.set(null);
          searchLoading.set(false);
          
          // Reset realtime mode when clearing search
          realtimeStore.setEnabled(false);
          stopRealtimeUpdates();
          
          // Clear channels and user cache before reloading
          channels = [];
          channelStore.reset(); // Reset the channel store state
          if (userService && userService.clearCache) {
            userService.clearCache();
          }
          
          // Show loading state
          searchLoading.set(true);
          
          try {
            // Reload current workspace data
            if (useMultiWorkspace) {
              const currentWorkspace = $activeWorkspace;
              if (currentWorkspace) {
                const wsToken = await workspaceStore.getActiveToken();
                if (wsToken) {
                  // Re-initialize backend with current token
                  await updateTokenSecure(wsToken);
                  await new Promise(resolve => setTimeout(resolve, 100));
                  
                  const initialized = await initTokenFromStorage();
                  if (initialized) {
                    // Re-initialize current user ID
                    logger.debug('[App] Re-initializing current user ID after re-auth...');
                    await initializeCurrentUser();
                    logger.debug('[App] Current user ID re-initialized');
                    
                    // Re-initialize emoji service after re-authentication
                    logger.debug('[App] Re-initializing emoji service after re-auth...');
                    await emojiService.refresh();
                    logger.debug('[App] Emoji service re-initialized');
                    
                    // Reload channels for current workspace
                    await loadChannels();
                    
                    // Force UI update
                    channels = [...channels];
                    
                    // Clear the search bar if it exists
                    if (searchBarElement) {
                      searchBarElement.clearChannelSelection();
                      searchBarElement.focusSearchInput();
                    }
                    
                    searchError.set(null);
                  }
                }
              }
            } else {
              // Legacy single workspace mode
              if (token) {
                const initialized = await initTokenFromStorage();
                if (initialized) {
                  // Initialize current user ID for legacy mode
                  logger.debug('[App] Initializing current user ID for legacy mode...');
                  await initializeCurrentUser();
                  logger.debug('[App] Current user ID initialized');
                  
                  // Initialize emoji service for legacy mode
                  logger.debug('[App] Initializing emoji service for legacy mode...');
                  await emojiService.initialize();
                  logger.debug('[App] Emoji service initialized');
                  
                  await loadChannels();
                  channels = [...channels];
                  
                  if (searchBarElement) {
                    searchBarElement.clearChannelSelection();
                    searchBarElement.focusSearchInput();
                  }
                  
                  searchError.set(null);
                }
              }
            }
          } catch (err) {
            // Failed to refresh workspace
            searchError.set('Failed to refresh workspace. Please try again.');
          } finally {
            searchLoading.set(false);
          }
        }
      },
      allowInInput: true  // Allow from anywhere to start fresh search
    });
    
    // Toggle Advanced Search
    keyboardService.registerHandler('toggleAdvancedSearch', {
      action: () => {
        if (!showSettings && searchBarElement) {
          searchBarElement.toggleAdvancedSearch();
        }
      },
      allowInInput: true
    });
    
    // Focus Results
    keyboardService.registerHandler('focusResults', {
      action: () => {
        if (!showSettings && resultListElement) {
          resultListElement.focusList();
        }
      },
      allowInInput: true  // Allow even when in input fields for better navigation
    });
    
    // Focus Thread
    keyboardService.registerHandler('focusThread', {
      action: () => {
        console.log('🔍 DEBUG: focusThread handler called', {
          showSettings,
          selectedMessage: $selectedMessage,
          hasSelectedMessage: !!$selectedMessage
        });
        
        if (!showSettings && $selectedMessage) {
          // Focus the thread view component
          const threadView = document.querySelector('.thread-view') as HTMLElement;
          console.log('🔍 DEBUG: Looking for thread view', {
            found: !!threadView,
            element: threadView
          });
          
          if (threadView) {
            console.log('🔍 DEBUG: Focusing thread view');
            threadView.focus();
            // Trigger a focus event to ensure the component handles it properly
            threadView.dispatchEvent(new Event('focus'));
            console.log('🔍 DEBUG: Thread view focus complete', {
              activeElement: document.activeElement,
              isThreadViewFocused: document.activeElement === threadView
            });
          }
        }
      },
      allowInInput: true  // Allow even when in input fields for better navigation
    });
    
    console.log('🔍 DEBUG: focusThread handler registered');
    
    // Focus URL Input
    keyboardService.registerHandler('focusUrlInput', {
      action: () => {
        if (!showSettings && searchBarElement) {
          // Make sure advanced search is open first
          if (!searchBarElement.isAdvancedOpen()) {
            searchBarElement.toggleAdvancedSearch();
          }
          // Then focus the URL input
          searchBarElement.focusUrlInput();
        }
      },
      allowInInput: true  // Allow even when in input fields for better navigation
    });
    
    // Toggle Channel Selector
    keyboardService.registerHandler('toggleChannelSelector', {
      action: () => {
        if (!showSettings && searchBarElement) {
          searchBarElement.toggleChannelSelector();
        }
      },
      allowInInput: true  // Allow from anywhere for better UX
    });
    
    // Zoom controls
    keyboardService.registerHandler('zoomIn', {
      action: () => {
        zoomStore.zoomIn();
      },
      allowInInput: true
    });
    
    keyboardService.registerHandler('zoomOut', {
      action: () => {
        zoomStore.zoomOut();
      },
      allowInInput: true
    });
    
    keyboardService.registerHandler('zoomReset', {
      action: () => {
        zoomStore.resetZoom();
      },
      allowInInput: true
    });
    
    // Toggle Keyboard Help - register handler for consistency
    keyboardService.registerHandler('toggleKeyboardHelp', {
      action: () => {
        showKeyboardHelp = !showKeyboardHelp;
      },
      allowInInput: false  // Don't trigger when typing in inputs
    });
    
    // Toggle Emoji Search Dialog
    keyboardService.registerHandler('toggleEmojiSearch', {
      action: () => {
        showEmojiSearch = !showEmojiSearch;
      },
      allowInInput: true  // Allow from anywhere for quick emoji access
    });
    
    // Toggle Channel Favorite
    keyboardService.registerHandler('toggleChannelFavorite', {
      action: () => {
        // If channel selector dropdown is open, let it handle the F key
        if (get(channelSelectorOpen)) {
          return;  // Skip global handler, let ChannelSelector handle it
        }
        
        // Otherwise, handle for the currently selected message
        const currentMessage = get(selectedMessage);
        if (currentMessage && currentMessage.channel) {
          // Get the current channel state to show correct feedback
          const currentChannels = get(channelStore).allChannels;
          const channel = currentChannels.find(ch => ch.id === currentMessage.channel);
          const willBeFavorite = channel ? !channel.isFavorite : true;
          
          // Toggle favorite for the channel of the currently focused message
          channelStore.toggleFavorite(currentMessage.channel);
          
          // Show feedback to user
          const channelName = currentMessage.channelName || 'channel';
          const message = willBeFavorite 
            ? `⭐ Added #${channelName} to favorites`
            : `☆ Removed #${channelName} from favorites`;
          showToast(message, 'success');
        }
      },
      allowInInput: false  // Don't trigger when typing in inputs
    });
    
    // Toggle Performance Monitor (Debug Mode)
    keyboardService.registerHandler('togglePerformanceMonitor', {
      action: () => {
        toggleDebugMode();
        const isDebugMode = get(settings).debugMode; // Value after toggle
        const message = isDebugMode
          ? 'Performance Monitor enabled'
          : 'Performance Monitor disabled';
        showToast(message, 'info');
      },
      allowInInput: true  // Allow from anywhere for debugging
    });
  }
  
  async function initializeMultiWorkspace() {
    // Load workspaces
    const currentWorkspace = $activeWorkspace;
    
    if (currentWorkspace) {
      // Get token for active workspace
      const wsToken = await workspaceStore.getActiveToken();
      if (wsToken) {
        token = wsToken;
        maskedToken = maskTokenClient(wsToken);
        workspace = currentWorkspace.domain;
        
        // Initialize token in backend
        try {
          // CRITICAL: Save token to default location for backend compatibility
          // The backend always reads from default key "slack_token"
          // This ensures the backend can access the current workspace's token
          await updateTokenSecure(wsToken);
          
          // Wait a bit to ensure the token is saved
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const initialized = await initTokenFromStorage();
          if (initialized) {
            // Initialize current user ID after workspace switch
            logger.debug('[App] Initializing current user ID after workspace switch...');
            await initializeCurrentUser();
            logger.debug('[App] Current user ID initialized');
            
            // Initialize emoji service after token is loaded with workspace ID
            logger.debug('[App] Initializing emoji service after workspace switch...', { workspaceId: currentWorkspace.id });
            await emojiService.initialize(currentWorkspace.id);
            console.log('[App] Emoji service initialized for workspace:', currentWorkspace.id);
            
            await loadChannels();
          } else {
            // Failed to initialize backend with token
            logger.warn('[App] Failed to initialize backend with token, skipping emoji service initialization');
          }
        } catch (err) {
          logger.error('Failed to initialize token:', err);
        }
      }
    } else {
      // No active workspace
      searchError.set('Welcome! Please add a workspace to start searching.');
    }
  }
  
  async function handleWorkspaceSwitched(event: CustomEvent) {
    const switchEvent = event.detail;
    
    // Clear current state including channels and search results
    searchResults.set(null);
    selectedMessage.set(null);
    // Reset searchParams to initial state completely
    searchParams.set({
      query: '',
      limit: 100
    });
    searchError.set(null);
    searchLoading.set(false);
    
    // Reset realtime mode when switching workspaces
    realtimeStore.setEnabled(false);
    stopRealtimeUpdates();
    
    // Clear all caches and search optimizations
    clearAllCaches();
    searchOptimizer.cancelAllSearches();
    searchOptimizer.clearCache();
    
    // Clear channels and user cache before loading new ones
    channels = [];
    channelStore.reset(); // Reset the channel store state
    userService.clearCache();
    
    // Get the active workspace after the switch
    const currentWorkspace = $activeWorkspace;
    if (!currentWorkspace) {
      searchError.set('No active workspace selected.');
      return;
    }
    
    // Show loading state
    searchLoading.set(true);
    
    // Load new workspace
    const wsToken = await workspaceStore.getActiveToken();
    if (wsToken) {
      token = wsToken;
      maskedToken = maskTokenClient(wsToken);
      workspace = currentWorkspace.domain;
      
      // CRITICAL: Save token to default location for backend compatibility
      // The backend always reads from default key "slack_token"
      // This ensures the backend can access the current workspace's token
      try {
        // Update the token in the secure store's default location
        await updateTokenSecure(wsToken);
        
        // Wait a bit to ensure the token is saved
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Initialize the backend with the new token
        const initialized = await initTokenFromStorage();
        if (initialized) {
          // Re-initialize current user ID for the new workspace
          logger.debug('[App] Re-initializing current user ID for workspace switch...');
          await initializeCurrentUser();
          logger.debug('[App] Current user ID re-initialized');
          
          // Re-initialize emoji service for the new workspace
          logger.debug('[App] Re-initializing emoji service for workspace switch...');
          await emojiService.refresh(); // Force refresh to get new workspace emojis
          logger.debug('[App] Emoji service re-initialized');
          
          // Load new channels for the switched workspace
          await loadChannels();
          
          // Force UI update by reassigning channels
          channels = [...channels];
          
          // Clear the search bar if it exists
          if (searchBarElement) {
            searchBarElement.clearChannelSelection();
          }
          
          searchError.set(null);
        } else {
          // Failed to initialize backend token
          searchError.set('Failed to initialize token for the new workspace.');
        }
      } catch (err) {
        // Failed to switch workspace
        searchError.set('Failed to switch workspace. Please check the token.');
      } finally {
        searchLoading.set(false);
      }
    } else {
      searchError.set('No token found for the selected workspace.');
      searchLoading.set(false);
    }
  }
  
  async function handleSearch(event?: CustomEvent) {
    searchLoading.set(true);
    searchError.set(null);
    
    try {
      // First ensure the token is initialized in the backend
      const tokenInitialized = await initTokenFromStorage();
      if (!tokenInitialized) {
        searchError.set('No Slack token configured. Please add your token in Settings.');
        return;
      }
      
      // Use params from event if available, otherwise from store
      const params = event?.detail || $searchParams;
      // Search params being sent
      
      // For realtime incremental updates, get last timestamp
      if (params.isRealtimeUpdate && $realtimeStore.isEnabled) {
        const lastTimestamp = realtimeStore.getLastSearchTimestamp();
        if (lastTimestamp) {
          // Set from date to just after the last message timestamp
          const lastDate = new Date(parseFloat(lastTimestamp) * 1000);
          params.fromDate = new Date(lastDate.getTime() + 1000); // Add 1 second to avoid duplicates
        }
      }
      
      // Use batched search for multi-channel searches when enabled
      const result = await searchMessagesWithBatching(params);
      
      // Handle incremental updates
      if (params.isRealtimeUpdate && $realtimeStore.isEnabled && $searchResults?.messages) {
        // Merge new messages with existing ones
        const existingMessages = $searchResults.messages;
        const newMessages = result.messages.filter(msg => 
          !previousMessageIds.has(msg.id)
        );
        
        if (newMessages.length > 0) {
          // Combine and sort messages by timestamp (newest first)
          const allMessages = [...newMessages, ...existingMessages];
          allMessages.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
          
          // Update the result with merged messages
          result.messages = allMessages;
          result.total = allMessages.length;
          
          // Update last search timestamp to the newest message
          const newestTimestamp = newMessages[0].ts;
          realtimeStore.recordUpdate(newMessages.length, newestTimestamp);
          
          // Show notification for new messages
          if ($realtimeStore.showNotifications && newMessages.length > 0) {
            showNotification(`${newMessages.length} new message${newMessages.length > 1 ? 's' : ''}`);
          }
        } else {
          // No new messages, just record the update
          realtimeStore.recordUpdate(0);
        }
        
        // For realtime updates, batch the UI update to reduce thrashing
        // Use requestAnimationFrame for smoother rendering
        requestAnimationFrame(() => {
          searchResults.set(result);
          // Don't load reactions progressively for realtime updates (they should already have reactions)
        });
      } else {
        // Normal search - immediate update
        searchResults.set(result);
        
        // Start loading reactions progressively for all messages
        // This will load reactions in batches without blocking the UI
        if (result.messages && result.messages.length > 0) {
          // Start progressive reaction loading in the background
          loadReactionsProgressive(result.messages).catch(err => {
            console.error('Failed to load reactions progressively:', err);
          });
        }
      }
      
      // Update previousMessageIds after setting results for non-realtime searches
      if (!params.isRealtimeUpdate && $realtimeStore.isEnabled) {
        previousMessageIds = new Set(result.messages.map(m => m.id));
        realtimeStore.updateMessageIds(previousMessageIds);
      }
      
      // Only add to history if there was a query
      if (params.query) {
        addToHistory(params.query, result.messages.length);
      }
    } catch (err) {
      let errorMessage = 'Search failed';
      if (err instanceof Error) {
        // Provide more specific error messages
        if (err.message.includes('No Slack token') || err.message.includes('Authentication')) {
          errorMessage = 'Authentication failed. Please check your Slack token in Settings.';
        } else if (err.message.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.message.includes('API')) {
          errorMessage = `Slack API error: ${err.message}`;
        } else {
          errorMessage = err.message;
        }
      }
      searchError.set(errorMessage);
      // Search error
    } finally {
      searchLoading.set(false);
    }
  }
  
  async function loadChannels() {
    try {
      // Clear existing channels first
      channels = [];
      
      // Get new channels for current workspace
      const newChannels = await getUserChannels();
      
      // Update channels and force reactivity
      channels = newChannels || [];
      
      // Initialize channel store with workspace-specific data (favorites, recent channels, etc.)
      await channelStore.initChannels(channels);
      
      // Loaded channels for workspace
      
      // Also load users for mention resolution
      await loadUsers();
    } catch (err) {
      // Failed to load channels
      channels = [];
      searchError.set('Failed to load channels. Please check your token permissions.');
    }
  }
  
  async function loadUsers() {
    try {
      const users = await getUsers();
      await userStore.initUsers(users);
      // Loaded users for workspace
    } catch (err) {
      // Failed to load users
      // Non-critical error - continue without user mention resolution
    }
  }
  
  async function handleSaveSettings() {
    if (!token) {
      alert('Please enter a Slack token');
      return;
    }
    
    try {
      const isValid = await testConnection(token);
      if (!isValid) {
        alert('Invalid token. Please check and try again.');
        return;
      }
      
      // Save to secure storage
      await updateTokenSecure(token);
      await updateWorkspaceSecure(workspace);
      maskedToken = maskTokenClient(token);
      
      // The settings store automatically saves to localStorage
      // The keyboard shortcuts and emoji mappings are already saved
      // through their respective components (KeyboardSettings and EmojiSettings)
      // which call updateSettings() directly
      
      await loadChannels();
      showSettings = false;
      alert('Settings saved successfully!');
    } catch (err) {
      alert('Failed to save settings: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }
  
  function startRealtimeUpdates() {
    if (realtimeInterval) return; // Already running
    
    const state = get(realtimeStore);
    // Starting realtime updates
    
    // Don't run immediately - wait for first interval
    // This prevents duplicate on initial search
    
    // Then set up interval
    realtimeInterval = setInterval(() => {
      performRealtimeUpdate();
    }, state.updateInterval * 1000);
  }
  
  function stopRealtimeUpdates() {
    if (realtimeInterval) {
      clearInterval(realtimeInterval);
      realtimeInterval = null;
      // Stopped realtime updates
    }
  }
  
  async function performRealtimeUpdate() {
    if (!searchBarElement) return;
    
    // Performing realtime update
    
    // Store current message IDs before update
    const currentMessages = $searchResults?.messages || [];
    if (currentMessages.length > 0) {
      previousMessageIds = new Set(currentMessages.map(m => m.id));
      // Update the store with existing message IDs
      realtimeStore.updateMessageIds(previousMessageIds);
    }
    
    // Trigger realtime search with incremental flag
    searchBarElement.triggerRealtimeSearch();
    
    // Will record update after search completes with new message count
  }
  
  function showNotification(message: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Personal Slack Client', {
        body: message,
        icon: '/icon.png'
      });
    }
  }
  
</script>

<div class="app">
  <header class="app-header">
    <h1>Personal Slack Client</h1>
    
    {#if $realtimeStore.isEnabled}
      <div class="realtime-indicator">
        <span class="live-badge">LIVE</span>
        {#if $formattedLastUpdate}
          <span class="last-update">Updated: {$formattedLastUpdate}</span>
        {/if}
      </div>
    {/if}
    
    {#if useMultiWorkspace}
      <WorkspaceSwitcher 
        on:workspaceSwitched={handleWorkspaceSwitched}
        on:workspaceAdded={handleWorkspaceSwitched}
      />
    {/if}
    
    <button
      class="btn-settings"
      on:click={() => showSettings = !showSettings}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v6m0 6v6m4.22-13.22 4.24 4.24M1.54 1.54l4.24 4.24M20.46 20.46l-4.24-4.24M1.54 20.46l4.24-4.24"/>
      </svg>
      Settings
    </button>
  </header>
  
  {#if showSettings}
    <div class="settings-panel">
      <div class="settings-header">
        <h2>Settings</h2>
      </div>
      
      <div class="settings-content">
        {#if !useMultiWorkspace}
        <div class="setting-group">
          <label>
            <input
              type="checkbox"
              on:change={(e) => {
                if (e.target.checked) {
                  if (confirm('Enable multi-workspace support? Your current workspace will be preserved.')) {
                    useMultiWorkspace = true;
                    localStorage.setItem('multiWorkspaceEnabled', 'true');
                    if (token) {
                      workspaceStore.migrateFromLegacy(token, workspace || 'workspace');
                    }
                    window.location.reload();
                  } else {
                    e.target.checked = false;
                  }
                }
              }}
            />
            Enable Multi-Workspace Support
          </label>
          <p class="help-text">
            Manage multiple Slack workspaces and switch between them easily
          </p>
        </div>
        
        <div class="setting-group">
          <label>
            Slack User Token (Required: xoxp-)
            <input
              type="password"
              bind:value={token}
              placeholder="xoxp-xxxxxxxxxxxx"
              on:input={(e) => {
                const value = e.target.value.trim();
                if (value && !value.startsWith('xoxp-')) {
                  if (value.startsWith('xoxb-')) {
                    alert('⚠️ Bot tokens (xoxb-) are not supported.\n\nThis app requires a User Token (xoxp-) to search messages.\nBot tokens cannot access message history or search.\n\nPlease see SLACK_TOKEN_GUIDE.md for instructions on getting a User Token.');
                  } else if (value.length > 10) {
                    alert('⚠️ Invalid token format.\n\nUser tokens must start with "xoxp-".\n\nPlease see SLACK_TOKEN_GUIDE.md for instructions.');
                  }
                }
              }}
            />
          </label>
          {#if maskedToken}
            <p class="masked-token">Current token: {maskedToken}</p>
          {/if}
          <p class="help-text" style="color: var(--warning, orange); font-weight: bold;">
            ⚠️ IMPORTANT: Must be a User Token (xoxp-), NOT a Bot Token (xoxb-)
          </p>
          <p class="help-text">
            <a href="https://github.com/your-repo/personal-slack-client/blob/main/SLACK_TOKEN_GUIDE.md" target="_blank">
              📖 Read the Token Setup Guide
            </a> for detailed instructions
          </p>
        </div>
        
        <div class="setting-group">
          <label>
            Workspace Name
            <input
              type="text"
              bind:value={workspace}
              placeholder="your-workspace"
            />
          </label>
          <p class="help-text">
            The name that appears in your Slack URL (workspace.slack.com)
          </p>
        </div>
      {:else}
        <div class="setting-group">
          <p class="info-text">
            <strong>Multi-Workspace Mode Active</strong><br/>
            Use the workspace switcher in the header to manage workspaces.
          </p>
          <button
            class="btn-secondary"
            on:click={() => {
              if (confirm('Disable multi-workspace support? This will keep your current active workspace only.')) {
                localStorage.removeItem('multiWorkspaceEnabled');
                useMultiWorkspace = false;
                window.location.reload();
              }
            }}
          >
            Disable Multi-Workspace Mode
          </button>
        </div>
      {/if}
      
        <KeyboardSettings />
        
        <EmojiSettings />
        
        <RealtimeSettings />
        
        <PerformanceSettings />
        
        <div class="setting-group">
          <label>
            <input
              type="checkbox"
              checked={$settings.debugMode}
              on:change={(e) => settings.update(s => ({ ...s, debugMode: e.target.checked }))}
            />
            Enable Debug Mode
          </label>
          <p class="help-text">
            Shows performance metrics panel in the bottom-right corner. Can also be toggled with Ctrl+Shift+P.
          </p>
        </div>
        
        <UserIdSettings />
      </div>
      
      <div class="settings-actions">
        <button class="btn-secondary" on:click={() => showSettings = false}>
          Cancel
        </button>
        <button class="btn-primary" on:click={handleSaveSettings}>
          Save Settings
        </button>
      </div>
    </div>
  {:else}
    {#if $searchError}
      <div class="error-banner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{$searchError}</span>
        <button class="btn-close" on:click={() => searchError.set(null)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    {/if}
    
    <ErrorBoundary fallback="Search functionality temporarily unavailable">
      <SearchBar
        bind:this={searchBarElement}
        {channels}
        on:search={handleSearch}
      />
    </ErrorBoundary>
    
    {#if !token && !$searchError}
      <div class="welcome-message">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11H3v2h6v-2zm0-4H3v2h6V7zm0 8H3v2h6v-2zm12-8h-6v2h6V7zm0 4h-6v2h6v-2zm0 4h-6v2h6v-2z"/>
        </svg>
        <h2>Welcome to Personal Slack Client!</h2>
        <p>To get started, please configure your Slack token in Settings.</p>
        <button class="btn-primary" on:click={() => showSettings = true}>
          Open Settings
        </button>
      </div>
    {:else}
      <div class="main-content">
        <div class="results-panel">
          <ErrorBoundary fallback="Unable to display search results" showDetails={true}>
            <ResultList
              bind:this={resultListElement}
              messages={$searchResults?.messages || []}
              loading={$searchLoading}
              error={$searchError}
            />
          </ErrorBoundary>
        </div>
        
        <div class="thread-panel">
          <ErrorBoundary fallback="Unable to display thread" showDetails={true}>
            <ThreadView message={$selectedMessage} />
          </ErrorBoundary>
        </div>
      </div>
    {/if}
  {/if}
  
  <KeyboardHelp bind:show={showKeyboardHelp} />
  <EmojiSearchDialog 
    bind:isOpen={showEmojiSearch}
    on:select={(event) => {
      logger.debug('Selected emoji:', event.detail);
      // You can handle the selected emoji here if needed
    }}
  />
  <Toast />
  {#if $performanceSettings.performanceMetrics}
    <PerformanceDashboard />
  {/if}
  <!-- Performance Monitor for real-time metrics (only visible in debug mode) -->
  {#if $settings.debugMode}
    <PerformanceMonitor />
  {/if}
</div>

<style>
  :global(:root) {
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-hover: #f1f3f5;
    --text-primary: #212529;
    --text-secondary: #6c757d;
    --border: #dee2e6;
    --primary: #4a90e2;
    --primary-hover: #357abd;
    --primary-bg: #e7f1fb;
    --error: #dc3545;
    --warning: #ff9800;
  }
  
  :global(:root.dark) {
    --bg-primary: #1a1d21;
    --bg-secondary: #232629;
    --bg-hover: #2d3136;
    --text-primary: #e1e1e3;
    --text-secondary: #a0a0a2;
    --border: #3e4146;
    --primary: #4a90e2;
    --primary-hover: #357abd;
    --primary-bg: #1e3a5c;
    --error: #f56565;
    --warning: #ffa726;
  }
  
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
  }
  
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 1rem;
  }
  
  .app-header {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  
  .app-header > :last-child {
    margin-left: auto;
  }
  
  .app-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .realtime-indicator {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid #ff4444;
    border-radius: 6px;
    font-size: 0.875rem;
  }
  
  .live-badge {
    padding: 0.25rem 0.5rem;
    background: #ff4444;
    color: white;
    border-radius: 4px;
    font-weight: 600;
    animation: pulse-live 2s ease-in-out infinite;
  }
  
  @keyframes pulse-live {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
  
  .last-update {
    color: var(--text-secondary);
  }
  
  .btn-settings {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-settings:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .settings-panel {
    background: var(--bg-secondary);
    border-radius: 8px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  
  .settings-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    position: sticky;
    top: 0;
    z-index: 10;
    border-radius: 8px 8px 0 0;
  }
  
  .settings-header h2 {
    margin: 0;
  }
  
  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 2rem;
    max-height: calc(90vh - 180px);
  }
  
  .settings-content::-webkit-scrollbar {
    width: 8px;
  }
  
  .settings-content::-webkit-scrollbar-track {
    background: var(--bg-primary);
    border-radius: 4px;
  }
  
  .settings-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .settings-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
  
  .setting-group {
    margin-bottom: 1.5rem;
  }
  
  .setting-group label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-weight: 500;
  }
  
  .setting-group input {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 1rem;
  }
  
  .help-text {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .info-text {
    padding: 1rem;
    background: var(--bg-hover);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--text-primary);
    margin-bottom: 1rem;
  }
  
  .help-text a {
    color: var(--primary);
    text-decoration: none;
  }
  
  .help-text a:hover {
    text-decoration: underline;
  }
  
  .masked-token {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-hover);
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
  
  .settings-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.5rem 2rem 2rem 2rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    position: sticky;
    bottom: 0;
    border-radius: 0 0 8px 8px;
  }
  
  
  .main-content {
    display: flex;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  
  .results-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  .thread-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
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
  
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: var(--error);
    color: white;
    border-radius: 6px;
    animation: slideDown 0.3s ease;
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
  
  .error-banner svg {
    flex-shrink: 0;
  }
  
  .error-banner span {
    flex: 1;
    font-size: 0.875rem;
  }
  
  .btn-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  
  .btn-close:hover {
    opacity: 1;
  }
  
  .welcome-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-top: 2rem;
  }
  
  .welcome-message svg {
    color: var(--primary);
    margin-bottom: 1rem;
  }
  
  .welcome-message h2 {
    margin-bottom: 1rem;
    font-size: 1.75rem;
    color: var(--text-primary);
  }
  
  .welcome-message p {
    margin-bottom: 2rem;
    color: var(--text-secondary);
    font-size: 1.1rem;
  }
</style>