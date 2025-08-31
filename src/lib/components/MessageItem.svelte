<script lang="ts">
  import type { Message, EmojiReaction } from '../types/slack';
  import { openInSlack, openUrlsSmart } from '../api/slack';
  import { createEventDispatcher, onMount } from 'svelte';
  import { activeWorkspace } from '../stores/workspaces';
  import { reactionService, reactionMappings } from '../services/reactionService';
  import { getKeyboardService } from '../services/keyboardService';
  import { urlService } from '../services/urlService';
  import { showSuccess, showError, showInfo } from '../stores/toast';
  import ReactionPicker from './ReactionPicker.svelte';
  import { parseMessageWithMentions } from '../utils/mentionParser';
  
  export let message: Message;
  export let selected = false;
  export let enableReactions = true;
  export let showChannelBadge = false;
  
  const dispatch = createEventDispatcher();
  
  let reactions: EmojiReaction[] = message.reactions || [];
  let showReactionPicker = false;
  
  // Update reactions when message prop changes (for realtime mode)
  $: reactions = message.reactions || [];
  
  // Ensure handlers are properly registered after Live mode updates
  // This handles cases where the message prop changes during realtime updates
  $: if (message) {
    // Re-register handlers if this message is selected but handlers aren't registered
    // This can happen during Live mode when components are updated
    if (selected && enableReactions && !handlersRegistered) {
      console.log('🔍 DEBUG: Message updated, re-registering handlers for selected message', {
        messageTs: message.ts,
        selected,
        handlersRegistered
      });
      // Use setTimeout to avoid issues with reactive updates
      setTimeout(() => {
        if (selected && enableReactions && !handlersRegistered) {
          registerKeyboardHandlers();
        }
      }, 10);
    }
  }
  
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
  
  $: messageSegments = parseMessageWithMentions(truncateText(message.text));
  
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
  
  async function handleOpenUrls() {
    if (!selected) return;
    
    try {
      // Extract URLs from message text
      const extractedUrls = urlService.extractUrls(message.text);
      console.log('🔍 DEBUG: Extracted URLs:', extractedUrls);
      
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
      
      console.log('🔍 DEBUG: URL opening result:', result);
      
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
      // Get fresh reactions before toggling to ensure accurate state
      const currentReactions = await reactionService.getReactions(message.channel, message.ts);
      await reactionService.addReactionByShortcut(message.channel, message.ts, shortcut, currentReactions);
      // Refresh reactions after toggling
      reactions = await reactionService.getReactions(message.channel, message.ts);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }
  
  function openReactionPicker(event: MouseEvent) {
    if (!enableReactions || isPickerOpen) return;
    
    event.stopPropagation();
    showReactionPicker = true;
    isPickerOpen = true;
    console.log('🔍 DEBUG: Reaction picker opened via mouse click');
  }
  
  function closeReactionPicker() {
    console.log('🔍 DEBUG: closeReactionPicker called', {
      showReactionPicker: showReactionPicker,
      isPickerOpen,
      selected,
      enableReactions,
      handlersRegistered
    });
    showReactionPicker = false;
    isPickerOpen = false;
    // NOTE: No re-registration needed here - handlers should remain registered
    // for the selected message until selection changes
  }
  
  async function handleEmojiSelect(event: CustomEvent<{emoji: string}>) {
    const { emoji } = event.detail;
    console.log('🔍 DEBUG: handleEmojiSelect called', {
      emoji,
      showReactionPicker: showReactionPicker,
      isPickerOpen,
      selected,
      enableReactions,
      handlersRegistered
    });
    showReactionPicker = false;
    isPickerOpen = false;
    
    if (!enableReactions) return;
    
    try {
      await reactionService.toggleReaction(message.channel, message.ts, emoji, reactions);
      // Refresh reactions
      reactions = await reactionService.getReactions(message.channel, message.ts);
      // NOTE: No re-registration needed - handlers remain active for selected message
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  }
  
  // Track keyboard handler registration more reliably
  let handlersRegistered = false;
  let isPickerOpen = false; // Track picker state separately
  let messageItemElement: HTMLElement; // Reference to this message item element
  
  function registerKeyboardHandlers() {
    const keyboardService = getKeyboardService();
    console.log('🔍 DEBUG: registerKeyboardHandlers called', {
      keyboardService: !!keyboardService,
      handlersRegistered,
      selected,
      enableReactions,
      messageTs: message.ts
    });
    
    if (!keyboardService) {
      console.log('🔍 DEBUG: No keyboard service available');
      return;
    }
    
    // Always proceed with registration to ensure handlers are active
    // handlersRegistered flag will be set at the end
    
    try {
      // Register 'r' key for opening reaction picker
      keyboardService.registerHandler('openReactionPicker', {
        action: () => {
          console.log('🔍 DEBUG: openReactionPicker action triggered', { 
            showReactionPicker, 
            isPickerOpen,
            selected, 
            enableReactions 
          });
          
          // Prevent opening if picker is already open
          if (isPickerOpen || showReactionPicker) {
            console.log('🔍 DEBUG: Picker already open, ignoring keyboard trigger');
            return;
          }
          
          // Reset picker state before opening
          showReactionPicker = true;
          isPickerOpen = true;
          console.log('🔍 DEBUG: Reaction picker opened via keyboard', { 
            showReactionPicker: true
          });
        },
        allowInInput: false
      });
      
      // Register number keys 1-9 for reactions
      for (let i = 1; i <= 9; i++) {
        keyboardService.registerHandler(`reaction${i}` as any, {
          action: () => handleQuickReaction(i),
          allowInInput: false
        });
      }
      
      // NOTE: We don't register Alt+Enter (openUrls) here because:
      // 1. ResultList already handles it for the focused message
      // 2. Multiple registrations would overwrite each other
      // 3. The ResultList's handler properly gets the focused message
      
      handlersRegistered = true;
      console.log('🔍 DEBUG: Keyboard handlers registered successfully');
    } catch (error) {
      console.error('Failed to register keyboard handlers:', error);
    }
  }
  
  function unregisterKeyboardHandlers() {
    const keyboardService = getKeyboardService();
    console.log('🔍 DEBUG: unregisterKeyboardHandlers called', {
      keyboardService: !!keyboardService,
      handlersRegistered,
      selected,
      messageTs: message.ts
    });
    
    if (!keyboardService) {
      console.log('🔍 DEBUG: No keyboard service available');
      handlersRegistered = false; // Reset state even if service unavailable
      return;
    }
    
    try {
      // Always attempt to unregister, even if handlersRegistered is false
      // This handles cases where state might be inconsistent during Live mode
      keyboardService.unregisterHandler('openReactionPicker');
      // NOTE: We don't unregister openUrls since we never register it
      for (let i = 1; i <= 9; i++) {
        keyboardService.unregisterHandler(`reaction${i}` as any);
      }
      handlersRegistered = false;
      console.log('🔍 DEBUG: Keyboard handlers unregistered successfully');
    } catch (error) {
      console.error('Failed to unregister keyboard handlers:', error);
      handlersRegistered = false; // Reset state even on error
    }
  }
  
  // Register/unregister keyboard shortcuts when selection changes
  // Use a more stable approach that handles Live mode re-renders
  let previousSelected = false;
  $: if (selected !== previousSelected) {
    // Selection state changed
    previousSelected = selected;
    
    if (selected && enableReactions) {
      // Always re-register when becoming selected to ensure handlers are active
      // First unregister to clean up any stale state
      if (handlersRegistered) {
        unregisterKeyboardHandlers();
      }
      // Use a small delay to ensure proper cleanup
      setTimeout(() => {
        if (selected && enableReactions) {
          registerKeyboardHandlers();
        }
      }, 10);
    } else if (!selected && handlersRegistered) {
      // Unregister when deselected
      unregisterKeyboardHandlers();
    }
  }
  
  onMount(() => {
    return () => {
      // Cleanup keyboard handlers on unmount
      unregisterKeyboardHandlers();
    };
  });
</script>

<button
  class="message-item"
  class:selected
  on:click={handleClick}
  bind:this={messageItemElement}
>
  <div class="message-header">
    <div class="message-meta">
      <span class="user-name">{message.userName}</span>
      <span class="separator">•</span>
      {#if showChannelBadge}
        <span class="channel-badge">#{message.channelName}</span>
      {:else}
        <span class="channel-name">#{message.channelName}</span>
      {/if}
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
    {#each messageSegments as segment}
      {#if segment.type === 'mention'}
        <span class="mention">{segment.content}</span>
      {:else}
        <span>{segment.content}</span>
      {/if}
    {/each}
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

{#if showReactionPicker}
  <ReactionPicker
    on:select={handleEmojiSelect}
    on:close={closeReactionPicker}
  />
{/if}

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
  
  .channel-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 12px;
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 500;
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
  
  .message-item.selected .mention {
    background: rgba(29, 155, 209, 0.15);
    color: #1d9bd1;
  }
</style>