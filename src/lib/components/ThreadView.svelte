<script lang="ts">
  import type { ThreadMessages, Message } from '../types/slack';
  import { getThread, openInSlack } from '../api/slack';
  
  export let message: Message | null = null;
  
  let thread: ThreadMessages | null = null;
  let loading = false;
  let error: string | null = null;
  
  $: if (message && message.threadTs) {
    loadThread(message.channel, message.threadTs);
  } else if (message) {
    loadThread(message.channel, message.ts);
  }
  
  async function loadThread(channelId: string, threadTs: string) {
    loading = true;
    error = null;
    thread = null;
    
    try {
      thread = await getThread(channelId, threadTs);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load thread';
      console.error('Failed to load thread:', err);
    } finally {
      loading = false;
    }
  }
  
  function formatTimestamp(ts: string) {
    const timestamp = parseFloat(ts) * 1000;
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
  
  async function handleOpenInSlack(permalink: string) {
    try {
      await openInSlack(permalink);
    } catch (error) {
      console.error('Failed to open in Slack:', error);
    }
  }
</script>

<div class="thread-view">
  {#if !message}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" opacity="0.3">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <p>Select a message to view thread</p>
    </div>
  {:else if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading thread...</p>
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
  {:else if thread}
    <div class="thread-header">
      <h3>Thread in #{thread.parent.channelName}</h3>
      <button
        class="btn-open-thread"
        on:click={() => thread && handleOpenInSlack(thread.parent.permalink)}
      >
        Open in Slack
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
    </div>
    
    <div class="thread-messages">
      <div class="thread-parent">
        <div class="message">
          <div class="message-header">
            <span class="user-name">{thread.parent.userName}</span>
            <span class="timestamp">{formatTimestamp(thread.parent.ts)}</span>
          </div>
          <div class="message-text">{thread.parent.text}</div>
        </div>
      </div>
      
      {#if thread.replies.length > 0}
        <div class="thread-replies">
          <div class="replies-header">
            {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
          </div>
          {#each thread.replies as reply}
            <div class="message reply">
              <div class="message-header">
                <span class="user-name">{reply.userName}</span>
                <span class="timestamp">{formatTimestamp(reply.ts)}</span>
              </div>
              <div class="message-text">{reply.text}</div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="no-replies">
          No replies in this thread
        </div>
      {/if}
    </div>
  {:else if message && !message.isThreadParent}
    <div class="single-message">
      <div class="thread-header">
        <h3>Message in #{message.channelName}</h3>
        <button
          class="btn-open-thread"
          on:click={() => handleOpenInSlack(message.permalink)}
        >
          Open in Slack
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
      </div>
      
      <div class="message">
        <div class="message-header">
          <span class="user-name">{message.userName}</span>
          <span class="timestamp">{formatTimestamp(message.ts)}</span>
        </div>
        <div class="message-text">{message.text}</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .thread-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: hidden;
  }
  
  .empty,
  .loading,
  .error {
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
  
  .thread-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
  }
  
  .thread-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .btn-open-thread {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-open-thread:hover {
    background: var(--primary-hover);
  }
  
  .thread-messages,
  .single-message {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }
  
  .message {
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 0.75rem;
  }
  
  .thread-parent {
    position: relative;
    margin-bottom: 1rem;
  }
  
  .thread-parent::after {
    content: '';
    position: absolute;
    left: 2rem;
    bottom: -1rem;
    width: 2px;
    height: 1rem;
    background: var(--border);
  }
  
  .replies-header {
    padding: 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  
  .reply {
    margin-left: 2rem;
    position: relative;
  }
  
  .reply::before {
    content: '';
    position: absolute;
    left: -1rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--border);
  }
  
  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .user-name {
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .timestamp {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  .message-text {
    color: var(--text-primary);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .no-replies {
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    font-style: italic;
  }
</style>