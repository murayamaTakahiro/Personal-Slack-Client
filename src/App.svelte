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
  import { savedSearchesStore } from './lib/stores/savedSearches';
  import RealtimeSettings from './lib/components/RealtimeSettings.svelte';
  import PerformanceSettings from './lib/components/PerformanceSettings.svelte';
  import PerformanceDashboard from './lib/components/PerformanceDashboard.svelte';
  import DownloadSettings from './lib/components/DownloadSettings.svelte';
  import Toast from './lib/components/Toast.svelte';
  import LightboxContainer from './lib/components/files/LightboxContainer.svelte';
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
  import ConfirmationDialog from './lib/components/ConfirmationDialog.svelte';
  
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
  let appInitialized = false;
  let initializationError: string | null = null;
  let initializationStep = 'Starting...';
  let initializationProgress = 0;
  let initializationTimeout: NodeJS.Timeout | null = null;
  
  onMount(async () => {
    // Set a timeout to ensure the app initializes even if something hangs
    initializationTimeout = setTimeout(() => {
      console.warn('[App] Initialization timeout reached, forcing app to show');
      appInitialized = true;
      initializationError = null;
    }, 5000); // 5 second timeout
    
    try {
      console.log('[App] Starting robust onMount initialization...');
      console.log('[App] Current window location:', window.location.href);
      console.log('[App] Document ready state:', document.readyState);
      
      // Quick initialization - don't wait too long
      initializationStep = 'Starting up...';
      initializationProgress = 10;
      
      // Initialize core stores with better error handling
      initializationStep = 'Initializing core stores...';
      initializationProgress = 20;
      await initializeCoreStores();
      
      // Initialize settings from persistent store
      initializationStep = 'Loading settings...';
      initializationProgress = 40;
      const currentSettings = await safeInitializeSettings();
      console.log('[App] Settings initialized successfully');
      
      // Initialize UserService after settings are ready - but don't block on it
      initializationStep = 'Initializing user service...';
      initializationProgress = 50;
      // Run UserService initialization in background
      Promise.resolve().then(() => {
        if (userService && typeof userService.initialize === 'function') {
          try {
            userService.initialize();
            console.log('[App] UserService initialized successfully');
          } catch (userError) {
            console.error('[App] UserService initialization failed:', userError);
            // Don't fail the entire app for this
          }
        } else {
          console.warn('[App] UserService not available or missing initialize method');
        }
      });
      
      // Initialize additional stores
      initializationStep = 'Setting up additional services...';
      initializationProgress = 60;
      await initializeAdditionalStores();
      
      // Mark app as successfully initialized EARLY to show UI
      initializationStep = 'Ready!';
      initializationProgress = 80;
      appInitialized = true;
      initializationError = null;
      console.log('[App] Core initialization completed successfully');
      
      // Clear the timeout since we initialized successfully
      if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
      }
      
      // Continue with workspace and UI initialization in background
      initializationProgress = 90;
      // Don't await - let this run in background
      initializeWorkspaceAndUI(currentSettings).then(() => {
        initializationProgress = 100;
        console.log('[App] Full initialization completed successfully');
      }).catch(error => {
        console.error('[App] Workspace/UI initialization failed:', error);
        showToast('Some features may not be available', 'warning');
      });
      
    } catch (error) {
      console.error('[App] Error during onMount initialization:', error);
      console.error('[App] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Clear the timeout
      if (initializationTimeout) {
        clearTimeout(initializationTimeout);
        initializationTimeout = null;
      }
      
      // Still show the app, but with reduced functionality
      appInitialized = true;
      
      // Try to show a toast notification if possible
      try {
        showToast('App initialization partially failed - some features may not work properly', 'warning');
      } catch (toastError) {
        console.error('[App] Toast notification failed:', toastError);
      }
    }
  });
  
  // Robust store initialization
  async function initializeCoreStores() {
    const initPromises = [
      // Initialize saved searches store with timeout
      Promise.race([
        savedSearchesStore.initialize().catch(error => {
          console.warn('[App] Saved searches initialization failed:', error);
          return null; // Don't let this break the app
        }),
        new Promise(resolve => setTimeout(() => {
          console.warn('[App] Saved searches initialization timed out');
          resolve(null);
        }, 2000)) // Reduced timeout
      ]),
      
      // Initialize zoom store with timeout
      Promise.race([
        zoomStore.initialize().catch(error => {
          console.warn('[App] Zoom store initialization failed:', error);
          return null;
        }),
        new Promise(resolve => setTimeout(() => {
          console.warn('[App] Zoom store initialization timed out');
          resolve(null);
        }, 1000)) // Reduced timeout
      ]),
      
      // Initialize performance settings with timeout
      Promise.race([
        initializePerformanceSettings().catch(error => {
          console.warn('[App] Performance settings initialization failed:', error);
          return null;
        }),
        new Promise(resolve => setTimeout(() => {
          console.warn('[App] Performance settings initialization timed out');
          resolve(null);
        }, 1000)) // Reduced timeout
      ])
    ];
    
    await Promise.allSettled(initPromises);
    console.log('[App] Core stores initialization completed (with any failures handled)');
  }
  
  // Safe settings initialization
  async function safeInitializeSettings() {
    try {
      return await initializeSettings();
    } catch (error) {
      console.error('[App] Settings initialization failed, using defaults:', error);
      showToast('Settings could not be loaded, using defaults', 'warning');
      // Return default settings to prevent app crash
      return {
        maxResults: 1000,
        theme: 'auto',
        keyboardShortcuts: {},
        reactionMappings: {},
        debugMode: false,
        downloadFolder: null
      };
    }
  }
  
  // Additional store initialization
  async function initializeAdditionalStores() {
    // Any additional store initialization can go here
    // Currently empty but ready for expansion
  }
  
  // Workspace and UI initialization
  async function initializeWorkspaceAndUI(currentSettings: any) {
    try {
      // Request notification permission if needed
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (error) {
          console.warn('[App] Failed to request notification permission:', error);
        }
      }
      
      // Setup realtime updates subscription with error handling
      try {
        let previousInterval: number | null = null;
        unsubscribeRealtime = realtimeStore.subscribe(state => {
          try {
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
          } catch (error) {
            console.error('[App] Error in realtime subscription:', error);
          }
        });
      } catch (error) {
        console.error('[App] Failed to setup realtime subscription:', error);
      }
      
      // Subscribe to search results to detect new messages with error handling
      try {
        unsubscribeSearchResults = searchResults.subscribe(results => {
          try {
            const state = get(realtimeStore);
            if (!results || !state.isEnabled) return;
            
            // Calculate new messages
            const newMessages = results.messages.filter(m => !previousMessageIds.has(m.id));
            
            if (newMessages.length > 0) {
              // Found new messages
              
              // Show notification if enabled
              if (state.showNotifications && 'Notification' in window) {
                try {
                  if (Notification.permission === 'granted') {
                    new Notification('New Slack Messages', {
                      body: `${newMessages.length} new message${newMessages.length > 1 ? 's' : ''} in monitored channels`,
                      icon: '/slack-icon.png'
                    });
                  } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission();
                  }
                } catch (notifError) {
                  console.warn('[App] Failed to show notification:', notifError);
                }
              }
              
              // Auto-scroll if enabled
              if (state.autoScroll && resultListElement) {
                try {
                  resultListElement.scrollToTop();
                } catch (scrollError) {
                  console.warn('[App] Failed to auto-scroll:', scrollError);
                }
              }
            }
          } catch (error) {
            console.error('[App] Error in search results subscription:', error);
          }
        });
      } catch (error) {
        console.error('[App] Failed to setup search results subscription:', error);
      }
    
      // Initialize keyboard service with error handling
      try {
        keyboardService = initKeyboardService(currentSettings.keyboardShortcuts || {});
        console.log('[App] Keyboard service initialized successfully');
        
        // Register keyboard handlers with a slight delay to ensure components are mounted
        // This prevents race conditions with component binding
        setTimeout(() => {
          try {
            setupKeyboardHandlers();
            console.log('[App] Keyboard handlers setup successfully');
          } catch (handlerError) {
            console.error('[App] Failed to setup keyboard handlers (delayed):', handlerError);
            showToast('Some keyboard shortcuts may not work properly', 'warning');
          }
        }, 100);
        
      } catch (error) {
        console.error('[App] Failed to initialize keyboard service:', error);
        // Don't let keyboard initialization failure crash the app
        showToast('Keyboard shortcuts are not available', 'warning');
      }
      
      // The reaction service already loads mappings from localStorage
      // No need to load them again here unless we want to ensure sync
      // between settings store and reaction service store
      
      // Add global keyboard event listener with error handling
      try {
        document.addEventListener('keydown', handleGlobalKeydown);
        console.log('[App] Global keydown listener added successfully');
      } catch (error) {
        console.error('[App] Failed to add global keydown listener:', error);
      }
      
      // Add workspace switch event listener with error handling
      try {
        window.addEventListener('workspace-switched', handleWorkspaceSwitched);
        console.log('[App] Workspace switch listener added successfully');
      } catch (error) {
        console.error('[App] Failed to add workspace switch listener:', error);
      }
      
      // Initialize workspace mode with robust error handling
      await initializeWorkspaceMode();
      
    } catch (error) {
      console.error('[App] Error during workspace and UI initialization:', error);
      // Don't let this crash the app, but warn the user
      showToast('Some features may not be available due to initialization errors', 'warning');
    }
  }
  
  // Robust workspace initialization
  async function initializeWorkspaceMode() {
    try {
      // Check for multi-workspace mode preference
      const multiWorkspaceEnabled = localStorage.getItem('multiWorkspaceEnabled');
      if (multiWorkspaceEnabled === 'true') {
        useMultiWorkspace = true;
        await safeInitializeMultiWorkspace();
      } else {
        // Legacy single workspace mode
        await safeInitializeLegacyWorkspace();
      }
    } catch (error) {
      console.error('[App] Failed to initialize workspace mode:', error);
      searchError.set('Failed to initialize workspace. Please check your configuration and try again.');
    }
  }
  
  // Safe multi-workspace initialization
  async function safeInitializeMultiWorkspace() {
    try {
      await initializeMultiWorkspace();
    } catch (error) {
      console.error('[App] Multi-workspace initialization failed:', error);
      // Fall back to showing an error message instead of crashing
      searchError.set('Multi-workspace initialization failed. Please check your workspace configuration.');
    }
  }
  
  // Safe legacy workspace initialization
  async function safeInitializeLegacyWorkspace() {
    try {
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
            await safeInitializeMultiWorkspace();
            return;
          }
        } else {
          // Already has workspaces, use multi-workspace mode
          useMultiWorkspace = true;
          localStorage.setItem('multiWorkspaceEnabled', 'true');
          await safeInitializeMultiWorkspace();
          return;
        }
        
        // Continue with legacy mode
        await initializeLegacyToken(savedToken, savedWorkspace);
      } else {
        // No token saved, show a helpful message
        searchError.set('Welcome! Please configure your Slack token in Settings to start searching.');
      }
    } catch (error) {
      console.error('[App] Legacy workspace initialization failed:', error);
      searchError.set('Failed to load workspace configuration. Please check your settings.');
    }
  }
  
  // Safe legacy token initialization
  async function initializeLegacyToken(savedToken: string, savedWorkspace: string) {
    try {
      token = savedToken;
      maskedToken = maskTokenClient(savedToken);
      workspace = savedWorkspace || '';
      
      // Initialize token in backend
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
        searchError.set('Failed to initialize Slack connection. Please check your token.');
      }
    } catch (err) {
      console.error('[App] Failed to initialize legacy token:', err);
      searchError.set('Failed to initialize Slack connection. Please check your token and try again.');
    }
  }
  
  onDestroy(() => {
    // Clean up initialization timeout
    if (initializationTimeout) {
      clearTimeout(initializationTimeout);
      initializationTimeout = null;
    }
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
    try {
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
        const isInInput = target && (
          target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.contentEditable === 'true'
        );
        
        if (!isInInput) {
          event.preventDefault();
          showKeyboardHelp = !showKeyboardHelp;
          return;
        }
      }
      
      if (keyboardService && typeof keyboardService.handleKeyboardEvent === 'function') {
        keyboardService.handleKeyboardEvent(event);
      }
    } catch (error) {
      console.error('[App] Error handling global keydown:', error);
      // Don't let keyboard errors crash the app
    }
  }
  
  function setupKeyboardHandlers() {
    try {
      console.log('🔍 DEBUG: Setting up keyboard handlers', {
        keyboardService: !!keyboardService,
        shortcuts: $settings.keyboardShortcuts
      });
      
      if (!keyboardService) {
        console.error('[App] Cannot setup keyboard handlers: keyboardService is null');
        return;
      }
      
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
          if (!showSettings && searchBarElement && typeof searchBarElement.focusSearchInput === 'function') {
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
                    if (searchBarElement && typeof searchBarElement.clearChannelSelection === 'function' && typeof searchBarElement.focusSearchInput === 'function') {
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
                  
                  if (searchBarElement && typeof searchBarElement.clearChannelSelection === 'function' && typeof searchBarElement.focusSearchInput === 'function') {
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
          if (!showSettings && searchBarElement && typeof searchBarElement.toggleAdvancedSearch === 'function') {
            searchBarElement.toggleAdvancedSearch();
          }
        },
        allowInInput: true
      });
    
      // Focus Results
      keyboardService.registerHandler('focusResults', {
        action: () => {
          if (!showSettings && resultListElement && typeof resultListElement.focusList === 'function') {
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
          if (!showSettings && searchBarElement && 
              typeof searchBarElement.isAdvancedOpen === 'function' && 
              typeof searchBarElement.toggleAdvancedSearch === 'function' && 
              typeof searchBarElement.focusUrlInput === 'function') {
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
          if (!showSettings && searchBarElement && typeof searchBarElement.toggleChannelSelector === 'function') {
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

      // Toggle Saved Searches - delegate to SearchBar
      console.log('[App] About to register toggleSavedSearches handler', {
        searchBarElement: !!searchBarElement,
        hasToggleMethod: searchBarElement && typeof searchBarElement.toggleSavedSearches === 'function'
      });
      
      keyboardService.registerHandler('toggleSavedSearches', {
        action: () => {
          console.log('[App] toggleSavedSearches triggered', {
            showSettings,
            searchBarElement: !!searchBarElement,
            hasToggleMethod: searchBarElement && typeof searchBarElement.toggleSavedSearches === 'function'
          });
          if (!showSettings && searchBarElement && typeof searchBarElement.toggleSavedSearches === 'function') {
            searchBarElement.toggleSavedSearches();
          }
        },
        allowInInput: true,  // Allow in input fields so Ctrl+/ works everywhere
        preventDefault: true,  // Prevent default browser save action
        stopPropagation: true
      });
      
      console.log('[App] toggleSavedSearches handler registered successfully');

      // Save Current Search - delegate to SearchBar
      console.log('[App] About to register saveCurrentSearch handler', {
        searchBarElement: !!searchBarElement,
        hasSaveMethod: searchBarElement && typeof searchBarElement.saveCurrentSearch === 'function'
      });
      
      keyboardService.registerHandler('saveCurrentSearch', {
        action: () => {
          console.log('[App] saveCurrentSearch triggered', {
            showSettings,
            searchBarElement: !!searchBarElement,
            hasSaveMethod: searchBarElement && typeof searchBarElement.saveCurrentSearch === 'function'
          });
          if (!showSettings && searchBarElement && typeof searchBarElement.saveCurrentSearch === 'function') {
            searchBarElement.saveCurrentSearch();
          }
        },
        allowInInput: true,
        preventDefault: true
      });
      
      console.log('[App] saveCurrentSearch handler registered successfully');

      // Removed Ctrl+Alt+1-9 shortcuts for favorite users
      // These shortcuts had compatibility issues across platforms
      // Users can select favorites through the UI instead
    } catch (error) {
      console.error('[App] Failed to setup keyboard handlers:', error);
      // Don't let keyboard handler setup failure crash the app
      showToast('Keyboard shortcuts may not work properly', 'warning');
    }
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
    try {
      console.log('[App] Handling workspace switch...');
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
          if (searchBarElement && typeof searchBarElement.clearChannelSelection === 'function') {
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
    
    } catch (error) {
      console.error('[App] Error during workspace switch:', error);
      searchError.set('Failed to switch workspace: ' + (error instanceof Error ? error.message : 'Unknown error'));
      searchLoading.set(false);
    }
  }
  
  async function handleSearch(event?: CustomEvent) {
    try {
      searchLoading.set(true);
      searchError.set(null);
      console.log('[App] Starting search...');
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
        
        // DEBUG: Check if result has files
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
    if (!searchBarElement || typeof searchBarElement.triggerRealtimeSearch !== 'function') {
      console.warn('[App] Cannot perform realtime update: searchBarElement not ready');
      return;
    }
    
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
  <!-- App Initialization Status -->
  {#if !appInitialized && !initializationError}
    <div class="initialization-loading">
      <div class="loading-spinner">
        <div class="spinner"></div>
      </div>
      <h2>Initializing Personal Slack Client...</h2>
      <p class="init-step">{initializationStep}</p>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {initializationProgress}%"></div>
      </div>
      <p class="init-hint">Please wait while we set up your workspace.</p>
    </div>
  {:else if initializationError}
    <div class="initialization-error" role="alert">
      <div class="error-icon">⚠️</div>
      <h2>Initialization Failed</h2>
      <pre class="error-message">{initializationError}</pre>
      <details class="debug-info">
        <summary>Debug Information</summary>
        <div class="debug-content">
          <p><strong>Browser:</strong> {navigator.userAgent}</p>
          <p><strong>URL:</strong> {window.location.href}</p>
          <p><strong>Ready State:</strong> {document.readyState}</p>
          <p><strong>Local Storage Available:</strong> {typeof Storage !== 'undefined' ? 'Yes' : 'No'}</p>
          <p><strong>Tauri Environment:</strong> {typeof window !== 'undefined' && '__TAURI__' in window ? 'Yes' : 'No'}</p>
          <p><strong>App Element Found:</strong> {document.getElementById('app') ? 'Yes' : 'No'}</p>
        </div>
      </details>
      <div class="error-actions">
        <button on:click={() => window.location.reload()} class="btn-primary">
          Reload Page
        </button>
        <button on:click={() => {
          appInitialized = true;
          initializationError = null;
        }} class="btn-secondary">
          Continue Anyway
        </button>
        <button on:click={() => showSettings = true} class="btn-secondary">
          Open Settings
        </button>
      </div>
    </div>
  {:else}
    <!-- Main App UI -->
    <ErrorBoundary fallback="Header functionality is temporarily unavailable">
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
          <ErrorBoundary fallback="Workspace switcher unavailable">
            <WorkspaceSwitcher 
              on:workspaceSwitched={handleWorkspaceSwitched}
              on:workspaceAdded={handleWorkspaceSwitched}
            />
          </ErrorBoundary>
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
    </ErrorBoundary>
    
    <!-- Settings Panel -->
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
        
        <DownloadSettings />
        
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
      <!-- Main App Content with Error Boundaries -->
      <ErrorBoundary fallback="Error banner unavailable">
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
      </ErrorBoundary>
    
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

    <!-- Global UI Components with Error Boundaries -->
    <ErrorBoundary fallback="Keyboard help unavailable">
      <KeyboardHelp bind:show={showKeyboardHelp} />
    </ErrorBoundary>
    
    <ErrorBoundary fallback="Emoji search unavailable">
      <EmojiSearchDialog 
        bind:isOpen={showEmojiSearch}
        on:select={(event) => {
          logger.debug('Selected emoji:', event.detail);
          // You can handle the selected emoji here if needed
        }}
      />
    </ErrorBoundary>
    
    <ErrorBoundary fallback="Toast notifications unavailable">
      <Toast />
    </ErrorBoundary>
    
    <ErrorBoundary fallback="Lightbox unavailable">
      <LightboxContainer />
    </ErrorBoundary>
    
    <ErrorBoundary fallback="Performance dashboard unavailable">
      {#if $performanceSettings.performanceMetrics}
        <PerformanceDashboard />
      {/if}
    </ErrorBoundary>
    
    <ErrorBoundary fallback="Performance monitor unavailable">
      <!-- Performance Monitor for real-time metrics (only visible in debug mode) -->
      {#if $settings.debugMode}
        <PerformanceMonitor />
      {/if}
    </ErrorBoundary>

    <!-- Global Confirmation Dialog -->
    <ConfirmationDialog />
  {/if} <!-- End main app initialized check -->
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
    --danger: #dc3545;
    --danger-bg: #f8d7da;
    --danger-hover: #c82333;
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
    --danger: #f56565;
    --danger-bg: #4a2525;
    --danger-hover: #dc2626;
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
  
  /* Initialization loading state */
  .initialization-loading,
  .initialization-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
    background: var(--bg-primary);
  }
  
  .loading-spinner {
    margin-bottom: 2rem;
  }
  
  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid var(--border);
    border-top: 4px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .initialization-loading h2,
  .initialization-error h2 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
    font-size: 1.75rem;
  }
  
  .initialization-loading p,
  .initialization-error p {
    margin: 0 0 2rem 0;
    color: var(--text-secondary);
    font-size: 1.1rem;
  }
  
  .initialization-loading .init-step {
    margin: 0 0 1rem 0;
    color: var(--primary);
    font-weight: 500;
    min-height: 1.5rem;
  }
  
  .initialization-loading .init-hint {
    margin: 1rem 0 0 0;
    font-size: 0.9rem;
  }
  
  .progress-bar {
    width: 300px;
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
    margin: 0 auto;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
  }
  
  .initialization-error {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin: 2rem auto;
    max-width: 600px;
    min-height: auto;
  }
  
  .initialization-error .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .initialization-error .error-message {
    color: var(--error);
    font-weight: 500;
    background: var(--bg-primary);
    padding: 1rem;
    border-radius: 4px;
    border: 1px solid var(--error);
    max-width: 800px;
    overflow-x: auto;
    text-align: left;
    font-family: monospace;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .initialization-error .debug-info {
    margin-top: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem;
    max-width: 800px;
    text-align: left;
  }
  
  .initialization-error .debug-info summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--text-secondary);
    user-select: none;
  }
  
  .initialization-error .debug-info .debug-content {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .initialization-error .debug-info .debug-content p {
    margin: 0.5rem 0;
  }
  
  .initialization-error .debug-info .debug-content strong {
    color: var(--text-primary);
  }
  
  .initialization-error .error-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 2rem;
  }
</style>