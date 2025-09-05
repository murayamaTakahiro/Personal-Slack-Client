<script lang="ts">
  import { onMount, onDestroy, beforeUpdate, afterUpdate } from 'svelte';
  import type { Message } from '../types/slack';
  import MemoizedMessageItem from './MemoizedMessageItem.svelte';
  import MessageItem from './MessageItem.svelte';
  import PostDialog from './PostDialog.svelte';
  import { selectedMessage, searchParams } from '../stores/search';
  import { getKeyboardService } from '../services/keyboardService';
  import { performanceMonitor } from '../services/performanceMonitor';
  import { performanceSettings } from '../stores/performance';
  import { decodeSlackText } from '../utils/htmlEntities';

  export let messages: Message[] = [];
  export let loading = false;
  export let error: string | null = null;

  let focusedIndex = -1;
  let listContainer: HTMLDivElement;
  let messageElements: HTMLElement[] = [];
  let showPostDialog = false;
  let postMode: 'channel' | 'thread' = 'channel';
  
  // Performance tracking
  let renderStart: number;
  let lastMessageCount = 0;

  // Progressive loading with better defaults
  const INITIAL_LOAD = $performanceSettings.messagesPerPage || 50;
  const LOAD_INCREMENT = $performanceSettings.progressiveLoadSize || 50;
  let displayedCount = INITIAL_LOAD;
  let loadMoreObserver: IntersectionObserver | null = null;
  let sentinelElement: HTMLDivElement;
  
  // Track if we should use memoized components
  $: useMemoized = $performanceSettings.useOptimizedMessageItem;

  // Batch DOM updates using requestAnimationFrame
  let rafId: number | null = null;
  function scheduleUpdate(callback: () => void) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(callback);
  }

  // Optimize visible messages calculation
  $: visibleMessages = messages.slice(0, displayedCount);
  
  // Reset display count when messages change significantly
  $: if (messages && Math.abs(messages.length - lastMessageCount) > 10) {
    displayedCount = Math.min(INITIAL_LOAD, messages.length);
    focusedIndex = -1;
    lastMessageCount = messages.length;
  }

  // Check for active filters
  $: hasFilters = $searchParams && (
    $searchParams.channel || 
    $searchParams.user || 
    $searchParams.fromDate || 
    $searchParams.toDate
  );

  $: isMultiChannel = $searchParams?.channel?.includes(',');

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

  function handleMessageClick(message: Message, index: number) {
    scheduleUpdate(() => {
      selectedMessage.set(message);
      focusedIndex = index;
    });
  }

  export function focusList() {
    if (messages.length > 0) {
      if (focusedIndex === -1) {
        focusedIndex = 0;
        updateFocus();
      }
      if (listContainer) {
        listContainer.focus();
      }
    }
  }

  export function scrollToTop() {
    if (listContainer) {
      listContainer.scrollTop = 0;
    }
  }

  function updateFocus() {
    if (focusedIndex >= 0 && focusedIndex < messages.length) {
      const message = messages[focusedIndex];
      selectedMessage.set(message);
      
      // Smooth scroll into view
      scheduleUpdate(() => {
        const element = messageElements[focusedIndex];
        if (element && listContainer) {
          const rect = element.getBoundingClientRect();
          const containerRect = listContainer.getBoundingClientRect();
          
          if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
            element.scrollIntoView({ 
              block: 'nearest', 
              behavior: 'smooth' 
            });
          }
        }
      });
    }
  }

  function handleKeyNavigation(direction: 'up' | 'down') {
    if (messages.length === 0) return;
    
    if (focusedIndex === -1) {
      focusedIndex = direction === 'down' ? 0 : messages.length - 1;
    } else {
      if (direction === 'down') {
        focusedIndex = (focusedIndex + 1) % messages.length;
      } else {
        focusedIndex = (focusedIndex - 1 + messages.length) % messages.length;
      }
    }
    
    // Ensure we've loaded the message we're navigating to
    if (focusedIndex >= displayedCount) {
      displayedCount = Math.min(focusedIndex + LOAD_INCREMENT, messages.length);
    }
    
    updateFocus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Skip if dialog is open or thread view has focus
    if (showPostDialog) return;
    
    const threadView = document.querySelector('.thread-view');
    if (threadView?.contains(document.activeElement)) return;
    
    if (event.key === 'Enter') {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < messages.length) {
        selectedMessage.set(messages[focusedIndex]);
      }
    }
  }

  // Track render performance
  beforeUpdate(() => {
    if ($performanceSettings.performanceMetrics) {
      renderStart = performance.now();
    }
  });

  afterUpdate(() => {
    if ($performanceSettings.performanceMetrics && renderStart) {
      const renderTime = performance.now() - renderStart;
      performanceMonitor.logRenderPerformance('OptimizedResultList', visibleMessages.length);
    }
  });

  onMount(() => {
    // Setup Intersection Observer with optimized settings
    if (typeof IntersectionObserver !== 'undefined') {
      loadMoreObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && displayedCount < messages.length) {
              // Use RAF to batch updates
              scheduleUpdate(() => {
                displayedCount = Math.min(
                  displayedCount + LOAD_INCREMENT, 
                  messages.length
                );
              });
            }
          });
        },
        {
          rootMargin: '100px', // Load earlier
          threshold: 0.01 // More sensitive trigger
        }
      );
    }
    
    // Register keyboard handlers
    const keyboardService = getKeyboardService();
    if (!keyboardService) return;
    
    keyboardService.registerHandler('nextResult', {
      action: () => handleKeyNavigation('down'),
      allowInInput: false
    });
    
    keyboardService.registerHandler('prevResult', {
      action: () => handleKeyNavigation('up'),
      allowInInput: false
    });
    
    keyboardService.registerHandler('openResult', {
      action: () => {
        if (focusedIndex >= 0 && focusedIndex < messages.length) {
          selectedMessage.set(messages[focusedIndex]);
        }
      },
      allowInInput: false
    });
    
    keyboardService.registerHandler('jumpToFirst', {
      action: () => {
        if (messages.length > 0) {
          focusedIndex = 0;
          updateFocus();
        }
      },
      allowInInput: false
    });
    
    keyboardService.registerHandler('jumpToLast', {
      action: () => {
        if (messages.length > 0) {
          focusedIndex = messages.length - 1;
          displayedCount = messages.length; // Ensure last message is loaded
          updateFocus();
        }
      },
      allowInInput: false
    });
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    
    if (loadMoreObserver) {
      loadMoreObserver.disconnect();
      loadMoreObserver = null;
    }
    
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      keyboardService.unregisterHandler('nextResult');
      keyboardService.unregisterHandler('prevResult');
      keyboardService.unregisterHandler('openResult');
      keyboardService.unregisterHandler('jumpToFirst');
      keyboardService.unregisterHandler('jumpToLast');
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
      {:else}
        <p class="hint">Try adjusting your search criteria</p>
      {/if}
    </div>
  {:else}
    <div class="results-header">
      <h3>
        {messages.length} message{messages.length !== 1 ? 's' : ''} found
        {#if displayedCount < messages.length}
          <span class="showing">(showing {displayedCount})</span>
        {/if}
      </h3>
    </div>
    <div 
      class="messages" 
      bind:this={listContainer}
      tabindex="0"
      role="list"
      aria-label="Search results"
      on:keydown={handleKeyDown}
    >
      {#each visibleMessages as message, index (message.ts)}
        <div bind:this={messageElements[index]}>
          {#if useMemoized}
            <MemoizedMessageItem 
              {message}
              on:click={() => handleMessageClick(message, index)}
              selected={$selectedMessage?.ts === message.ts}
              focused={focusedIndex === index}
              showChannelBadge={isMultiChannel}
            />
          {:else}
            <MessageItem 
              {message}
              on:click={() => handleMessageClick(message, index)}
              selected={$selectedMessage?.ts === message.ts}
              focused={focusedIndex === index}
              showChannelBadge={isMultiChannel}
            />
          {/if}
        </div>
      {/each}
      
      {#if displayedCount < messages.length}
        <div 
          bind:this={sentinelElement}
          class="load-more-sentinel"
          use:observeSentinel
        >
          <div class="loading-indicator">
            <span class="spinner-small"></span>
            Loading more... ({messages.length - displayedCount} remaining)
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  {#if showPostDialog && focusedIndex >= 0 && focusedIndex < messages.length}
    <PostDialog
      mode={postMode}
      channelId={messages[focusedIndex].channel}
      channelName={messages[focusedIndex].channelName || messages[focusedIndex].channel}
      threadTs={postMode === 'thread' ? messages[focusedIndex].ts : ''}
      messagePreview={postMode === 'thread' ? decodeSlackText(messages[focusedIndex].text).slice(0, 100) : ''}
      on:success={() => { 
        showPostDialog = false;
        scheduleUpdate(() => listContainer?.focus());
      }}
      on:cancel={() => { 
        showPostDialog = false;
        scheduleUpdate(() => listContainer?.focus());
      }}
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
    will-change: transform; /* Hint for GPU acceleration */
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
  }
  
  .showing {
    font-weight: 400;
    color: var(--text-secondary);
    opacity: 0.7;
  }
  
  .messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem;
    outline: none;
    scroll-behavior: smooth;
    /* Enable GPU acceleration for scrolling */
    -webkit-overflow-scrolling: touch;
    transform: translateZ(0);
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
</style>