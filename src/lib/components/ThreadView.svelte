<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ThreadMessages, Message } from '../types/slack';
  import { getThread, openInSlack, openUrlsSmart } from '../api/slack';
  import { activeWorkspace } from '../stores/workspaces';
  import { urlService } from '../services/urlService';
  import { showSuccess, showError, showInfo } from '../stores/toast';
  import { parseMessageWithMentions } from '../utils/mentionParser';
  
  export let message: Message | null = null;
  
  let thread: ThreadMessages | null = null;
  let loading = false;
  let error: string | null = null;
  let selectedIndex = -1;
  let threadViewElement: HTMLDivElement;
  
  $: if (message) {
    // For thread replies, use threadTs (parent's timestamp)
    // For thread parents, use ts (message's own timestamp)
    const tsToUse = message.threadTs || message.ts;
    loadThread(message.channel, tsToUse);
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
  
  function generateSlackUrl(message: Message): string {
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
  
  async function handleOpenInSlack(messageToOpen: Message) {
    try {
      const url = generateSlackUrl(messageToOpen);
      await openInSlack(url);
    } catch (error) {
      console.error('Failed to open in Slack:', error);
    }
  }
  
  async function handleOpenUrls(messageToOpen: Message) {
    try {
      // Extract URLs from message text
      const extractedUrls = urlService.extractUrls(messageToOpen.text);
      console.log('🔍 DEBUG: Thread - Extracted URLs:', extractedUrls);
      
      // Check if we have URLs to open
      if (extractedUrls.slackUrls.length === 0 && extractedUrls.externalUrls.length === 0) {
        showInfo('No URLs found', 'This message does not contain any URLs to open.');
        return;
      }
      
      // Prepare URLs for opening (first Slack URL, all external URLs)
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
      
      console.log('🔍 DEBUG: Thread - URL opening result:', result);
      
      // Handle any errors
      if (result.errors.length > 0) {
        showError('Some URLs failed to open', result.errors.join('; '));
      } else {
        showSuccess('URLs opened successfully', 
          `Opened ${result.opened_slack ? '1 Slack URL' : ''}${result.opened_slack && result.opened_external_count > 0 ? ' and ' : ''}${result.opened_external_count > 0 ? `${result.opened_external_count} external URL${result.opened_external_count > 1 ? 's' : ''}` : ''}`
        );
      }
      
    } catch (error) {
      showError('Failed to open URLs', error instanceof Error ? error.message : String(error));
    }
  }
  
  function getAllMessages(): Array<{message: Message, index: number}> {
    if (!thread) return [];
    
    const messages = [];
    messages.push({ message: thread.parent, index: 0 });
    thread.replies.forEach((reply, i) => {
      messages.push({ message: reply, index: i + 1 });
    });
    return messages;
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (!thread) return;
    
    const messages = getAllMessages();
    const totalMessages = messages.length;
    
    // Check for Alt+Enter to open URLs
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < totalMessages) {
        const selectedMsg = messages[selectedIndex].message;
        handleOpenUrls(selectedMsg);
      }
      return;
    }
    
    switch (event.key) {
      case 'ArrowDown':
      case 'j':
      case 'J':
        event.preventDefault();
        if (selectedIndex === -1) {
          // Initialize selection
          selectedIndex = 0;
        } else if (selectedIndex < totalMessages - 1) {
          selectedIndex = selectedIndex + 1;
        } else {
          // Wrap to start
          selectedIndex = 0;
        }
        focusMessage(selectedIndex);
        break;
      case 'ArrowUp':
      case 'k':
      case 'K':
        event.preventDefault();
        if (selectedIndex === -1) {
          // Initialize selection at end
          selectedIndex = totalMessages - 1;
        } else if (selectedIndex > 0) {
          selectedIndex = selectedIndex - 1;
        } else {
          // Wrap to end
          selectedIndex = totalMessages - 1;
        }
        focusMessage(selectedIndex);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < totalMessages) {
          const selectedMsg = messages[selectedIndex].message;
          handleOpenInSlack(selectedMsg);
        }
        break;
      case 'Home':
        event.preventDefault();
        if (totalMessages > 0) {
          selectedIndex = 0;
          focusMessage(selectedIndex);
        }
        break;
      case 'End':
        event.preventDefault();
        if (totalMessages > 0) {
          selectedIndex = totalMessages - 1;
          focusMessage(selectedIndex);
        }
        break;
    }
  }
  
  function focusMessage(index: number) {
    const messageElement = document.querySelector(`.thread-message-${index}`) as HTMLElement;
    if (messageElement) {
      messageElement.focus();
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  
  function handleMessageClick(index: number) {
    selectedIndex = index;
    focusMessage(index);
  }
  
  function handleMessageKeyDown(event: KeyboardEvent, index: number, messageData: Message) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleOpenInSlack(messageData);
    }
  }
  
  // Export function to be called when Ctrl+2 is pressed
  export function focusThreadView() {
    if (threadViewElement) {
      threadViewElement.focus();
      // Select first message if none selected
      if (thread && selectedIndex === -1) {
        selectedIndex = 0;
        focusMessage(0);
      }
    }
  }
  
  onMount(() => {
    // Set initial focus when thread loads
    if (thread && getAllMessages().length > 0) {
      selectedIndex = 0;
      setTimeout(() => focusMessage(0), 100);
    }
  });
  
  $: if (thread && selectedIndex === -1) {
    // Auto-select first message when thread loads
    selectedIndex = 0;
    setTimeout(() => {
      if (threadViewElement && threadViewElement === document.activeElement) {
        focusMessage(0);
      }
    }, 100);
  }
  
  // Handle focus event
  function handleFocus() {
    // Select first message when thread view receives focus
    if (thread && selectedIndex === -1) {
      selectedIndex = 0;
      focusMessage(0);
    }
  }
</script>

<div class="thread-view" tabindex="0" bind:this={threadViewElement} on:keydown={handleKeyDown} on:focus={handleFocus} role="region" aria-label="Thread messages">
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
      <div>
        <h3>Thread in #{thread.parent.channelName}</h3>
        <span class="keyboard-hint">Use ↑↓ to navigate, Enter to open in Slack, Alt+Enter to open URLs</span>
      </div>
      <button
        class="btn-open-thread"
        on:click={() => thread && handleOpenInSlack(thread.parent)}
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
        <div 
          class="message thread-message-0" 
          class:selected={selectedIndex === 0}
          tabindex="0"
          role="article"
          aria-label="Thread parent message from {thread.parent.userName}"
          on:click={() => handleMessageClick(0)}
          on:keydown={(e) => handleMessageKeyDown(e, 0, thread.parent)}
        >
          <div class="message-header">
            <span class="user-name">{thread.parent.userName}</span>
            <span class="timestamp">{formatTimestamp(thread.parent.ts)}</span>
          </div>
          <div class="message-text">
            {#each parseMessageWithMentions(thread.parent.text) as segment}
              {#if segment.type === 'mention'}
                <span class="mention">{segment.content}</span>
              {:else if segment.type === 'url'}
                <a href={segment.url || segment.content} target="_blank" rel="noopener noreferrer" class="url-link">
                  {segment.content}
                </a>
              {:else}
                <span>{segment.content}</span>
              {/if}
            {/each}
          </div>
        </div>
      </div>
      
      {#if thread.replies.length > 0}
        <div class="thread-replies">
          <div class="replies-header">
            {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
          </div>
          {#each thread.replies as reply, index}
            <div 
              class="message reply thread-message-{index + 1}" 
              class:selected={selectedIndex === index + 1}
              tabindex="0"
              role="article"
              aria-label="Reply from {reply.userName}"
              on:click={() => handleMessageClick(index + 1)}
              on:keydown={(e) => handleMessageKeyDown(e, index + 1, reply)}
            >
              <div class="message-header">
                <span class="user-name">{reply.userName}</span>
                <span class="timestamp">{formatTimestamp(reply.ts)}</span>
              </div>
              <div class="message-text">
                {#each parseMessageWithMentions(reply.text) as segment}
                  {#if segment.type === 'mention'}
                    <span class="mention">{segment.content}</span>
                  {:else if segment.type === 'url'}
                    <a href={segment.url || segment.content} target="_blank" rel="noopener noreferrer" class="url-link">
                      {segment.content}
                    </a>
                  {:else}
                    <span>{segment.content}</span>
                  {/if}
                {/each}
              </div>
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
        <div>
          <h3>Message in #{message.channelName}</h3>
          <span class="keyboard-hint">Press Enter to open in Slack</span>
        </div>
        <button
          class="btn-open-thread"
          on:click={() => handleOpenInSlack(message)}
        >
          Open in Slack
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
      </div>
      
      <div 
        class="message thread-message-0" 
        class:selected={selectedIndex === 0}
        tabindex="0"
        role="article"
        aria-label="Message from {message.userName}"
        on:click={() => handleMessageClick(0)}
        on:keydown={(e) => handleMessageKeyDown(e, 0, message)}
      >
        <div class="message-header">
          <span class="user-name">{message.userName}</span>
          <span class="timestamp">{formatTimestamp(message.ts)}</span>
        </div>
        <div class="message-text">
          {#each parseMessageWithMentions(message.text) as segment}
            {#if segment.type === 'mention'}
              <span class="mention">{segment.content}</span>
            {:else if segment.type === 'url'}
              <a href={segment.url || segment.content} target="_blank" rel="noopener noreferrer" class="url-link">
                {segment.content}
              </a>
            {:else}
              <span>{segment.content}</span>
            {/if}
          {/each}
        </div>
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
    outline: none;
  }
  
  .thread-view:focus {
    box-shadow: inset 0 0 0 2px var(--primary);
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
  
  .keyboard-hint {
    display: block;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
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
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
  }
  
  .message:hover {
    border-color: var(--primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .message:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  
  .message.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
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
  
  .mention {
    display: inline-block;
    padding: 0 0.125rem;
    background: rgba(29, 155, 209, 0.1);
    color: #1d9bd1;
    font-weight: 500;
    border-radius: 3px;
    transition: background 0.2s;
  }
  
  .mention:hover {
    background: rgba(29, 155, 209, 0.2);
    text-decoration: underline;
    cursor: pointer;
  }
  
  .message.selected .mention {
    background: rgba(29, 155, 209, 0.15);
    color: #1d9bd1;
  }
  
  .url-link {
    color: #1d9bd1;
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: all 0.2s;
    word-break: break-all;
  }
  
  .url-link:hover {
    text-decoration: none;
    border-bottom-color: #1d9bd1;
    background: rgba(29, 155, 209, 0.05);
  }
  
  .url-link:visited {
    color: #7a5fb5;
  }
  
  .message.selected .url-link {
    background: rgba(29, 155, 209, 0.08);
    padding: 0 0.125rem;
    border-radius: 3px;
  }
</style>