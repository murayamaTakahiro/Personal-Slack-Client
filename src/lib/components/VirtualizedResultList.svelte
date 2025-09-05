<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { createVirtualizer } from '@tanstack/svelte-virtual';
  import type { Message } from '../types/slack';
  import OptimizedMessageItem from './OptimizedMessageItem.svelte';
  import PostDialog from './PostDialog.svelte';
  import { selectedMessage, searchParams } from '../stores/search';
  import { getKeyboardService } from '../services/keyboardService';
  import { urlService } from '../services/urlService';
  import { openUrlsSmart } from '../api/urls';
  import { getThreadFromUrl } from '../api/slack';
  import { showInfo, showError } from '../stores/toast';
  import { decodeSlackText } from '../utils/htmlEntities';

  export let messages: Message[] = [];
  export let loading = false;
  export let error: string | null = null;

  let focusedIndex = -1;
  let scrollElement: HTMLDivElement;
  let containerElement: HTMLDivElement;
  let measureElement: HTMLDivElement;
  
  // Post dialog state
  let showPostDialog = false;
  let postMode: 'channel' | 'thread' = 'channel';

  // Dynamic height measurement cache
  let heightCache = new Map<string, number>();
  let averageHeight = 120; // Initial estimate, will be updated dynamically
  
  // Function to measure actual message height
  function measureMessageHeight(message: Message): number {
    if (heightCache.has(message.ts)) {
      return heightCache.get(message.ts)!;
    }
    
    // More accurate estimation based on content characteristics
    // Base height includes padding (0.75rem * 2 = 24px) + border (2px) + margin-bottom (8px) = 34px base
    // Plus header (approx 30px), content area minimum (20px)
    let estimatedHeight = 92; // Base height including margin-bottom from CSS (8px added)
    
    // Add height for text content (more accurate: ~20px per line, ~80 chars per line)
    const textLength = decodeSlackText(message.text).length;
    const estimatedLines = Math.max(1, Math.ceil(textLength / 80));
    estimatedHeight += estimatedLines * 20;
    
    // Add height for reactions (if present)
    if (message.reactions && message.reactions.length > 0) {
      // Reactions wrap, estimate based on count
      const reactionRows = Math.ceil(message.reactions.length / 8); // ~8 reactions per row
      estimatedHeight += reactionRows * 28; // Each reaction row is ~28px
    }
    
    // Add height for thread indicator
    if (message.isThreadParent && message.replyCount) {
      estimatedHeight += 5;
    }
    
    // More realistic bounds
    estimatedHeight = Math.min(estimatedHeight, 500);
    estimatedHeight = Math.max(estimatedHeight, 92);
    
    heightCache.set(message.ts, estimatedHeight);
    return estimatedHeight;
  }

  // Update average height based on measured heights
  function updateAverageHeight() {
    if (heightCache.size > 0) {
      const heights = Array.from(heightCache.values());
      averageHeight = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
    }
  }

  // Create virtualizer with dynamic height estimation
  $: virtualizer = scrollElement && createVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => {
      const message = messages[index];
      if (message) {
        return measureMessageHeight(message);
      }
      return averageHeight;
    },
    overscan: 5, // Reasonable overscan for smoother scrolling
    measureElement: (element) => {
      // Measure actual rendered height including margin
      if (element && element.firstElementChild) {
        const index = parseInt(element.getAttribute('data-index') || '0');
        const message = messages[index];
        if (message) {
          // Get the message item element (the actual content)
          const messageItem = element.querySelector('.message-item');
          if (messageItem) {
            // Get computed style to include margins
            const style = window.getComputedStyle(messageItem);
            const marginTop = parseFloat(style.marginTop) || 0;
            const marginBottom = parseFloat(style.marginBottom) || 0;
            // Use getBoundingClientRect for more accurate height
            const rect = messageItem.getBoundingClientRect();
            const actualHeight = rect.height + marginTop + marginBottom;
            
            // Update cache if significantly different
            const cachedHeight = heightCache.get(message.ts) || 0;
            if (actualHeight > 0 && Math.abs(actualHeight - cachedHeight) > 5) {
              heightCache.set(message.ts, actualHeight);
              updateAverageHeight();
              return actualHeight;
            }
            
            // Return cached height if we have it
            if (cachedHeight > 0) {
              return cachedHeight;
            }
          }
        }
      }
      
      const index = parseInt(element?.getAttribute('data-index') || '0');
      const message = messages[index];
      return message ? measureMessageHeight(message) : averageHeight;
    },
  });

  // Get virtual items and total size from the store
  $: items = $virtualizer?.getVirtualItems() || [];
  $: totalSize = $virtualizer?.getTotalSize() || 0;

  // Recalculate heights when messages change
  $: if (messages.length > 0) {
    // Clear cache for messages that no longer exist
    const currentMessageIds = new Set(messages.map(m => m.ts));
    for (const [id] of heightCache) {
      if (!currentMessageIds.has(id)) {
        heightCache.delete(id);
      }
    }
    updateAverageHeight();
  }

  function handleMessageClick(message: Message, event: MouseEvent) {
    // Prevent event bubbling that might interfere with child elements
    if ((event.target as HTMLElement).closest('.btn-open, .reaction-badge, button')) {
      return;
    }
    
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

  // Reset focus only when messages actually change (new search)
  let previousMessageLength = 0;
  $: if (messages && messages.length !== previousMessageLength) {
    // Only reset if it's a completely new set of messages (not just updates)
    if (previousMessageLength === 0 || messages.length === 0) {
      focusedIndex = -1;
    }
    previousMessageLength = messages.length;
  }

  export function focusList() {
    if (messages.length > 0) {
      // Only reset to first item if no item is currently focused
      if (focusedIndex === -1) {
        focusedIndex = 0;
        updateFocus();
      }
      // Focus the container element instead of scroll element to avoid conflicts
      if (containerElement) {
        containerElement.focus();
      }
    }
  }

  export function scrollToTop() {
    if (scrollElement) {
      scrollElement.scrollTop = 0;
    }
  }

  async function updateFocus() {
    if (focusedIndex >= 0 && focusedIndex < messages.length) {
      const message = messages[focusedIndex];
      selectedMessage.set(message);
      
      // Use virtualizer to scroll to the focused item
      if ($virtualizer) {
        await tick(); // Wait for DOM updates
        $virtualizer.scrollToIndex(focusedIndex, { align: 'center' });
      }
    }
  }

  function handleKeyNavigation(direction: 'up' | 'down') {
    if (messages.length === 0) return;
    
    // Initialize focus if not set
    if (focusedIndex === -1) {
      focusedIndex = direction === 'down' ? 0 : messages.length - 1;
    } else {
      if (direction === 'down') {
        if (focusedIndex < messages.length - 1) {
          focusedIndex++;
        } else {
          focusedIndex = 0; // Wrap to start
        }
      } else {
        if (focusedIndex > 0) {
          focusedIndex--;
        } else {
          focusedIndex = messages.length - 1; // Wrap to end
        }
      }
    }
    
    updateFocus();
  }

  function jumpToFirst() {
    if (messages.length === 0) return;
    focusedIndex = 0;
    updateFocus();
  }

  function jumpToLast() {
    if (messages.length === 0) return;
    focusedIndex = messages.length - 1;
    updateFocus();
  }

  function openPostDialog(mode: 'channel' | 'thread') {
    if (focusedIndex >= 0 && focusedIndex < messages.length) {
      postMode = mode;
      showPostDialog = true;
    }
  }

  function handlePostSuccess() {
    showPostDialog = false;
    // Refocus the container element immediately
    requestAnimationFrame(() => {
      if (containerElement) {
        containerElement.focus();
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
          
          // Maintain focus on the container
          if (containerElement) {
            containerElement.focus();
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
      
      // CRITICAL: Ensure container maintains focus after URL opening
      // This prevents focus loss issues that occur with navigation direction
      setTimeout(() => {
        if (containerElement) {
          containerElement.focus();
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to open URLs:', error);
      showError('Failed to open URLs', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  function handlePostCancel() {
    showPostDialog = false;
    // Refocus the container element immediately
    requestAnimationFrame(() => {
      if (containerElement) {
        containerElement.focus();
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
    
    // Don't prevent default for emoji picker and other interactive elements
    const target = event.target as HTMLElement;
    if (target.closest('.emoji-picker, .reaction-badge, .btn-open, input, textarea, select')) {
      return; // Let the element handle its own events
    }
    
    // Handle Enter key
    if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < messages.length) {
        const message = messages[focusedIndex];
        selectedMessage.set(message);
      }
      return;
    }
  }

  onMount(() => {
    const keyboardService = getKeyboardService();
    if (!keyboardService) return;
    
    // Next Result
    keyboardService.registerHandler('nextResult', {
      action: () => {
        if (messages.length > 0) {
          handleKeyNavigation('down');
        }
      },
      allowInInput: false
    });
    
    // Previous Result
    keyboardService.registerHandler('prevResult', {
      action: () => {
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
    
    // Jump to First (Home key)
    keyboardService.registerHandler('jumpToFirst', {
      action: () => {
        if (messages.length > 0) {
          jumpToFirst();
        }
      },
      allowInInput: false
    });
    
    // Jump to Last (End key)
    keyboardService.registerHandler('jumpToLast', {
      action: () => {
        if (messages.length > 0) {
          jumpToLast();
        }
      },
      allowInInput: false
    });
    
    // Open URLs (Alt+Enter)
    keyboardService.registerHandler('openUrls', {
      action: async () => {
        // CRITICAL: Ensure focus is on container before handling
        // This prevents the focus direction issue
        if (containerElement && document.activeElement !== containerElement) {
          containerElement.focus();
        }
        
        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          await handleOpenUrls();
        }
      },
      allowInInput: false
    });
  });
  
  onDestroy(() => {
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.unregisterHandler('nextResult');
      keyboardService.unregisterHandler('prevResult');
      keyboardService.unregisterHandler('openResult');
      keyboardService.unregisterHandler('postMessage');
      keyboardService.unregisterHandler('replyInThread');
      keyboardService.unregisterHandler('jumpToFirst');
      keyboardService.unregisterHandler('jumpToLast');
      keyboardService.unregisterHandler('openUrls');
    }
  });
</script>

<div class="result-list" bind:this={containerElement}>
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Searching messages...</p>
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
        <span class="virtual-badge">⚡ Virtual</span>
      </h3>
    </div>
    
    <!-- Hidden element for measuring message heights -->
    <div class="measure-container" bind:this={measureElement} aria-hidden="true"></div>
    
    <!-- Virtual scroll container with improved event handling -->
    <div 
      class="messages" 
      bind:this={scrollElement}
      tabindex="-1"
      role="list"
      aria-label="Search results"
      on:keydown={handleKeyDown}>
      
      <!-- Virtual list wrapper with proper positioning context -->
      <div class="virtual-wrapper" style="height: {totalSize}px;">
        {#each items as item (item.key)}
          {@const message = messages[item.index]}
          {#if message}
            <div
              class="virtual-item"
              data-index={item.index}
              style="transform: translateY({item.start}px);"
            >
              <OptimizedMessageItem 
                {message}
                on:click={(e) => handleMessageClick(message, e.detail || e)}
                selected={$selectedMessage?.ts === message.ts}
                focused={focusedIndex === item.index}
                showChannelBadge={isMultiChannel}
                enableReactions={true}
              />
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
  
  {#if showPostDialog && focusedIndex >= 0 && focusedIndex < messages.length}
    <PostDialog
      mode={postMode}
      channelId={messages[focusedIndex].channel}
      channelName={messages[focusedIndex].channelName || messages[focusedIndex].channel}
      threadTs={postMode === 'thread' ? messages[focusedIndex].ts : ''}
      messagePreview={postMode === 'thread' ? decodeSlackText(messages[focusedIndex].text).slice(0, 100) : ''}
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
    border-radius: 8px;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }
  
  .result-list:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
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
  
  .results-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
  }
  
  .results-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .virtual-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 12px;
    font-size: 0.7rem;
    color: rgba(34, 197, 94, 1);
    font-weight: 500;
  }
  
  .messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem;
    outline: none;
    position: relative;
    min-height: 0;
    /* Remove strict containment - it breaks absolute positioning */
    contain: layout style;
  }
  
  /* Remove focus outline from scrollable element to avoid double focus indicators */
  .messages:focus {
    outline: none;
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
  
  .virtual-wrapper {
    position: relative;
    width: 100%;
  }
  
  .virtual-item {
    /* Use transform for positioning - no absolute positioning */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    padding: 0 0.25rem;
    box-sizing: border-box;
    /* Ensure items don't overlap */
    contain: layout;
  }
  
  /* Ensure message items have proper spacing */
  .virtual-item :global(.message-item) {
    margin-bottom: 0.5rem;
  }
  
  .measure-container {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    top: -9999px;
    left: -9999px;
    width: 100%;
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
</style>