<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Message } from '../types/slack';
  import MessageItem from './MessageItem.svelte';
  import OptimizedMessageItem from './OptimizedMessageItem.svelte';
  import PostDialog from './PostDialog.svelte';
  import { selectedMessage, searchParams, reactionLoadingState } from '../stores/search';
  import { isPostDialogOpen } from '../stores/postDialog';
  import { getKeyboardService } from '../services/keyboardService';
  import { urlService } from '../services/urlService';
  import { openUrlsSmart } from '../api/urls';
  import { getThreadFromUrl } from '../api/slack';
  import { showInfo, showError } from '../stores/toast';
  import { decodeSlackText } from '../utils/htmlEntities';
  import { performanceSettings } from '../stores/performance';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';
  import { logger } from '../services/logger';
  import { savedSearchOpen } from '../stores/savedSearchOpen';
  import { lightboxOpen, filePreviewStore } from '../stores/filePreview';
  import { processFileMetadata } from '../services/fileService';
  import { realtimeStore } from '../stores/realtime';
  import { settings } from '../stores/settings';
  import { searchHistoryTracker } from '../services/searchHistoryTracker';
  import { bookmarkStore } from '../stores/bookmarks';

  export let messages: Message[] = [];
  export let loading = false;
  export let error: string | null = null;

  // DEBUG: Log messages received

  let focusedIndex = -1;
  let listContainer: HTMLDivElement;
  let messageElements: HTMLElement[] = [];
  let isExpanded = false;
  let isRealtimeUpdating = false;
  let previousMessageIds = new Set<string>();

  // Search history tracking for new message highlighting (experimental feature)
  let previousSearchMessageIds = new Set<string>();
  
  // Post dialog state
  let showPostDialog = false;
  let postMode: 'channel' | 'thread' = 'channel';
  let continuousMode = false;
  let postInitialText = ''; // For pre-filled text (e.g., quoted messages)
  
  // Progressive loading state
  const INITIAL_LOAD = 50;
  const LOAD_INCREMENT = 50;
  let displayedCount = INITIAL_LOAD;
  let loadMoreObserver: IntersectionObserver | null = null;
  let sentinelElement: HTMLDivElement;
  
  // Action to observe sentinel element
  function observeSentinel(node: HTMLElement) {
    if (loadMoreObserver) {
      loadMoreObserver.observe(node);
    }
    
    return {
      destroy() {
        if (loadMoreObserver) {
          loadMoreObserver.unobserve(node);
        }
      }
    };
  }
  
  function handleMessageClick(message: Message) {
    selectedMessage.set(message);
    const index = messages.findIndex(m => m.ts === message.ts);
    if (index >= 0) {
      focusedIndex = index;
    }
  }
  
  // Check if any filters are active
  $: hasFilters = $searchParams && (
    $searchParams.channel || 
    $searchParams.user || 
    $searchParams.fromDate || 
    $searchParams.toDate
  );
  
  // Check if multiple channels are selected
  $: isMultiChannel = $searchParams?.channel?.includes(',');
  
  // Visible messages for progressive loading
  $: visibleMessages = messages.slice(0, displayedCount);
  
  // Reset display count when messages change (new search)
  let previousMessageLength = 0;
  $: if (messages && messages.length !== previousMessageLength) {
    // Check if this is a realtime update
    const isRealtimeMode = $realtimeStore.isEnabled && previousMessageLength > 0;

    if (isRealtimeMode) {
      // For realtime updates, briefly show updating state
      isRealtimeUpdating = true;
      setTimeout(() => {
        isRealtimeUpdating = false;
      }, 300);

      // Preserve scroll position
      if (listContainer && $realtimeStore.autoScroll === false) {
        const scrollTop = listContainer.scrollTop;
        requestAnimationFrame(() => {
          if (listContainer) {
            listContainer.scrollTop = scrollTop;
          }
        });
      }
    } else {
      // Normal search - reset progressive loading
      displayedCount = Math.min(INITIAL_LOAD, messages.length);

      // Only reset focus if it's a completely new set of messages (not just updates)
      if (previousMessageLength === 0 || messages.length === 0) {
        focusedIndex = -1;
      }

      // Experimental feature: Track search history for new message highlighting
      if ($settings.experimentalFeatures?.highlightNewSearchResults && $searchParams) {
        // Load previous search results
        previousSearchMessageIds = searchHistoryTracker.getPreviousMessageIds($searchParams);

        // Save current search results for next time
        const currentMessageIds = messages.map(m => m.ts);
        searchHistoryTracker.saveSearchHistory($searchParams, currentMessageIds);

        console.log('[ResultList] Search history tracking:', {
          previousCount: previousSearchMessageIds.size,
          currentCount: currentMessageIds.length,
          newCount: currentMessageIds.filter(id => !previousSearchMessageIds.has(id)).length
        });
      }
    }

    // Update tracking variables
    const currentIds = new Set(messages.map(m => m.ts));
    previousMessageIds = currentIds;
    previousMessageLength = messages.length;
  }
  
  export function focusList() {
    console.log('🔍 DEBUG: focusList called', {
      messagesLength: messages.length,
      focusedIndex,
      listContainer: !!listContainer
    });

    if (messages.length > 0) {
      // Only reset to first item if no item is currently focused
      if (focusedIndex === -1) {
        focusedIndex = 0;
      }

      // Focus the list container to enable keyboard navigation
      if (listContainer) {
        listContainer.focus();
        console.log('🔍 DEBUG: List container focused, activeElement is now:', document.activeElement?.tagName);
      }

      // Update focus and scroll
      updateFocus();
    }
  }

  // メッセージタイムスタンプでメッセージを検索してフォーカスする
  export function focusMessageByTs(messageTs: string) {
    console.log('[ResultList] focusMessageByTs called', { messageTs, messagesLength: messages.length });

    const index = messages.findIndex(m => m.ts === messageTs);
    if (index >= 0) {
      console.log('[ResultList] Found message at index', index);
      focusedIndex = index;

      // メッセージが progressive loading で未表示の場合は表示する
      if (index >= displayedCount) {
        console.log('[ResultList] Message not yet displayed, loading more messages');
        displayedCount = Math.min(index + LOAD_INCREMENT, messages.length);
      }

      updateFocus();

      // メッセージをスクロールして表示
      setTimeout(() => {
        const message = messages[index];
        const messageElement = document.querySelector(`[data-message-ts="${message.ts}"]`) as HTMLElement;
        if (messageElement) {
          console.log('[ResultList] Scrolling to message element');
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          console.warn('[ResultList] Message element not found in DOM');
        }
      }, 100);
    } else {
      console.warn('[ResultList] Message not found with ts:', messageTs);
    }
  }

  // Handle focus events for expansion
  function handleContainerFocus() {
    isExpanded = true;
  }

  function handleContainerBlur(event: FocusEvent) {
    // Check if focus is moving to a child element
    if (listContainer && !listContainer.contains(event.relatedTarget as Node)) {
      isExpanded = false;
    }
  }
  
  export function scrollToTop() {
    if (listContainer) {
      listContainer.scrollTop = 0;
    }
  }

  // Export function to reset expanded state when search bar is toggled
  export function resetExpanded() {
    isExpanded = false;
  }
  
  function updateFocus() {
    if (focusedIndex >= 0 && focusedIndex < messages.length) {
      const message = messages[focusedIndex];
      selectedMessage.set(message);

      // Ensure the focused message is loaded if using progressive loading
      if (focusedIndex >= displayedCount) {
        displayedCount = Math.min(focusedIndex + LOAD_INCREMENT, messages.length);
      }

      // CRITICAL: Ensure list container has focus for keyboard navigation
      if (listContainer && document.activeElement !== listContainer) {
        listContainer.focus();
      }

      // Simple direct scroll using scrollTop
      requestAnimationFrame(() => {
        const messageElement = document.querySelector(`[data-message-ts="${message.ts}"]`) as HTMLElement;
        if (messageElement && listContainer) {
          // Remove previous focus indicators
          document.querySelectorAll('[data-message-ts]').forEach(el => {
            el.classList.remove('keyboard-focused');
          });

          // Add focus indicator to current element
          messageElement.classList.add('keyboard-focused');

          // Debug info
          const canScroll = listContainer.scrollHeight > listContainer.clientHeight;
          const computedStyle = window.getComputedStyle(listContainer);
          console.log('[SCROLL DEBUG] Container info:', {
            canScroll,
            scrollHeight: listContainer.scrollHeight,
            clientHeight: listContainer.clientHeight,
            offsetHeight: listContainer.offsetHeight,
            currentScrollTop: listContainer.scrollTop,
            computedHeight: computedStyle.height,
            computedMaxHeight: computedStyle.maxHeight,
            computedOverflow: computedStyle.overflowY,
            parentHeight: listContainer.parentElement?.offsetHeight,
            container: listContainer
          });

          // Get the actual position relative to the messages container
          const rect = messageElement.getBoundingClientRect();
          const containerRect = listContainer.getBoundingClientRect();

          // Calculate relative position
          const relativeTop = rect.top - containerRect.top;
          const isAbove = relativeTop < 0;
          const isBelow = relativeTop + rect.height > containerRect.height;

          console.log('[SCROLL DEBUG] Position:', {
            relativeTop,
            isAbove,
            isBelow,
            elementHeight: rect.height,
            containerHeight: containerRect.height,
            messageIndex: focusedIndex
          });

          // Scroll if needed
          if (isAbove || isBelow) {
            // Calculate target scroll position
            const targetScrollTop = listContainer.scrollTop + relativeTop - 20; // 20px padding from top
            console.log('[SCROLL DEBUG] Scrolling from', listContainer.scrollTop, 'to', targetScrollTop);

            listContainer.scrollTop = targetScrollTop;

            // Verify scroll happened
            setTimeout(() => {
              console.log('[SCROLL DEBUG] After scroll:', listContainer.scrollTop);
            }, 100);
          }
        } else if (!messageElement) {
          // If element not found (progressive loading), try once more after short delay
          setTimeout(() => {
            const retryElement = document.querySelector(`[data-message-ts="${message.ts}"]`) as HTMLElement;
            if (retryElement && listContainer) {
              // Remove previous focus indicators
              document.querySelectorAll('[data-message-ts]').forEach(el => {
                el.classList.remove('keyboard-focused');
              });

              // Add focus indicator
              retryElement.classList.add('keyboard-focused');

              // Use the same relative position approach
              const rect = retryElement.getBoundingClientRect();
              const containerRect = listContainer.getBoundingClientRect();
              const relativeTop = rect.top - containerRect.top;
              const isAbove = relativeTop < 0;
              const isBelow = relativeTop + rect.height > containerRect.height;

              if (isAbove || isBelow) {
                const targetScrollTop = listContainer.scrollTop + relativeTop - 20;
                listContainer.scrollTop = targetScrollTop;
              }
            }
          }, 50);
        }
      });
    }
  }
  
  function handleKeyNavigation(direction: 'up' | 'down') {
    if (messages.length === 0) return;

    // CRITICAL: Ensure list container has focus before navigation
    if (listContainer && document.activeElement !== listContainer) {
      listContainer.focus();
    }

    // Initialize focus if not set - start from first message
    if (focusedIndex === -1) {
      focusedIndex = 0;
    } else {
      // Normal navigation when focus is already set
      if (direction === 'down') {
        if (focusedIndex < messages.length - 1) {
          focusedIndex++;
          // Ensure the next message is loaded
          if (focusedIndex >= displayedCount) {
            displayedCount = Math.min(focusedIndex + LOAD_INCREMENT, messages.length);
          }
        } else {
          // Don't wrap, stay at the last message
          focusedIndex = messages.length - 1;
        }
      } else { // direction === 'up'
        if (focusedIndex > 0) {
          focusedIndex--;
        } else {
          // Don't wrap, stay at the first message
          focusedIndex = 0;
        }
      }
    }

    updateFocus();
  }
  
  function jumpToFirst() {
    if (messages.length === 0) return;

    // Check if the result list has focus or contains the active element
    if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
      return; // Don't handle if focus is elsewhere
    }

    focusedIndex = 0;

    // Show a toast with message preview
    const firstMessage = messages[focusedIndex];
    if (firstMessage) {
      const preview = decodeSlackText(firstMessage.text).substring(0, 100);
      const suffix = firstMessage.text.length > 100 ? '...' : '';
      showInfo(
        `Jumped to first message (#1/${messages.length})`,
        `${firstMessage.userName}: ${preview}${suffix}`
      );
    }

    updateFocus();

    // Add highlight animation
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-message-ts="${firstMessage.ts}"]`) as HTMLElement;
      if (element) {
        element.classList.add('highlight-jump');
        setTimeout(() => {
          element.classList.remove('highlight-jump');
        }, 1500);
      }
    });
  }
  
  function jumpToLast() {
    if (messages.length === 0) return;

    // Check if the result list has focus or contains the active element
    if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
      return; // Don't handle if focus is elsewhere
    }

    focusedIndex = messages.length - 1;

    // Ensure all messages are loaded before jumping to the last one
    if (displayedCount < messages.length) {
      displayedCount = messages.length;
    }

    // Show a toast with message preview
    const lastMessage = messages[focusedIndex];
    if (lastMessage) {
      const preview = decodeSlackText(lastMessage.text).substring(0, 100);
      const suffix = lastMessage.text.length > 100 ? '...' : '';
      showInfo(
        `Jumped to last message (#${focusedIndex + 1}/${messages.length})`,
        `${lastMessage.userName}: ${preview}${suffix}`
      );
    }

    updateFocus();

    // Add highlight animation
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-message-ts="${lastMessage.ts}"]`) as HTMLElement;
      if (element) {
        element.classList.add('highlight-jump');
        setTimeout(() => {
          element.classList.remove('highlight-jump');
        }, 1500);
      }
    });
  }
  
  function openPostDialog(mode: 'channel' | 'thread', isContinuous: boolean = false, initialText: string = '') {
    if (focusedIndex >= 0 && focusedIndex < messages.length) {
      postMode = mode;
      continuousMode = isContinuous;
      postInitialText = initialText;
      showPostDialog = true;
      isPostDialogOpen.set(true);  // Update global store
    }
  }
  
  function handlePostSuccess() {
    showPostDialog = false;
    isPostDialogOpen.set(false);  // Update global store
    // Refocus the list container immediately
    requestAnimationFrame(() => {
      if (listContainer) {
        listContainer.focus();
      }
    });
  }
  
  async function handleOpenUrls() {
    if (focusedIndex < 0 || focusedIndex >= messages.length) return;
    
    const messageToOpen = messages[focusedIndex];
    
    try {
      // Extract URLs from message text (use decoded text for URL extraction)
      const extractedUrls = urlService.extractUrls(decodeSlackText(messageToOpen.text));
      
      // Check if we have URLs to open
      if (extractedUrls.slackUrls.length === 0 && extractedUrls.externalUrls.length === 0) {
        showInfo('No URLs found', 'This message does not contain any URLs to open.');
        return;
      }
      
      // Special handling for Slack links - load in thread view instead of opening
      if (extractedUrls.slackUrls.length > 0) {
        const slackUrl = extractedUrls.slackUrls[0]; // Use the first Slack URL
        
        try {
          showInfo('Loading thread', 'Loading Slack thread...');
          
          // Load the thread from the Slack URL
          const thread = await getThreadFromUrl(slackUrl);
          
          // Set the selected message to display the thread
          if (thread && thread.parent) {
            selectedMessage.set(thread.parent);
            showInfo('Thread loaded', 'Thread successfully loaded in the thread view.');
          }
          
          // Maintain focus on the list
          if (listContainer) {
            listContainer.focus();
          }
          
          // Automatically open external URLs if present (no confirmation needed)
          if (extractedUrls.externalUrls.length > 0) {
            // Open all external URLs
            const result = await openUrlsSmart(
              null, // No Slack URL since we handled it
              extractedUrls.externalUrls,
              200 // 200ms delay between openings
            );
            
            if (result.errors.length > 0) {
              showError('Some URLs failed to open', result.errors.join(', '));
            }
          }
          
          return; // Exit early since we handled the Slack link
        } catch (error) {
          console.error('Failed to load thread from Slack URL:', error);
          showError('Failed to load thread', error instanceof Error ? error.message : 'Unknown error');
          
          // Fall back to opening the URL normally
          showInfo('Opening in browser', 'Could not load thread, opening Slack link in browser instead.');
        }
      }
      
      // Original behavior for non-Slack URLs or if Slack thread loading failed
      const prepared = urlService.prepareUrlsForOpening(extractedUrls);
      
      // Check if confirmation is needed for too many external URLs
      if (urlService.requiresConfirmation(prepared.externalUrls.length)) {
        const confirmed = confirm(`Opening ${prepared.externalUrls.length} external URLs. Continue?`);
        if (!confirmed) {
          showInfo('Cancelled', 'URL opening was cancelled by user.');
          return;
        }
      }
      
      // Show user-friendly message
      const openingMessage = urlService.generateOpeningMessage(
        extractedUrls.slackUrls.length, 
        extractedUrls.externalUrls.length
      );
      showInfo('Opening URLs', openingMessage);
      
      // Open URLs with smart handling
      const result = await openUrlsSmart(
        prepared.slackUrl,
        prepared.externalUrls,
        200 // 200ms delay between openings
      );
      
      // Show result
      if (result.errors.length > 0) {
        showError('Some URLs failed to open', result.errors.join(', '));
      }
      
      // CRITICAL: Ensure list container maintains focus after URL opening
      // This prevents focus loss issues that occur with navigation direction
      setTimeout(() => {
        if (listContainer) {
          listContainer.focus();
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to open URLs:', error);
      showError('Failed to open URLs', error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  function handlePostCancel() {
    showPostDialog = false;
    isPostDialogOpen.set(false);  // Update global store
    // Refocus the list container immediately
    requestAnimationFrame(() => {
      if (listContainer) {
        listContainer.focus();
      }
    });
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    // Check if thread view has focus - if so, don't handle navigation here
    const threadViewElement = document.querySelector('.thread-view');
    if (threadViewElement && threadViewElement.contains(document.activeElement)) {
      return; // Let thread view handle its own navigation
    }
    
    // Don't handle shortcuts if post dialog is open
    if (showPostDialog) {
      return;
    }
    
    // Handle Enter key
    if (event.key === 'Enter') {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < messages.length) {
        const message = messages[focusedIndex];
        selectedMessage.set(message);
      }
      return;
    }
    
    // NOTE: P and T key handling moved to KeyboardService to avoid conflicts with emoji reactions
    // The KeyboardService now handles:
    // - P key: Post to channel (via 'postMessage' handler)
    // - T key: Thread reply (via 'replyInThread' handler)
  }
  
  onMount(() => {
    // Setup Intersection Observer for progressive loading
    if (typeof IntersectionObserver !== 'undefined') {
      loadMoreObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && displayedCount < messages.length) {
              // Load more messages when sentinel becomes visible
              displayedCount = Math.min(displayedCount + LOAD_INCREMENT, messages.length);
            }
          });
        },
        {
          rootMargin: '200px', // Start loading 200px before sentinel is visible
          threshold: 0.1
        }
      );
    }
    
    const keyboardService = getKeyboardService();
    if (!keyboardService) return;
    
    // Next Result
    keyboardService.registerHandler('nextResult', {
      action: () => {
        console.log('🔍 DEBUG: nextResult handler called', {
          lightboxOpen: $lightboxOpen,
          messagesLength: messages.length,
          activeElement: document.activeElement?.tagName,
          listContainer: !!listContainer,
          containsActive: listContainer?.contains(document.activeElement),
          isListActive: document.activeElement === listContainer
        });

        // Check if lightbox is open - if so, don't handle navigation
        if ($lightboxOpen) {
          console.log('🔍 DEBUG: Lightbox open, skipping navigation');
          return; // Let lightbox handle navigation
        }

        // Check if saved search dropdown is open
        const savedSearchDropdownOpen = document.querySelector('.saved-search-dropdown');
        if (savedSearchDropdownOpen) {
          console.log('🔍 DEBUG: Saved search dropdown open, skipping navigation');
          return; // Let SavedSearchManager handle navigation
        }

        // Check if thread view has focus - if so, don't handle
        const threadViewElement = document.querySelector('.thread-view');
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          console.log('🔍 DEBUG: Thread view has focus, skipping navigation');
          return; // Let thread view handle its own navigation
        }

        // Also check if the result list actually has focus
        if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
          console.log('🔍 DEBUG: Result list not focused, skipping navigation');
          return; // Don't handle if focus is elsewhere
        }

        console.log('🔍 DEBUG: Executing nextResult navigation');
        if (messages.length > 0) {
          handleKeyNavigation('down');
        }
      },
      allowInInput: false
    });
    
    // Previous Result
    keyboardService.registerHandler('prevResult', {
      action: () => {
        console.log('🔍 DEBUG: prevResult handler called', {
          lightboxOpen: $lightboxOpen,
          messagesLength: messages.length,
          activeElement: document.activeElement?.tagName,
          listContainer: !!listContainer,
          containsActive: listContainer?.contains(document.activeElement),
          isListActive: document.activeElement === listContainer
        });

        // Check if lightbox is open - if so, don't handle navigation
        if ($lightboxOpen) {
          console.log('🔍 DEBUG: Lightbox open, skipping navigation');
          return; // Let lightbox handle navigation
        }

        // Check if saved search dropdown is open
        const savedSearchDropdownOpen = document.querySelector('.saved-search-dropdown');
        if (savedSearchDropdownOpen) {
          console.log('🔍 DEBUG: Saved search dropdown open, skipping navigation');
          return; // Let SavedSearchManager handle navigation
        }

        // Check if thread view has focus - if so, don't handle
        const threadViewElement = document.querySelector('.thread-view');
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          console.log('🔍 DEBUG: Thread view has focus, skipping navigation');
          return; // Let thread view handle its own navigation
        }

        // Also check if the result list actually has focus
        if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
          console.log('🔍 DEBUG: Result list not focused, skipping navigation');
          return; // Don't handle if focus is elsewhere
        }

        console.log('🔍 DEBUG: Executing prevResult navigation');
        if (messages.length > 0) {
          handleKeyNavigation('up');
        }
      },
      allowInInput: false
    });
    
    // Open Result (already selected via navigation)
    keyboardService.registerHandler('openResult', {
      action: () => {
        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          const message = messages[focusedIndex];
          selectedMessage.set(message);
        }
      },
      allowInInput: false
    });
    
    // Post Message (P key)
    keyboardService.registerHandler('postMessage', {
      action: () => {
        // Don't handle if post dialog is open
        if (showPostDialog) return;
        
        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          openPostDialog('channel');
        }
      },
      allowInInput: false
    });
    
    // Reply in Thread (T key)
    keyboardService.registerHandler('replyInThread', {
      action: () => {
        // Don't handle if post dialog is open
        if (showPostDialog) return;

        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          openPostDialog('thread');
        }
      },
      allowInInput: false
    });

    // Post Message Continuous (Shift+P key)
    keyboardService.registerHandler('postMessageContinuous', {
      action: () => {
        // Don't handle if post dialog is open
        if (showPostDialog) return;

        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          openPostDialog('channel', true);
        }
      },
      allowInInput: false
    });

    // Reply in Thread Continuous (Shift+T key)
    keyboardService.registerHandler('replyInThreadContinuous', {
      action: () => {
        // Don't handle if post dialog is open
        if (showPostDialog) return;

        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          openPostDialog('thread', true);
        }
      },
      allowInInput: false
    });
    
    // Jump to First (H key)
    keyboardService.registerHandler('jumpToFirst', {
      action: () => {
        // Check if lightbox is open - if so, don't handle navigation
        if ($lightboxOpen) {
          return; // Let lightbox handle navigation
        }

        // Check if thread view has focus - if so, don't handle
        const threadViewElement = document.querySelector('.thread-view');
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          return; // Let thread view handle its own navigation
        }

        // Also check if the result list actually has focus
        if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
          return; // Don't handle if focus is elsewhere
        }

        if (messages.length > 0) {
          jumpToFirst();
        }
      },
      allowInInput: false
    });
    
    // Jump to Last Message (E key)
    keyboardService.registerHandler('jumpToLast', {
      action: () => {
        // Check if lightbox is open - if so, don't handle
        if ($lightboxOpen) {
          return; // Let lightbox handle navigation
        }

        // Check if thread view has focus - if so, don't handle
        const threadViewElement = document.querySelector('.thread-view');
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          return; // Let thread view handle its own navigation
        }

        // Also check if the result list actually has focus
        if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
          return; // Don't handle if focus is elsewhere
        }

        // Don't handle if post dialog is open
        if (showPostDialog) {
          return;
        }

        // Jump to last message
        if (messages.length > 0) {
          jumpToLast();
        }
      },
      allowInInput: false
    });

    // Quote Message (Q key)
    keyboardService.registerHandler('quoteMessage', {
      action: () => {
        // Check if lightbox is open - if so, don't handle
        if ($lightboxOpen) {
          return; // Let lightbox handle navigation
        }

        // Check if thread view has focus - if so, let it handle the quote
        const threadViewElement = document.querySelector('.thread-view');
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          // Don't process here, ThreadView will handle it via its own keydown handler
          return;
        }

        // Also check if the result list actually has focus
        if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
          return; // Don't handle if focus is elsewhere
        }

        // Don't handle if post dialog is open
        if (showPostDialog) {
          return;
        }

        // Quote the focused message
        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          const message = messages[focusedIndex];
          const decodedText = decodeSlackText(message.text);
          // Quote the message text by adding "> " to the beginning of each line
          // Add a newline at the end so the cursor is positioned on a new line
          const quotedText = decodedText.split('\n').map(line => `> ${line}`).join('\n') + '\n';
          openPostDialog('channel', false, quotedText);
        }
      },
      allowInInput: false
    });
    
    // Open URLs (Alt+Enter)
    keyboardService.registerHandler('openUrls', {
      action: async () => {
        // CRITICAL: Ensure focus is on list container before handling
        // This prevents the focus direction issue
        if (listContainer && document.activeElement !== listContainer) {
          listContainer.focus();
        }

        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          await handleOpenUrls();
        }
      },
      allowInInput: false
    });

    // Open File Preview (i key) - opens file attachments in lightbox
    // NOTE: We only handle this if ResultList has focus.
    // ThreadView handles its own "i" key in handleKeyDown
    keyboardService.registerHandler('openLightbox', {
      action: () => {
        console.log('[ResultList] openLightbox handler called - START', {
          timestamp: Date.now(),
          lightboxOpen: $lightboxOpen,
          focusedIndex,
          messagesLength: messages.length
        });

        // Check if lightbox is already open - if so, don't handle
        if ($lightboxOpen) {
          console.log('[ResultList] Lightbox already open, ignoring');
          return;
        }

        // CRITICAL: First check if ThreadView has focus - if so, don't handle
        // We need to check multiple possible focus targets in ThreadView
        const threadViewElement = document.querySelector('.thread-view') as HTMLElement;
        const threadMessagesElement = document.querySelector('.thread-messages') as HTMLElement;

        // Check if activeElement is within ThreadView hierarchy
        let currentElement = document.activeElement;
        let isInThreadView = false;

        // Walk up the DOM tree to check if we're inside ThreadView
        while (currentElement && currentElement !== document.body) {
          if (currentElement.classList.contains('thread-view') ||
              currentElement.classList.contains('thread-messages')) {
            isInThreadView = true;
            break;
          }
          currentElement = currentElement.parentElement;
        }

        console.log('[ResultList] Focus hierarchy check:', {
          activeElement: document.activeElement,
          activeElementClass: document.activeElement?.className,
          activeElementTagName: document.activeElement?.tagName,
          isInThreadView,
          threadViewExists: !!threadViewElement,
          listContainer: !!listContainer,
          listHasFocus: listContainer?.contains(document.activeElement) || document.activeElement === listContainer
        });

        // If focus is anywhere in ThreadView, don't handle
        if (isInThreadView) {
          console.log('[ResultList] Focus is in ThreadView, NOT handling - let ThreadView handle it');
          return; // Let ThreadView handle the "i" key
        }

        // Also do a direct check for ThreadView elements having focus
        if (threadViewElement && (threadViewElement === document.activeElement ||
            threadViewElement.contains(document.activeElement))) {
          console.log('[ResultList] ThreadView contains activeElement, NOT handling');
          return;
        }

        // Now check if ResultList actually has focus
        const resultListHasFocus = listContainer && (
          document.activeElement === listContainer ||
          listContainer.contains(document.activeElement)
        );

        if (!resultListHasFocus) {
          console.log('[ResultList] ResultList does not have focus, ignoring "i" key');
          return; // Don't handle if focus is elsewhere
        }

        // Additional safety check: ensure we have a valid focused message
        if (focusedIndex < 0 || focusedIndex >= messages.length) {
          console.log('[ResultList] No valid focused message index:', focusedIndex);
          return;
        }

        // Now we know ResultList has focus and has a valid selection, handle the preview
        console.log('[ResultList] ResultList has focus with valid selection, handling preview');

        const message = messages[focusedIndex];

        // Check if the message has file attachments
        if (message.files && message.files.length > 0) {
          console.log('[ResultList] Opening lightbox for message with', message.files.length, 'files');
          // Process file metadata for all files
          const fileMetadata = message.files.map(file => processFileMetadata(file));

          // Open the lightbox with the first file
          filePreviewStore.openLightbox(fileMetadata[0], fileMetadata);
        } else {
          // No files to preview
          console.log('[ResultList] No file attachments in focused message');
          showInfo('No attachments', 'This message has no file attachments to preview.');
        }
      },
      allowInInput: false
    });

    // Toggle Bookmark (B key)
    keyboardService.registerHandler('toggleBookmark', {
      action: async () => {
        // Check if lightbox is open - if so, don't handle
        if ($lightboxOpen) {
          return;
        }

        // Check if thread view has focus - if so, don't handle
        const threadViewElement = document.querySelector('.thread-view');
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          return; // Let thread view handle its own bookmark
        }

        // Check if the result list actually has focus
        if (!listContainer || (!listContainer.contains(document.activeElement) && document.activeElement !== listContainer)) {
          return; // Don't handle if focus is elsewhere
        }

        // Check if we have a valid focused message
        if (focusedIndex < 0 || focusedIndex >= messages.length) {
          return;
        }

        const message = messages[focusedIndex];
        const result = await bookmarkStore.toggleBookmark(message);

        if (result.added) {
          showInfo('Bookmark added', `Message from ${message.userName} has been bookmarked`);
        } else {
          showInfo('Bookmark removed', 'Bookmark has been removed');
        }
      },
      allowInInput: false
    });
  });
  
  onDestroy(() => {
    // Reset PostDialog state when component is destroyed
    isPostDialogOpen.set(false);

    // Cleanup Intersection Observer
    if (loadMoreObserver) {
      loadMoreObserver.disconnect();
      loadMoreObserver = null;
    }

    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.unregisterHandler('nextResult');
      keyboardService.unregisterHandler('prevResult');
      keyboardService.unregisterHandler('openResult');
      keyboardService.unregisterHandler('postMessage');
      keyboardService.unregisterHandler('postMessageContinuous');
      keyboardService.unregisterHandler('replyInThread');
      keyboardService.unregisterHandler('replyInThreadContinuous');
      keyboardService.unregisterHandler('jumpToFirst');
      keyboardService.unregisterHandler('jumpToLast');
      keyboardService.unregisterHandler('quoteMessage');
      keyboardService.unregisterHandler('openUrls');
      keyboardService.unregisterHandler('openLightbox');
      keyboardService.unregisterHandler('toggleBookmark');
    }
  });
</script>

<div class="result-list">
  {#if loading}
    <div class="loading">
      <SkeletonLoader type="list" count={5} />
    </div>
  {:else if error}
    <div class="error">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>{error}</p>
    </div>
  {:else if messages.length === 0}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" opacity="0.3">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <p>No messages found</p>
      {#if hasFilters}
        <p class="hint">Try removing some filters or adjusting the date range</p>
        <div class="filter-summary">
          {#if $searchParams?.channel}
            <span class="filter-item">Channel: {$searchParams.channel}</span>
          {/if}
          {#if $searchParams?.user}
            <span class="filter-item">User: {$searchParams.user}</span>
          {/if}
          {#if $searchParams?.fromDate}
            <span class="filter-item">From: {new Date($searchParams.fromDate).toLocaleDateString()}</span>
          {/if}
          {#if $searchParams?.toDate}
            <span class="filter-item">To: {new Date($searchParams.toDate).toLocaleDateString()}</span>
          {/if}
        </div>
      {:else}
        <p class="hint">Try adjusting your search criteria</p>
      {/if}
    </div>
  {:else}
    <div class="results-container" class:realtime-mode={$realtimeStore.isEnabled}>
      <!-- Subtle loading bar for realtime updates -->
      {#if $realtimeStore.isEnabled}
        <div class="realtime-loading-bar" class:active={isRealtimeUpdating}></div>
      {/if}
      <div class="results-header">
        <h3>
          {#if !$searchParams?.query}
            Browsing {messages.length} message{messages.length !== 1 ? 's' : ''}
            {#if $searchParams?.channel}
              in #{$searchParams.channel}
            {/if}
          {:else}
            {messages.length} message{messages.length !== 1 ? 's' : ''} found
          {/if}
        </h3>
        {#if $reactionLoadingState.isLoading}
          <div class="reaction-loading-indicator">
            <span class="loading-spinner"></span>
            <span class="loading-text">
              Loading reactions: {$reactionLoadingState.loadedCount} / {$reactionLoadingState.totalCount}
              {#if $reactionLoadingState.errors > 0}
                ({$reactionLoadingState.errors} failed)
              {/if}
            </span>
          </div>
        {/if}
      </div>
      <div
        class="messages"
        class:expanded={isExpanded}
        class:realtime-updating={isRealtimeUpdating}
        bind:this={listContainer}
        tabindex="0"
        role="list"
        aria-label="Search results"
        on:focus={handleContainerFocus}
        on:blur={handleContainerBlur}
        on:keydown={handleKeyDown}>
        {#each visibleMessages as message, visibleIndex (message.ts)}
          {@const actualIndex = messages.findIndex(m => m.ts === message.ts)}
          {@const isNewMessage = $realtimeStore.isEnabled && !previousMessageIds.has(message.ts)}
          {@const isNewFromSearch = $settings.experimentalFeatures?.highlightNewSearchResults && !$realtimeStore.isEnabled && previousSearchMessageIds.size > 0 && !previousSearchMessageIds.has(message.ts)}
          <div
            data-message-ts={message.ts}
            data-message-index={actualIndex}
            class:message-new={isNewMessage}
            class:message-new-from-search={isNewFromSearch}>
            {#if $performanceSettings.useOptimizedMessageItem}
              <OptimizedMessageItem
                {message}
                on:click={() => handleMessageClick(message)}
                selected={$selectedMessage?.ts === message.ts}
                focused={focusedIndex === actualIndex}
                showChannelBadge={isMultiChannel}
              />
            {:else}
              <MessageItem
                {message}
                on:click={() => handleMessageClick(message)}
                selected={$selectedMessage?.ts === message.ts}
                focused={focusedIndex === actualIndex}
                showChannelBadge={isMultiChannel}
              />
            {/if}
          </div>
        {/each}

        <!-- Sentinel element for progressive loading -->
        {#if displayedCount < messages.length}
          <div
            bind:this={sentinelElement}
            class="load-more-sentinel"
            use:observeSentinel
          >
            <div class="loading-indicator">
              <span class="spinner-small"></span>
              Loading more messages... ({displayedCount} of {messages.length})
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  
  {#if showPostDialog && focusedIndex >= 0 && focusedIndex < messages.length}
    <PostDialog
      mode={postMode}
      continuousMode={continuousMode}
      channelId={messages[focusedIndex].channel}
      channelName={messages[focusedIndex].channelName || messages[focusedIndex].channel}
      threadTs={postMode === 'thread' ? messages[focusedIndex].ts : ''}
      messagePreview={postMode === 'thread' ? decodeSlackText(messages[focusedIndex].text).slice(0, 100) : ''}
      initialText={postInitialText}
      on:success={handlePostSuccess}
      on:cancel={handlePostCancel}
    />
  {/if}
</div>

<style>
  .result-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-radius: 6px;
    overflow: hidden;
    min-height: 0; /* Important for flex containers with scrollable children */
    /* Remove height: 100% to work properly without parent having flex: 1 */
    transition: all 0.3s ease;
  }
  
  .loading,
  .error,
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-secondary);
    min-height: 0; /* Ensure proper flex sizing */
  }
  
  .loading .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    color: var(--error);
  }
  
  .error svg {
    margin-bottom: 1rem;
  }
  
  .empty .hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    opacity: 0.7;
  }

  .results-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden; /* Prevent container from expanding */
  }

  .results-header {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
    flex-shrink: 0; /* Prevent header from shrinking */
  }
  
  .results-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  
  .reaction-loading-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }
  
  .loading-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .loading-text {
    opacity: 0.8;
  }
  
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem;
    outline: none;
    min-height: 0; /* Important for flex child to be scrollable */
    transition: all 0.3s ease;
  }

  /* When expanded (focused), take more space */
  .messages.expanded {
    position: fixed;
    top: 60px; /* Reduced for compact header and search bar */
    left: 8px;
    right: calc(50% + 4px); /* Take up left half */
    bottom: 8px;
    height: auto !important;
    max-height: calc(100vh - 76px);
    z-index: 100;
    background: var(--bg-secondary);
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  
  .messages:focus {
    box-shadow: inset 0 0 0 2px var(--primary);
  }
  
  .load-more-sentinel {
    padding: 1.5rem;
    text-align: center;
    color: var(--text-secondary);
  }
  
  .loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 0.875rem;
  }
  
  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  .messages::-webkit-scrollbar {
    width: 8px;
  }
  
  .messages::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }
  
  .messages::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .messages::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
  
  .filter-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
    justify-content: center;
  }
  
  .filter-item {
    padding: 0.25rem 0.75rem;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 16px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  /* Highlight animation for jump navigation */
  :global(.highlight-jump) {
    animation: highlightJump 1.5s ease-out;
  }

  /* Keyboard focus indicator */
  :global(.keyboard-focused) {
    position: relative;
  }

  :global(.keyboard-focused)::before {
    content: '';
    position: absolute;
    inset: -2px;
    border: 2px solid var(--primary);
    border-radius: 8px;
    pointer-events: none;
    animation: focusPulse 1s ease-in-out infinite;
  }

  @keyframes focusPulse {
    0%, 100% {
      opacity: 0.8;
    }
    50% {
      opacity: 0.4;
    }
  }

  @keyframes highlightJump {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.8);
    }
    20% {
      transform: scale(1.02);
      box-shadow: 0 0 20px 10px rgba(59, 130, 246, 0.4);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
  }

  /* New message highlighting for realtime updates */
  .message-new {
    position: relative;
    animation: fadeInNew 0.5s ease-in;
  }

  .message-new::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: linear-gradient(to bottom, var(--primary), var(--primary-hover));
    border-radius: 2px;
    animation: pulseNew 2s ease-in-out infinite;
  }

  /* New message highlighting from search cache (experimental feature) */
  .message-new-from-search {
    position: relative;
    animation: fadeInNew 0.5s ease-in;
  }

  .message-new-from-search::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(to bottom, #10b981, #059669);
    border-radius: 2px;
  }

  .message-new-from-search::after {
    content: 'NEW';
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 2px 8px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
    pointer-events: none;
    z-index: 10;
  }

  @keyframes fadeInNew {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes pulseNew {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Realtime mode specific styling */
  .results-container.realtime-mode .message-new {
    background: rgba(59, 130, 246, 0.05);
  }

  /* Realtime loading bar */
  .realtime-loading-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: transparent;
    z-index: 1000;
    transition: background 0.3s ease;
  }

  .realtime-loading-bar.active {
    background: linear-gradient(90deg,
      transparent 0%,
      var(--primary) 50%,
      transparent 100%);
    animation: loadingBar 1s ease-in-out;
  }

  @keyframes loadingBar {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
</style>