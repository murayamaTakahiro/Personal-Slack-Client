<script lang="ts">
  import type { Message } from '../types/slack';
  import { openInSlack } from '../api/slack';
  import { createEventDispatcher } from 'svelte';
  import { activeWorkspace } from '../stores/workspaces';
  
  export let message: Message;
  export let selected = false;
  
  const dispatch = createEventDispatcher();
  
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
    
    // Generate the correct URL format for the current workspace
    return `https://${workspace.domain}.slack.com/archives/${channelId}/p${messageTs}`;
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
    </div>
  </div>
  
  <div class="message-content">
    {truncateText(message.text)}
  </div>
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
</style>