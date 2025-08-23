<script lang="ts">
  import type { Message, EmojiReaction } from '../types/slack';
  import { openInSlack } from '../api/slack';
  import { createEventDispatcher, onMount } from 'svelte';
  import { activeWorkspace } from '../stores/workspaces';
  import { reactionService, reactionMappings } from '../services/reactionService';
  import { getKeyboardService } from '../services/keyboardService';
  
  export let message: Message;
  export let selected = false;
  export let enableReactions = true;
  
  const dispatch = createEventDispatcher();
  
  let reactions: EmojiReaction[] = message.reactions || [];
  let showReactionPicker = false;
  let reactionPickerPosition = { x: 0, y: 0 };
  
  $: mappings = $reactionMappings;
  
  function formatTimestamp(ts: string) {
    const timestamp = parseFloat(ts) * 1000;
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
  
  function truncateText(text: string, maxLength = 200) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  function generateSlackUrl(): string {
    // Generate correct Slack URL using current workspace domain
    const workspace = $activeWorkspace;
    if (!workspace) {
      // Fallback to original permalink if no workspace is active
      return message.permalink;
    }
    
    // Extract channel ID and message timestamp from the message
    const channelId = message.channel;
    const messageTs = message.ts.replace('.', '');
    
    // Check if this is a thread reply
    if (message.threadTs && message.threadTs !== message.ts) {
      // This is a reply in a thread - generate URL that opens the thread view
      const threadTs = message.threadTs.replace('.', '');
      // Include thread_ts parameter to open in thread view with the specific message highlighted
      return `https://${workspace.domain}.slack.com/archives/${channelId}/p${threadTs}?thread_ts=${message.threadTs}&cid=${channelId}`;
    } else {
      // This is a thread parent or standalone message
      return `https://${workspace.domain}.slack.com/archives/${channelId}/p${messageTs}`;
    }
  }
  
  async function handleOpenInSlack(e: MouseEvent) {
    e.stopPropagation();
    try {
      const url = generateSlackUrl();
      await openInSlack(url);
    } catch (error) {
      console.error('Failed to open in Slack:', error);
    }
  }
  
  function handleClick() {
    dispatch('click');
  }
  
  async function handleReactionClick(emoji: string) {
    if (!enableReactions) return;
    
    try {
      await reactionService.toggleReaction(message.channel, message.ts, emoji, reactions);
      // Refresh reactions
      reactions = await reactionService.getReactions(message.channel, message.ts);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  }
  
  async function handleQuickReaction(shortcut: number) {
    if (!enableReactions || !selected) return;
    
    try {
      await reactionService.addReactionByShortcut(message.channel, message.ts, shortcut, reactions);
      // Refresh reactions
      reactions = await reactionService.getReactions(message.channel, message.ts);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }
  
  function openReactionPicker(event: MouseEvent) {
    if (!enableReactions) return;
    
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    reactionPickerPosition = {
      x: rect.left,
      y: rect.bottom + 5
    };
    showReactionPicker = true;
  }
  
  function closeReactionPicker() {
    showReactionPicker = false;
  }
  
  // Register keyboard shortcuts when selected
  $: if (selected && enableReactions) {
    const keyboardService = getKeyboardService();
    if (keyboardService) {
      // Register number keys 1-9 for reactions
      for (let i = 1; i <= 9; i++) {
        keyboardService.registerHandler(`reaction${i}` as any, {
          action: () => handleQuickReaction(i),
          allowInInput: false
        });
      }
    }
  }
  
  onMount(() => {
    return () => {
      // Cleanup keyboard handlers
      const keyboardService = getKeyboardService();
      if (keyboardService) {
        for (let i = 1; i <= 9; i++) {
          keyboardService.unregisterHandler(`reaction${i}` as any);
        }
      }
    };
  });
</script>

<button
  class="message-item"
  class:selected
  on:click={handleClick}
>
  <div class="message-header">
    <div class="message-meta">
      <span class="user-name">{message.userName}</span>
      <span class="separator">•</span>
      <span class="channel-name">#{message.channelName}</span>
      <span class="separator">•</span>
      <span class="timestamp">{formatTimestamp(message.ts)}</span>
    </div>
    
    <div class="message-actions">
      {#if message.isThreadParent && message.replyCount}
        <span class="reply-count">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          {message.replyCount}
        </span>
      {/if}
      
      <button
        class="btn-open"
        on:click={handleOpenInSlack}
        title="Open in Slack"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      
      {#if enableReactions}
        <button
          class="btn-reaction"
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
      {/if}
    </div>
  </div>
  
  {#if reactions && reactions.length > 0}
    <div class="reactions">
      {#each reactions as reaction}
        <button
          class="reaction-badge"
          class:user-reacted={reaction.users.includes(message.user)}
          on:click|stopPropagation={() => handleReactionClick(reaction.name)}
          title={`${reaction.users.length} reaction${reaction.users.length > 1 ? 's' : ''}`}
        >
          <span class="reaction-emoji">{reaction.name}</span>
          <span class="reaction-count">{reaction.count}</span>
        </button>
      {/each}
    </div>
  {/if}
  
  <div class="message-content">
    {truncateText(message.text)}
  </div>
  
  {#if selected && enableReactions}
    <div class="reaction-shortcuts">
      {#each mappings.slice(0, 9) as mapping}
        <span class="shortcut-hint">
          <kbd>{mapping.shortcut}</kbd>
          <span>{mapping.display}</span>
        </span>
      {/each}
    </div>
  {/if}
</button>

<style>
  .message-item {
    display: block;
    width: 100%;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .message-item:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
  }
  
  .message-item.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
  }
  
  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .message-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  
  .user-name {
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .channel-name {
    color: var(--primary);
  }
  
  .timestamp {
    color: var(--text-secondary);
  }
  
  .separator {
    color: var(--text-secondary);
    opacity: 0.5;
  }
  
  .message-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .reply-count {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  .btn-open {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }
  
  .btn-open:hover {
    background: var(--bg-hover);
    color: var(--primary);
  }
  
  .message-content {
    color: var(--text-primary);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .btn-reaction {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
  }
  
  .btn-reaction:hover {
    background: var(--bg-hover);
    color: var(--primary);
  }
  
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }
  
  .reaction-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .reaction-badge:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
  }
  
  .reaction-badge.user-reacted {
    background: var(--primary-bg);
    border-color: var(--primary);
  }
  
  .reaction-emoji {
    font-size: 1rem;
  }
  
  .reaction-count {
    color: var(--text-secondary);
    font-weight: 500;
  }
  
  .reaction-shortcuts {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.25rem 0;
    border-top: 1px solid var(--border);
  }
  
  .shortcut-hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  .shortcut-hint kbd {
    padding: 0.125rem 0.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.75rem;
  }
</style>