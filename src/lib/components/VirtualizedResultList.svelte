<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
  
  // Post dialog state
  let showPostDialog = false;
  let postMode: 'channel' | 'thread' = 'channel';

  // Create virtualizer with proper Svelte store pattern
  $: virtualizer = scrollElement && createVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 100,
    overscan: 5,
  });

  // Get virtual items and total size from the store
  $: items = $virtualizer?.getVirtualItems() || [];
  $: totalSize = $virtualizer?.getTotalSize() || 0;

  // Debug logging
  $: if (messages.length > 0) {
    console.log('[VirtualList] Status:', {
      messages: messages.length,
      items: items.length,
      totalSize,
      scrollElement: !!scrollElement,
      scrollHeight: scrollElement?.scrollHeight,
      clientHeight: scrollElement?.clientHeight
    });
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
      // Focus the list container to enable keyboard navigation
      if (scrollElement) {
        scrollElement.focus();
      }
    }
  }

  export function scrollToTop() {
    if (scrollElement) {
      scrollElement.scrollTop = 0;
    }
  }

  function updateFocus() {
    if (focusedIndex >= 0 && focusedIndex < messages.length) {
      const message = messages[focusedIndex];
      selectedMessage.set(message);
      
      // Use virtualizer to scroll to the focused item
      if ($virtualizer) {
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
    // Refocus the list container immediately
    requestAnimationFrame(() => {
      if (scrollElement) {
        scrollElement.focus();
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
          if (scrollElement) {
            scrollElement.focus();
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
        if (scrollElement) {
          scrollElement.focus();
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to open URLs:', error);
      showError('Failed to open URLs', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  function handlePostCancel() {
    showPostDialog = false;
    // Refocus the list container immediately
    requestAnimationFrame(() => {
      if (scrollElement) {
        scrollElement.focus();
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
        // CRITICAL: Ensure focus is on list container before handling
        // This prevents the focus direction issue
        if (scrollElement && document.activeElement !== scrollElement) {
          scrollElement.focus();
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

<div class="result-list">
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
    
    <!-- Virtual scroll container -->
    <div 
      class="messages" 
      bind:this={scrollElement}
      tabindex="0"
      role="list"
      aria-label="Search results"
      on:keydown={handleKeyDown}>
      
      <div style="height: {totalSize}px; width: 100%; position: relative;">
        {#each items as item (item.key)}
          {@const message = messages[item.index]}
          {#if message}
            <div
              style="
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: {item.size}px;
                transform: translateY({item.start}px);
              "
            >
              <OptimizedMessageItem 
                {message}
                on:click={() => handleMessageClick(message)}
                selected={$selectedMessage?.ts === message.ts}
                focused={focusedIndex === item.index}
                showChannelBadge={isMultiChannel}
                enableReactions={false}
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
    padding: 0.5rem;
    outline: none;
    position: relative;
    min-height: 0;
  }
  
  .messages:focus {
    box-shadow: inset 0 0 0 2px var(--primary);
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
</style>