<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Message } from '../types/slack';
  import MessageItem from './MessageItem.svelte';
  import OptimizedMessageItem from './OptimizedMessageItem.svelte';
  import { selectedMessage } from '../stores/search';
  import { performanceSettings } from '../stores/performance';
  import { reactionService } from '../services/reactionService';
  import { performanceMonitor } from '../services/performanceMonitor';

  export let messages: Message[] = [];
  export let loading = false;
  export let error: string | null = null;

  // Virtualization settings
  const VISIBLE_BUFFER = 5; // Extra items to render outside viewport
  const ITEM_HEIGHT = 120; // Estimated height of each message item
  const REACTION_LOAD_DELAY = 100; // Delay before loading reactions

  let container: HTMLElement;
  let visibleStart = 0;
  let visibleEnd = 20;
  let scrollTop = 0;
  let containerHeight = 0;
  
  // Track which messages have had reactions loaded
  const loadedReactions = new Set<string>();
  const reactionLoadQueue = new Map<string, ReturnType<typeof setTimeout>>();
  
  // IntersectionObserver for lazy loading reactions
  let reactionObserver: IntersectionObserver | null = null;

  // Calculate visible range based on scroll position
  function calculateVisibleRange() {
    if (!container) return;
    
    const start = Math.floor(scrollTop / ITEM_HEIGHT);
    const end = Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT);
    
    visibleStart = Math.max(0, start - VISIBLE_BUFFER);
    visibleEnd = Math.min(messages.length, end + VISIBLE_BUFFER);
  }

  // Handle scroll events
  function handleScroll() {
    scrollTop = container.scrollTop;
    calculateVisibleRange();
    
    // Cancel pending reaction loads for messages that are now out of view
    reactionLoadQueue.forEach((timeout, messageTs) => {
      const messageIndex = messages.findIndex(m => m.ts === messageTs);
      if (messageIndex < visibleStart || messageIndex >= visibleEnd) {
        clearTimeout(timeout);
        reactionLoadQueue.delete(messageTs);
      }
    });
  }

  // Load reactions for a message after a delay
  async function scheduleReactionLoad(message: Message) {
    if (!$performanceSettings.lazyLoadReactions) {
      // If lazy loading is disabled, reactions are already loaded
      return;
    }
    
    if (loadedReactions.has(message.ts)) {
      // Reactions already loaded
      return;
    }
    
    if (reactionLoadQueue.has(message.ts)) {
      // Already scheduled
      return;
    }
    
    // Schedule reaction loading
    const timeout = setTimeout(async () => {
      reactionLoadQueue.delete(message.ts);
      
      if (loadedReactions.has(message.ts)) {
        return;
      }
      
      try {
        performanceMonitor.start(`load_reactions_${message.ts}`);
        
        const reactions = await reactionService.getReactions(message.channel, message.ts);
        
        // Update the message with reactions
        const messageIndex = messages.findIndex(m => m.ts === message.ts);
        if (messageIndex >= 0) {
          messages[messageIndex] = {
            ...messages[messageIndex],
            reactions
          };
          messages = messages; // Trigger reactivity
        }
        
        loadedReactions.add(message.ts);
        
        performanceMonitor.end(`load_reactions_${message.ts}`);
      } catch (error) {
        console.error(`Failed to load reactions for message ${message.ts}:`, error);
      }
    }, REACTION_LOAD_DELAY);
    
    reactionLoadQueue.set(message.ts, timeout);
  }

  // Setup IntersectionObserver for lazy loading reactions
  function setupReactionObserver() {
    if (!$performanceSettings.lazyLoadReactions) {
      return;
    }
    
    reactionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageTs = entry.target.getAttribute('data-message-ts');
          if (messageTs) {
            const message = messages.find(m => m.ts === messageTs);
            if (message) {
              scheduleReactionLoad(message);
            }
          }
        }
      });
    }, {
      root: container,
      rootMargin: '100px',
      threshold: 0.1
    });
  }

  // Observe a message element for reaction loading
  function observeMessage(node: HTMLElement, message: Message) {
    if (reactionObserver && $performanceSettings.lazyLoadReactions) {
      node.setAttribute('data-message-ts', message.ts);
      reactionObserver.observe(node);
    }
    
    return {
      destroy() {
        if (reactionObserver) {
          reactionObserver.unobserve(node);
        }
      }
    };
  }

  // Handle message click
  function handleMessageClick(message: Message) {
    selectedMessage.set(message);
  }

  // Prepare messages for rendering (strip reactions if lazy loading)
  $: processedMessages = $performanceSettings.lazyLoadReactions
    ? messages.map(m => ({
        ...m,
        reactions: loadedReactions.has(m.ts) ? m.reactions : []
      }))
    : messages;

  // Get visible messages
  $: visibleMessages = processedMessages.slice(visibleStart, visibleEnd);

  // Reset loaded reactions when messages change
  $: if (messages) {
    loadedReactions.clear();
    reactionLoadQueue.forEach(timeout => clearTimeout(timeout));
    reactionLoadQueue.clear();
    calculateVisibleRange();
  }

  onMount(() => {
    if (container) {
      const resizeObserver = new ResizeObserver(() => {
        containerHeight = container.clientHeight;
        calculateVisibleRange();
      });
      
      resizeObserver.observe(container);
      
      setupReactionObserver();
      
      return () => {
        resizeObserver.disconnect();
        if (reactionObserver) {
          reactionObserver.disconnect();
        }
        reactionLoadQueue.forEach(timeout => clearTimeout(timeout));
      };
    }
  });

  onDestroy(() => {
    reactionLoadQueue.forEach(timeout => clearTimeout(timeout));
  });
</script>

<div class="result-list">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading messages...</span>
    </div>
  {:else if error}
    <div class="error">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{error}</span>
    </div>
  {:else if messages.length === 0}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <p>No messages found</p>
    </div>
  {:else}
    <div 
      class="message-container"
      bind:this={container}
      on:scroll={handleScroll}
    >
      <!-- Spacer for virtual scrolling -->
      <div style="height: {visibleStart * ITEM_HEIGHT}px;"></div>
      
      <!-- Visible messages -->
      {#each visibleMessages as message (message.ts)}
        <div 
          class="message-wrapper"
          use:observeMessage={message}
        >
          {#if $performanceSettings.useOptimizedMessageItem}
            <OptimizedMessageItem
              {message}
              on:click={() => handleMessageClick(message)}
              selected={$selectedMessage?.ts === message.ts}
              showChannelBadge={false}
              enableReactions={!$performanceSettings.lazyLoadReactions || loadedReactions.has(message.ts)}
            />
          {:else}
            <MessageItem
              {message}
              on:click={() => handleMessageClick(message)}
              selected={$selectedMessage?.ts === message.ts}
              showChannelBadge={false}
              enableReactions={!$performanceSettings.lazyLoadReactions || loadedReactions.has(message.ts)}
            />
          {/if}
        </div>
      {/each}
      
      <!-- Spacer for virtual scrolling -->
      <div style="height: {(messages.length - visibleEnd) * ITEM_HEIGHT}px;"></div>
    </div>
    
    <div class="stats">
      <span class="stat-item">
        Total: {messages.length}
      </span>
      <span class="stat-item">
        Visible: {visibleEnd - visibleStart}
      </span>
      {#if $performanceSettings.lazyLoadReactions}
        <span class="stat-item">
          Reactions loaded: {loadedReactions.size}
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .result-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .message-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem;
  }

  .message-wrapper {
    min-height: 100px;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: var(--text-secondary);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--error);
    background: var(--error-bg);
    border: 1px solid var(--error);
    border-radius: 6px;
    margin: 1rem;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    gap: 1rem;
  }

  .empty svg {
    opacity: 0.5;
  }

  .stats {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>