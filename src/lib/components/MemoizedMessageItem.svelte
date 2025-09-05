<script lang="ts">
  import type { Message, EmojiReaction } from '../types/slack';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { derived } from 'svelte/store';
  import { activeWorkspace } from '../stores/workspaces';
  import { reactionService, reactionMappings } from '../services/reactionService';
  import { getKeyboardService } from '../services/keyboardService';
  import { showSuccess, showError, showInfo } from '../stores/toast';
  import ReactionPicker from './ReactionPicker.svelte';
  import EmojiImage from './EmojiImage.svelte';
  import { parseMessageWithEmojis } from '../utils/emojiParser';
  import { decodeSlackText } from '../utils/htmlEntities';
  import { 
    memoize, 
    getCachedProcessedText, 
    cacheProcessedText,
    getCachedTimestamp,
    cacheTimestamp,
    getCachedEmojiParse,
    cacheEmojiParse 
  } from '../services/memoization';

  export let message: Message;
  export let selected = false;
  export let focused = false;
  export let showChannelBadge = false;

  const dispatch = createEventDispatcher();

  // Memoized functions
  const formatTimestamp = memoize((ts: string) => {
    const cached = getCachedTimestamp(ts);
    if (cached) return cached;
    
    const timestamp = parseFloat(ts) * 1000;
    const date = new Date(timestamp);
    const formatted = date.toLocaleString();
    
    cacheTimestamp(ts, formatted);
    return formatted;
  });

  const truncateText = memoize((text: string, maxLength = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  });

  const processMessageText = memoize((text: string) => {
    const cacheKey = `${message.ts}_${text}`;
    const cached = getCachedProcessedText(cacheKey);
    if (cached) return cached;
    
    const decoded = decodeSlackText(text);
    const truncated = truncateText(decoded);
    const processed = { decoded, truncated };
    
    cacheProcessedText(cacheKey, processed);
    return processed;
  });

  const parseEmojis = memoize((text: string) => {
    const cached = getCachedEmojiParse(text);
    if (cached) return cached;
    
    const parsed = parseMessageWithEmojis(text);
    cacheEmojiParse(text, parsed);
    return parsed;
  });

  // Process message data only when it changes
  $: processedData = processMessageText(message.text);
  $: messageSegments = parseEmojis(processedData.truncated);
  $: timestamp = formatTimestamp(message.ts);
  $: userName = decodeSlackText(message.userName);
  $: channelName = message.channelName ? decodeSlackText(message.channelName) : '';

  // Reaction handling
  let showReactionPicker = false;
  let handlersRegistered = false;

  function generateSlackUrl(): string {
    const workspace = $activeWorkspace;
    if (!workspace) {
      return message.permalink;
    }
    
    const channelId = message.channel;
    const messageTs = message.ts.replace('.', '');
    
    if (message.threadTs && message.threadTs !== message.ts) {
      const threadTs = message.threadTs.replace('.', '');
      return `https://${workspace.domain}.slack.com/archives/${channelId}/p${threadTs}?thread_ts=${message.threadTs}&cid=${channelId}`;
    } else {
      return `https://${workspace.domain}.slack.com/archives/${channelId}/p${messageTs}`;
    }
  }

  async function handleOpenInSlack(e: MouseEvent) {
    e.stopPropagation();
    const url = generateSlackUrl();
    
    try {
      await window.open(url, '_blank');
      showSuccess('Opened in Slack', 'Message opened in your browser');
    } catch (error) {
      showError('Failed to open', 'Could not open message in Slack');
    }
  }

  function handleClick() {
    dispatch('click');
  }

  function openReactionPicker(e: MouseEvent) {
    e.stopPropagation();
    showReactionPicker = true;
  }

  async function handleReactionSelect(event: CustomEvent) {
    const emoji = event.detail.emoji;
    showReactionPicker = false;
    
    try {
      await reactionService.addReaction(message.channel, message.ts, emoji);
      
      // Update local state optimistically
      const newReaction = {
        name: emoji,
        users: ['current_user'],
        count: 1
      };
      
      message.reactions = [...(message.reactions || []), newReaction];
      showSuccess('Reaction added', `Added :${emoji}: to message`);
    } catch (error) {
      showError('Failed to add reaction', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async function handleQuickReaction(index: number) {
    const mapping = $reactionMappings[index];
    if (!mapping) return;
    
    try {
      await reactionService.addReaction(message.channel, message.ts, mapping.emoji);
      
      // Update local state optimistically
      const existingReaction = message.reactions?.find(r => r.name === mapping.emoji);
      if (existingReaction) {
        existingReaction.count++;
        existingReaction.users.push('current_user');
        message.reactions = [...(message.reactions || [])];
      } else {
        const newReaction = {
          name: mapping.emoji,
          users: ['current_user'],
          count: 1
        };
        message.reactions = [...(message.reactions || []), newReaction];
      }
      
      showSuccess('Reaction added', `Added :${mapping.emoji}: to message`);
    } catch (error) {
      showError('Failed to add reaction', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Register keyboard handlers only when selected
  $: if (selected && !handlersRegistered) {
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      // Register handlers for number keys 1-9
      for (let i = 1; i <= 9; i++) {
        keyboardService.registerHandler(`reaction${i}`, {
          action: () => handleQuickReaction(i - 1),
          allowInInput: false
        });
      }
      
      // Register handler for opening reaction picker
      keyboardService.registerHandler('openReactionPicker', {
        action: () => { showReactionPicker = true; },
        allowInInput: false
      });
      
      handlersRegistered = true;
    }
  } else if (!selected && handlersRegistered) {
    // Unregister handlers when deselected
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      for (let i = 1; i <= 9; i++) {
        keyboardService.unregisterHandler(`reaction${i}`);
      }
      keyboardService.unregisterHandler('openReactionPicker');
      handlersRegistered = false;
    }
  }

  onDestroy(() => {
    // Clean up handlers on destroy
    if (handlersRegistered) {
      const keyboardService = getKeyboardService();
      if (keyboardService) {
        for (let i = 1; i <= 9; i++) {
          keyboardService.unregisterHandler(`reaction${i}`);
        }
        keyboardService.unregisterHandler('openReactionPicker');
      }
    }
  });
</script>

<div 
  class="message-item"
  class:selected
  class:focused
  on:click={handleClick}
  role="button"
  tabindex={focused ? 0 : -1}
  aria-selected={selected}
>
  <div class="message-header">
    <span class="user-name">{userName}</span>
    {#if showChannelBadge && channelName}
      <span class="channel-badge">#{channelName}</span>
    {/if}
    <span class="timestamp">{timestamp}</span>
    <button 
      class="btn-slack"
      on:click={handleOpenInSlack}
      title="Open in Slack"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </button>
  </div>
  
  <div class="message-content">
    {#each messageSegments as segment}
      {#if segment.type === 'text'}
        <span>{segment.content}</span>
      {:else if segment.type === 'emoji'}
        <EmojiImage emoji={segment.content} size="small" />
      {/if}
    {/each}
  </div>
  
  {#if message.reactions && message.reactions.length > 0}
    <div class="reactions">
      {#each message.reactions as reaction}
        <div class="reaction" title={reaction.users.join(', ')}>
          <EmojiImage emoji={reaction.name} size="tiny" />
          <span class="reaction-count">{reaction.count}</span>
        </div>
      {/each}
      <button 
        class="btn-add-reaction"
        on:click={openReactionPicker}
        title="Add reaction"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </button>
    </div>
  {/if}
  
  {#if message.threadTs || message.replyCount > 0}
    <div class="thread-indicator">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <span>{message.replyCount || 0} replies</span>
    </div>
  {/if}
</div>

{#if showReactionPicker}
  <ReactionPicker 
    on:select={handleReactionSelect}
    on:close={() => showReactionPicker = false}
  />
{/if}

<style>
  .message-item {
    padding: 0.75rem;
    border: 1px solid transparent;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    background: var(--bg-primary);
  }

  .message-item:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .message-item.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
  }

  .message-item.focused {
    box-shadow: 0 0 0 2px var(--primary);
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .user-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .channel-badge {
    padding: 0.125rem 0.375rem;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .timestamp {
    color: var(--text-secondary);
    font-size: 0.75rem;
    margin-left: auto;
  }

  .btn-slack {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .message-item:hover .btn-slack {
    opacity: 1;
  }

  .btn-slack:hover {
    color: var(--primary);
  }

  .message-content {
    color: var(--text-primary);
    line-height: 1.5;
    word-break: break-word;
  }

  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  .reaction {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 12px;
    font-size: 0.75rem;
  }

  .reaction-count {
    color: var(--text-secondary);
  }

  .btn-add-reaction {
    padding: 0.125rem 0.375rem;
    background: transparent;
    border: 1px dashed var(--border);
    border-radius: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s;
  }

  .message-item:hover .btn-add-reaction {
    opacity: 0.7;
  }

  .btn-add-reaction:hover {
    opacity: 1;
    border-style: solid;
    background: var(--bg-hover);
  }

  .thread-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding: 0.25rem 0;
    color: var(--primary);
    font-size: 0.75rem;
  }
</style>