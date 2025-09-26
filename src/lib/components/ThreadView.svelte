<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ThreadMessages, Message } from '../types/slack';
  import { getThread, openInSlack, openUrlsSmart } from '../api/slack';
  import { activeWorkspace } from '../stores/workspaces';
  import { urlService } from '../services/urlService';
  import { showSuccess, showError, showInfo } from '../stores/toast';
  import { parseMessageWithMentions } from '../utils/mentionParser';
  import { decodeSlackText } from '../utils/htmlEntities';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';
  import MessageItem from './MessageItem.svelte';
  import PostDialog from './PostDialog.svelte';
  import { logger } from '../services/logger';
  import { lightboxOpen } from '../stores/filePreview';
  import { isPostDialogOpen } from '../stores/postDialog';
  import { getKeyboardService } from '../services/keyboardService';

  export let message: Message | null = null;

  let thread: ThreadMessages | null = null;
  let loading = false;
  let error: string | null = null;
  let selectedIndex = -1;
  let threadViewElement: HTMLDivElement;
  let isExpanded = false;

  // Post dialog state
  let showPostDialog = false;
  let postInitialText = '';
  
  $: if (message) {
    console.log('[ThreadView] Message changed:', {
      ts: message.ts,
      threadTs: message.threadTs,
      isThreadParent: message.isThreadParent,
      replyCount: message.replyCount,
      text: message.text.substring(0, 50),
      channel: message.channel,
      fullMessage: message
    });
    
    // Debug: Check all conditions
    const hasThreadTs = !!message.threadTs;
    const isParent = message.isThreadParent;
    const hasReplies = message.replyCount && message.replyCount > 0;
    
    console.log('[ThreadView] Thread detection:', {
      hasThreadTs,
      isParent,
      hasReplies,
      willLoadThread: isParent || hasThreadTs
    });
    
    // IMPORTANT: For search results, we don't have reliable isThreadParent info
    // So we check: if message has threadTs, it's part of a thread (either parent or reply)
    // Always try to load thread for any selected message
    if (message.threadTs) {
      // This message is part of a thread - load it using threadTs
      const tsToUse = message.threadTs;
      console.log('[ThreadView] Thread message detected (has threadTs), loading thread with ts:', tsToUse);
      loadThread(message.channel, tsToUse);
    } else {
      // This might be a standalone message OR a thread parent
      // Try loading as thread - if it has replies, they'll show up
      console.log('[ThreadView] Message without threadTs, attempting to load as potential thread parent');
      loadThread(message.channel, message.ts);
    }
  }
  
  async function loadThread(channelId: string, threadTs: string) {
    console.log('[ThreadView] loadThread called with:', { channelId, threadTs });
    
    // Validate inputs
    if (!channelId || !threadTs) {
      console.error('[ThreadView] Invalid inputs:', { channelId, threadTs });
      error = 'Invalid channel or thread timestamp';
      loading = false;
      return;
    }
    
    loading = true;
    error = null;
    thread = null;
    
    try {
      console.log('[ThreadView] Calling getThread API...');
      const result = await getThread(channelId, threadTs);
      console.log('[ThreadView] Thread API response:', {
        hasResult: !!result,
        hasParent: !!result?.parent,
        repliesCount: result?.replies?.length || 0,
        parentText: result?.parent?.text?.substring(0, 50),
        replies: result?.replies?.map(r => ({
          ts: r.ts,
          text: r.text.substring(0, 50)
        }))
      });
      
      thread = result;
      
      // Validate thread response
      if (!thread || !thread.parent) {
        console.error('[ThreadView] Invalid thread response:', thread);
        throw new Error('Invalid thread response');
      }
      
      console.log('[ThreadView] Thread loaded successfully with', thread.replies.length, 'replies');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load thread';
      console.error('[ThreadView] Error loading thread:', err, errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes('Thread not found')) {
        error = 'This message has no thread';
      } else if (errorMessage.includes('Authentication')) {
        error = 'Authentication failed. Please check your Slack token.';
      } else if (errorMessage.includes('Network')) {
        error = 'Network error. Please check your connection.';
      } else {
        error = errorMessage;
      }
      
      console.error('Failed to load thread:', err);
    } finally {
      loading = false;
      console.log('[ThreadView] Loading complete, thread:', thread ? 'loaded' : 'failed');
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
      // Extract URLs from message text (use decoded text for URL extraction)
      const extractedUrls = urlService.extractUrls(decodeSlackText(messageToOpen.text));
      
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

  function openThreadReplyDialog(initialText: string = '') {
    if (!thread) return;
    postInitialText = initialText;
    showPostDialog = true;
    isPostDialogOpen.set(true);
  }

  function handlePostSuccess() {
    showPostDialog = false;
    isPostDialogOpen.set(false);
    // Reload thread to show new reply
    if (message) {
      const tsToUse = message.threadTs || message.ts;
      loadThread(message.channel, tsToUse);
    }
    // Refocus the thread view
    requestAnimationFrame(() => {
      if (threadViewElement) {
        threadViewElement.focus();
      }
    });
  }

  function handlePostCancel() {
    showPostDialog = false;
    isPostDialogOpen.set(false);
    // Refocus the thread view
    requestAnimationFrame(() => {
      if (threadViewElement) {
        threadViewElement.focus();
      }
    });
  }

  // Handle focus events for expansion
  function handleContainerFocus() {
    isExpanded = true;
  }

  function handleContainerBlur(event: FocusEvent) {
    // Check if focus is moving to a child element
    if (threadViewElement && !threadViewElement.contains(event.relatedTarget as Node)) {
      isExpanded = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!thread) return;

    // Debug logging for Q key
    if (event.key.toLowerCase() === 'q') {
      console.log('[ThreadView] Q key pressed', {
        activeElement: document.activeElement,
        threadViewElement,
        contains: threadViewElement?.contains(document.activeElement),
        selectedIndex,
        showPostDialog
      });
    }

    // Check if lightbox is open - if so, don't handle navigation
    if ($lightboxOpen) {
      return; // Let lightbox handle navigation
    }

    // Check if saved search dropdown is open - if so, don't handle navigation
    const savedSearchDropdown = document.querySelector('.saved-search-dropdown');
    if (savedSearchDropdown) {
      return; // Let SavedSearchManager handle navigation
    }

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
        event.stopPropagation(); // Stop event from bubbling to ResultList
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
        event.stopPropagation(); // Stop event from bubbling to ResultList
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
        event.stopPropagation();
        if (selectedIndex >= 0 && selectedIndex < totalMessages) {
          const selectedMsg = messages[selectedIndex].message;
          handleOpenInSlack(selectedMsg);
        }
        break;
      case 'Home':
      case 'h':
      case 'H':
        event.preventDefault();
        event.stopPropagation();
        if (totalMessages > 0) {
          selectedIndex = 0;
          focusMessage(selectedIndex);
          // Show feedback to user
          showInfo('Jumped to first message in thread', `Message 1 of ${totalMessages}`);
        }
        break;
      case 'End':
        event.preventDefault();
        event.stopPropagation();
        if (totalMessages > 0) {
          selectedIndex = totalMessages - 1;
          focusMessage(selectedIndex);
          // Show feedback to user
          showInfo('Jumped to last message in thread', `Message ${totalMessages} of ${totalMessages}`);
        }
        break;
      case 'e':
      case 'E':
        event.preventDefault();
        event.stopPropagation();
        // Jump to last message (restore original E key behavior)
        if (totalMessages > 0) {
          selectedIndex = totalMessages - 1;
          focusMessage(selectedIndex);
          // Show feedback to user
          showInfo('Jumped to last message in thread', `Message ${totalMessages} of ${totalMessages}`);
        }
        break;
      // Q key is now handled in the capture phase listener
    }
  }
  
  function focusMessage(index: number) {
    // Use data-message-index attribute to find the container
    const messageElement = document.querySelector(`.thread-messages [data-message-index="${index}"]`) as HTMLElement;
    if (messageElement) {
      // Scroll the message into view
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Don't focus on the message element itself - let the ThreadView maintain focus
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

    // Add event listener in capture phase to handle Q key before KeyboardService
    const handleQuoteKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'q' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        // Check if thread view has focus
        if (threadViewElement && threadViewElement.contains(document.activeElement)) {
          // Check if post dialog is open
          if (showPostDialog) return;

          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // Handle the quote action
          handleQuoteMessage();
        }
      }
    };

    // Add listener in capture phase (true = capture)
    document.addEventListener('keydown', handleQuoteKey, true);

    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleQuoteKey, true);
    };
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

  // Export function to handle quote action from outside
  export function handleQuoteMessage() {
    // Quote the selected message in thread
    if (thread && selectedIndex >= 0) {
      const messages = getAllMessages();
      if (selectedIndex < messages.length) {
        const selectedMsg = messages[selectedIndex].message;
        const decodedText = decodeSlackText(selectedMsg.text);
        // Quote the message text by adding "> " to the beginning of each line
        const quotedText = decodedText.split('\n').map(line => `> ${line}`).join('\n') + '\n';
        openThreadReplyDialog(quotedText);
      }
    }
  }

  // Export function to reset expanded state when search bar is toggled
  export function resetExpanded() {
    isExpanded = false;
  }
</script>

<div class="thread-view" class:expanded={isExpanded} bind:this={threadViewElement} on:keydown={handleKeyDown} on:focus={handleFocus} on:focus={handleContainerFocus} on:blur={handleContainerBlur} role="region" aria-label="Thread messages" tabindex="-1">
  {#if !message}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" opacity="0.3">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      <p>Select a message to view thread</p>
    </div>
  {:else if loading}
    <div class="loading">
      <SkeletonLoader type="thread" count={1} />
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
        <h3>Thread in #{decodeSlackText(thread.parent.channelName)}</h3>
        <span class="keyboard-hint">Use ↑↓/J/K to navigate, H/E for first/last, Enter to open in Slack, Alt+Enter to open URLs</span>
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
      <!-- Display parent message -->
      <div data-message-ts={thread.parent.ts} data-message-index="0">
        <MessageItem
          message={thread.parent}
          selected={selectedIndex === 0}
          focused={selectedIndex === 0}
          enableReactions={true}
          showChannelBadge={false}
          on:click={() => handleMessageClick(0)}
        />
      </div>

      <!-- Display thread replies the same way -->
      {#if thread.replies.length > 0}
        {#each thread.replies as reply, index}
          <div data-message-ts={reply.ts} data-message-index={index + 1}>
            <MessageItem
              message={reply}
              selected={selectedIndex === index + 1}
              focused={selectedIndex === index + 1}
              enableReactions={true}
              showChannelBadge={false}
              on:click={() => handleMessageClick(index + 1)}
            />
          </div>
        {/each}
      {/if}
    </div>
  {:else if message && !message.isThreadParent}
    <div class="single-message">
      <div class="thread-header">
        <div>
          <h3>Message in #{decodeSlackText(message.channelName)}</h3>
          <span class="keyboard-hint">Press Enter to open in Slack, Alt+Enter to open URLs</span>
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
      
      <div class="thread-messages">
        <div data-message-ts={message.ts} data-message-index="0">
          <MessageItem
            message={message}
            selected={selectedIndex === 0}
            focused={selectedIndex === 0}
            enableReactions={true}
            showChannelBadge={false}
            on:click={() => handleMessageClick(0)}
          />
        </div>
      </div>
    </div>
  {/if}

  {#if showPostDialog && thread}
    <PostDialog
      mode="thread"
      continuousMode={false}
      channelId={thread.parent.channel}
      channelName={thread.parent.channelName || thread.parent.channel}
      threadTs={thread.parent.threadTs || thread.parent.ts}
      messagePreview={decodeSlackText(thread.parent.text).slice(0, 100)}
      initialText={postInitialText}
      on:success={handlePostSuccess}
      on:cancel={handlePostCancel}
    />
  {/if}
</div>

<style>
  .thread-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-radius: 6px;
    overflow: hidden;
    outline: none;
    min-height: 0; /* Important for flex containers with scrollable children */
    /* Remove height: 100% to work properly without parent having flex: 1 */
    transition: all 0.3s ease;
  }

  /* When expanded (focused), take more space */
  .thread-view.expanded {
    position: fixed;
    top: 60px; /* Reduced for compact header and search bar */
    left: calc(50% - 4px); /* Take up right half */
    right: 8px;
    bottom: 8px;
    height: auto !important;
    max-height: calc(100vh - 76px);
    z-index: 100;
    background: var(--bg-secondary);
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .thread-view:focus {
    box-shadow: inset 0 0 0 3px var(--primary);
    outline: 2px solid var(--primary);
    outline-offset: -2px;
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
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
    flex-shrink: 0;
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
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-open-thread:hover {
    background: var(--primary-hover);
  }
  
  .thread-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem;
    outline: none;
    min-height: 0; /* Important for flex child to be scrollable */
  }

  .single-message {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem;
    min-height: 0;
    outline: none;
  }

  .thread-messages:focus {
    box-shadow: inset 0 0 0 2px var(--primary);
  }

  /* Style to match ResultList scrollbar */
  .thread-messages::-webkit-scrollbar {
    width: 8px;
  }

  .thread-messages::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  .thread-messages::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  .thread-messages::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
  
  /* Mention and URL styling handled by MessageItem component */
</style>