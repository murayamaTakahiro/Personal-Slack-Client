<script lang="ts">
  import type { Message, EmojiReaction } from '../types/slack';
  import { openInSlack, openUrlsSmart } from '../api/slack';
  import { createEventDispatcher, onMount } from 'svelte';
  import { activeWorkspace } from '../stores/workspaces';
  import { reactionService, reactionMappings } from '../services/reactionService';
  import { getKeyboardService } from '../services/keyboardService';
  import { urlService } from '../services/urlService';
  import { showSuccess, showError, showInfo } from '../stores/toast';
  import { searchResults } from '../stores/search';
  import ReactionPicker from './ReactionPicker.svelte';
  import EmojiImage from './EmojiImage.svelte';
  import FileAttachments from './files/FileAttachments.svelte';
  import { parseMessageWithEmojis, parseEmoji } from '../utils/emojiParser';
  import { parseMessageWithMarkdown } from '../utils/markdownParser';
  import { decodeSlackText } from '../utils/htmlEntities';
  import { parseMessageWithMentionsUsingUserStore } from '../utils/mentionParserWithUsers';
  import { currentUserId } from '../stores/currentUser';
  
  export let message: Message;
  export let selected = false;
  export let focused = false;
  export let enableReactions = true;
  export let showChannelBadge = false;
  
  const dispatch = createEventDispatcher();
  
  // DEBUG: Log message files
  
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
  
  function truncateText(text: string, maxLength = 2000) {
    if (text.length <= maxLength) return text;
    
    // Check if we're cutting off in the middle of a Slack-formatted URL
    const truncated = text.substring(0, maxLength);
    const lastOpenBracket = truncated.lastIndexOf('<');
    const lastCloseBracket = truncated.lastIndexOf('>');
    
    // If we have an unclosed '<' for a URL pattern, truncate before it
    if (lastOpenBracket > lastCloseBracket && text.substring(lastOpenBracket).startsWith('<http')) {
      // Truncate before the incomplete URL
      return text.substring(0, lastOpenBracket) + '...';
    }
    
    return truncated + '...';
  }
  
  // First decode Slack text, then parse (don't truncate before parsing to preserve URL integrity)
  $: decodedText = decodeSlackText(message.text);
  // First parse mentions using user store for accurate detection
  $: mentionSegments = parseMessageWithMentionsUsingUserStore(decodedText);
  // Then parse emojis in the segments that are not mentions
  $: emojiSegments = mentionSegments.flatMap(segment => {
    if (segment.type === 'mention' || segment.type === 'url') {
      return [segment];
    } else {
      return parseMessageWithEmojis(segment.content);
    }
  });
  $: markdownSegments = parseMessageWithMarkdown(emojiSegments);
  $: messageSegments = truncateSegments(markdownSegments, 2000);
  
  function truncateSegments(segments: any[], maxLength: number) {
    let totalLength = 0;
    const truncatedSegments = [];
    
    for (const segment of segments) {
      const segmentLength = segment.content.length;
      
      if (totalLength + segmentLength <= maxLength) {
        // Segment fits completely
        truncatedSegments.push(segment);
        totalLength += segmentLength;
      } else if (totalLength < maxLength) {
        // Segment needs truncation
        const remainingLength = maxLength - totalLength;
        
        if (segment.type === 'url') {
          // For URLs, either include fully or skip (don't truncate URLs)
          if (remainingLength > 20) {
            // If we have reasonable space, show truncated URL with ellipsis
            truncatedSegments.push({
              ...segment,
              content: segment.content.substring(0, remainingLength - 3) + '...'
            });
          } else {
            // Not enough space for meaningful URL display
            truncatedSegments.push({
              type: 'text',
              content: '...'
            });
          }
        } else {
          // For text/emoji/mention, truncate normally
          truncatedSegments.push({
            ...segment,
            content: segment.content.substring(0, remainingLength) + '...'
          });
        }
        break;
      } else {
        // We've reached the max length
        break;
      }
    }
    
    return truncatedSegments;
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
  
  async function handleOpenUrls() {
    if (!selected) return;
    
    try {
      // Extract URLs from message text (use decoded text for URL extraction)
      const extractedUrls = urlService.extractUrls(decodeSlackText(message.text));
      
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
  
  function handleClick() {
    dispatch('click');
  }

  // Helper function to update message reactions in the store
  function updateMessageReactionsInStore(newReactions: EmojiReaction[]) {
    // Update the searchResults store to reflect the new reactions
    searchResults.update(results => {
      if (!results) return results;

      const updatedMessages = results.messages.map(msg => {
        if (msg.ts === message.ts && msg.channel === message.channel) {
          // Update this message's reactions
          return { ...msg, reactions: newReactions };
        }
        return msg;
      });

      return { ...results, messages: updatedMessages };
    });
  }

  async function handleReactionClick(emoji: string) {
    if (!enableReactions) return;

    try {
      await reactionService.toggleReaction(message.channel, message.ts, emoji, reactions);
      // Refresh reactions
      reactions = await reactionService.getReactions(message.channel, message.ts);
      // Update the message in the store so ResultList reflects the change
      updateMessageReactionsInStore(reactions);
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
      // Update the message in the store so ResultList reflects the change
      updateMessageReactionsInStore(reactions);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }

  // Handle adding reactions from other users
  async function handleOtherReaction(index: number) {
    if (!enableReactions || !selected) return;

    // Get reactions from other users (not added by current user)
    const otherReactions = getOtherUsersReactions();

    if (index > 0 && index <= otherReactions.length) {
      const reactionToAdd = otherReactions[index - 1];
      try {
        // Use addReaction directly since we know the user hasn't added this reaction yet
        await reactionService.addReaction(message.channel, message.ts, reactionToAdd.name);
        // Refresh reactions
        reactions = await reactionService.getReactions(message.channel, message.ts);
        // Update the message in the store
        updateMessageReactionsInStore(reactions);
      } catch (error) {
        console.error('Failed to add reaction from others:', error);
      }
    }
  }

  // Get reactions from other users (not added by current user)
  function getOtherUsersReactions() {
    if (!reactions || !$currentUserId) return [];

    // Filter reactions that current user hasn't added yet
    const notAddedByMe = reactions.filter(r => !r.users.includes($currentUserId));

    // Sort by count (most popular first)
    return notAddedByMe.sort((a, b) => b.count - a.count);
  }

  // Get shortcut hint for a reaction
  function getReactionShortcutHint(reaction: EmojiReaction): string | null {
    if (!selected || !$currentUserId) return null;

    // If user hasn't reacted, check if it's in the other reactions list
    if (!reaction.users.includes($currentUserId)) {
      const otherReactions = getOtherUsersReactions();
      const index = otherReactions.findIndex(r => r.name === reaction.name);
      if (index >= 0 && index < 9) {
        return `⇧${index + 1}`;  // Show Shift+number
      }
    }

    return null;
  }
  
  function openReactionPicker(event: MouseEvent) {
    if (!enableReactions || isPickerOpen) return;
    
    event.stopPropagation();
    showReactionPicker = true;
    isPickerOpen = true;
  }
  
  function closeReactionPicker() {
    showReactionPicker = false;
    isPickerOpen = false;
    // NOTE: No re-registration needed here - handlers should remain registered
    // for the selected message until selection changes
  }
  
  async function handleEmojiSelect(event: CustomEvent<{emoji: string}>) {
    const { emoji } = event.detail;
    showReactionPicker = false;
    isPickerOpen = false;

    if (!enableReactions) return;

    try {
      await reactionService.toggleReaction(message.channel, message.ts, emoji, reactions);
      // Refresh reactions
      reactions = await reactionService.getReactions(message.channel, message.ts);
      // Update the message in the store so ResultList reflects the change
      updateMessageReactionsInStore(reactions);
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
    
    if (!keyboardService) {
      return;
    }
    
    // Always proceed with registration to ensure handlers are active
    // handlersRegistered flag will be set at the end
    
    try {
      // Register 'r' key for opening reaction picker
      keyboardService.registerHandler('openReactionPicker', {
        action: () => {
          // Prevent opening if picker is already open
          if (isPickerOpen || showReactionPicker) {
            return;
          }
          
          // Reset picker state before opening
          showReactionPicker = true;
          isPickerOpen = true;
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

      // Register Shift+1 through Shift+9 for adding reactions from others
      for (let i = 1; i <= 9; i++) {
        keyboardService.registerHandler(`otherReaction${i}` as any, {
          action: () => handleOtherReaction(i),
          allowInInput: false
        });
      }
      
      // NOTE: We don't register Alt+Enter (openUrls) here because:
      // 1. ResultList already handles it for the focused message
      // 2. Multiple registrations would overwrite each other
      // 3. The ResultList's handler properly gets the focused message
      
      handlersRegistered = true;
    } catch (error) {
      console.error('Failed to register keyboard handlers:', error);
    }
  }
  
  function unregisterKeyboardHandlers() {
    const keyboardService = getKeyboardService();
    
    if (!keyboardService) {
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
        keyboardService.unregisterHandler(`otherReaction${i}` as any);
      }
      handlersRegistered = false;
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
  class:focused
  on:click={handleClick}
  bind:this={messageItemElement}
>
  <div class="message-header">
    <div class="message-meta">
      <span class="user-name">{decodeSlackText(message.userName)}</span>
      <span class="separator">•</span>
      {#if showChannelBadge}
        <span class="channel-badge">#{decodeSlackText(message.channelName)}</span>
      {:else}
        <span class="channel-name">#{decodeSlackText(message.channelName)}</span>
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
        {@const emojiData = parseEmoji(reaction.name)}
        {@const shortcutHint = getReactionShortcutHint(reaction)}
        <button
          class="reaction-badge"
          class:user-reacted={$currentUserId && reaction.users.includes($currentUserId)}
          class:has-shortcut={shortcutHint}
          on:click|stopPropagation={() => handleReactionClick(reaction.name)}
          title={`${reaction.users.length} reaction${reaction.users.length > 1 ? 's' : ''}${shortcutHint ? ` (${shortcutHint})` : ''}`}
        >
          {#if shortcutHint}
            <span class="reaction-shortcut">{shortcutHint}</span>
          {/if}
          <span class="reaction-emoji">
            {#if emojiData.isCustom}
              <EmojiImage emoji={reaction.name} url={emojiData.value} size="small" />
            {:else if emojiData.value.startsWith(':')}
              {emojiData.value}
            {:else}
              {emojiData.value}
            {/if}
          </span>
          <span class="reaction-count">{reaction.count}</span>
        </button>
      {/each}
    </div>
  {/if}
  
  <div class="message-content">
    {#each messageSegments as segment}
      {#if segment.type === 'blockquote'}
        <blockquote class="slack-blockquote">{segment.content}</blockquote>
      {:else if segment.type === 'code-block'}
        <pre class="slack-code-block"><code class:has-language={segment.language} data-language={segment.language}>{segment.content}</code></pre>
      {:else if segment.type === 'inline-code'}
        <code class="slack-inline-code">{segment.content}</code>
      {:else if segment.type === 'mention'}
        <span class="mention">{segment.content}</span>
      {:else if segment.type === 'url'}
        <a href={segment.url || segment.content} target="_blank" rel="noopener noreferrer" class="url-link">
          {segment.content}
        </a>
      {:else if segment.type === 'emoji'}
        <EmojiImage emoji={segment.content.replace(/:/g, '')} url={segment.emoji} size="small" />
      {:else}
        <span>{segment.content}</span>
      {/if}
    {/each}
  </div>
  
  {#if message.files && message.files.length > 0}
    <FileAttachments
      files={message.files}
      workspaceId={$activeWorkspace?.id || 'default'}
      compact={true}
    />
  {/if}
  
  {#if selected && enableReactions}
    <div class="reaction-shortcuts">
      {#each mappings.slice(0, 9) as mapping}
        {@const emojiData = parseEmoji(mapping.display)}
        <span class="shortcut-hint">
          <kbd>{mapping.shortcut}</kbd>
          <span class="emoji-shortcut">
            {#if emojiData.isCustom}
              <EmojiImage emoji={mapping.display} url={emojiData.value} size="small" />
            {:else if emojiData.value.startsWith(':')}
              <span class="emoji-text">{emojiData.value}</span>
            {:else}
              <span class="emoji-unicode">{emojiData.value}</span>
            {/if}
          </span>
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
    margin-bottom: 0.125rem;
    background: var(--message-bg);
    border: 1px solid transparent;
    border-left: 3px solid transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .message-item:hover {
    background: var(--message-hover);
    border-left-color: var(--border);
  }

  .message-item.selected {
    background: var(--message-selected);
    border-left-color: var(--primary);
  }

  .message-item.focused {
    outline: 2px solid var(--border-focus);
    outline-offset: -2px;
    border-left-color: var(--primary);
  }
  
  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
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
    padding: 0.125rem 0.4rem;
    background: var(--primary-bg);
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--primary-text);
    font-size: 0.7rem;
    font-weight: 500;
    opacity: 0.9;
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
    padding: 0.2rem 0.4rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
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

  .reaction-badge.has-shortcut {
    position: relative;
  }

  .reaction-shortcut {
    position: absolute;
    top: -6px;
    left: -6px;
    background: var(--primary);
    color: white;
    font-size: 0.625rem;
    font-weight: bold;
    padding: 0 3px;
    border-radius: 4px;
    line-height: 1.2;
    min-width: 20px;
    text-align: center;
    z-index: 1;
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
    padding: 0.125rem 0.25rem;
    background: rgba(255, 235, 59, 0.25);
    color: inherit;
    font-weight: 600;
    border-radius: 3px;
    transition: background 0.2s;
    border: 1px solid rgba(255, 235, 59, 0.4);
  }
  
  .mention:hover {
    background: rgba(255, 235, 59, 0.35);
    text-decoration: none;
    cursor: pointer;
    border-color: rgba(255, 235, 59, 0.6);
  }
  
  .message-item.selected .mention {
    background: rgba(255, 235, 59, 0.3);
    color: inherit;
    border-color: rgba(255, 235, 59, 0.5);
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
  
  .message-item.selected .url-link {
    background: rgba(29, 155, 209, 0.08);
    padding: 0 0.125rem;
    border-radius: 3px;
  }
  
  .emoji-shortcut {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
  }
  
  .emoji-text {
    font-family: monospace;
    font-size: 0.9em;
    color: var(--text-secondary);
  }
  
  .emoji-unicode {
    font-size: 1.1em;
  }

  /* Slack-style markdown elements */
  .slack-blockquote {
    display: block;
    margin: 0.5rem 0;
    padding: 0.25rem 0.75rem;
    border-left: 4px solid #ddd;
    background: rgba(0, 0, 0, 0.02);
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .message-item.selected .slack-blockquote {
    background: rgba(0, 0, 0, 0.04);
    border-left-color: #bbb;
  }

  .slack-code-block {
    display: block;
    margin: 0.5rem 0;
    padding: 0.75rem;
    background: #1d1f21;
    border-radius: 4px;
    overflow-x: auto;
    max-width: 100%;
  }

  .slack-code-block code {
    display: block;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #f8f8f2;
    white-space: pre;
    word-break: normal;
    word-wrap: normal;
    tab-size: 2;
  }

  .slack-code-block code.has-language::before {
    content: attr(data-language);
    display: block;
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.5rem;
    text-transform: lowercase;
    font-style: italic;
  }

  .slack-inline-code {
    display: inline;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
    font-size: 0.8125rem;
    color: #e01e5a;
    white-space: nowrap;
  }

  .message-item.selected .slack-inline-code {
    /* No special styling for selected state */
  }

  /* Dark theme adjustments */
  @media (prefers-color-scheme: dark) {
    .slack-blockquote {
      border-left-color: #4a5568;
      background: rgba(255, 255, 255, 0.03);
    }

    .slack-inline-code {
      color: #ff8fab;
    }

    .message-item.selected .slack-inline-code {
      /* No special styling for selected state */
    }
  }
</style>