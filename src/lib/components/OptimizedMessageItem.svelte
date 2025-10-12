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
  import EmojiImage from './EmojiImage.svelte';
  import FileAttachments from './files/FileAttachments.svelte';
  import { parseMessageWithEmojis, parseEmoji } from '../utils/emojiParser';
  import { parseMessageWithMarkdown } from '../utils/markdownParser';
  import { decodeSlackText } from '../utils/htmlEntities';
  import { parseMessageWithMentionsUsingUserStore } from '../utils/mentionParserWithUsers';
  import { writable } from 'svelte/store';
  import { currentUserId } from '../stores/currentUser';
  import { filePreviewStore, lightboxOpen } from '../stores/filePreview';
  import { processFileMetadata } from '../services/fileService';
  import { downloadFilesInBatch } from '../api/files';
  import { settings, getDownloadFolder } from '../stores/settings';
  import { bookmarkStore } from '../stores/bookmarks';

  export let message: Message;
  export let selected = false;
  export let focused = false;
  export let enableReactions = true;
  export let showChannelBadge = false;

  const dispatch = createEventDispatcher();


  let showReactionPicker = false;
  let handlersRegistered = false;
  let isPickerOpen = false;
  let messageItemElement: HTMLElement;
  let lastFocusedFileIndex = 0; // Track which file was last focused for keyboard navigation

  // Process text using reactive statements like MessageItem does
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
  $: processedText = messageSegments.map(s => s.content).join('');


  // Memoized user and channel names - only decode once
  const decodedUserName = writable('');
  const decodedChannelName = writable('');
  
  $: {
    // Use userName if available, otherwise fallback to user ID
    const rawUserName = message.userName || message.user || 'Unknown';
    const newUserName = decodeSlackText(rawUserName);
    if ($decodedUserName !== newUserName) {
      decodedUserName.set(newUserName);
    }
  }
  
  $: {
    const rawChannelName = message.channelName || message.channel || 'Unknown';
    const newChannelName = decodeSlackText(rawChannelName);
    if ($decodedChannelName !== newChannelName) {
      decodedChannelName.set(newChannelName);
    }
  }

  // Separate reactions state to avoid full component re-renders
  const reactionsStore = writable<EmojiReaction[]>(message.reactions || []);
  $: {
    const reactions = message.reactions || [];
    console.log('[OptimizedMessageItem] Updating reactions for message', message.ts, ':', reactions.length, 'reactions');
    reactionsStore.set(reactions);
  }

  // Memoized timestamp formatting
  const formattedTimestamp = writable('');
  $: {
    const newTimestamp = formatTimestamp(message.ts);
    if ($formattedTimestamp !== newTimestamp) {
      formattedTimestamp.set(newTimestamp);
    }
  }

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
          // For URLs, either include fully or show ellipsis
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
      const extractedUrls = urlService.extractUrls(decodeSlackText(message.text));
      
      if (extractedUrls.slackUrls.length === 0 && extractedUrls.externalUrls.length === 0) {
        showInfo('No URLs found', 'This message does not contain any URLs to open.');
        return;
      }
      
      const prepared = urlService.prepareUrlsForOpening(extractedUrls);
      
      if (urlService.requiresConfirmation(prepared.externalUrls.length)) {
        const confirmed = confirm(`Opening ${prepared.externalUrls.length} external URLs. Continue?`);
        if (!confirmed) {
          showInfo('Cancelled', 'URL opening was cancelled by user.');
          return;
        }
      }
      
      const openingMessage = urlService.generateOpeningMessage(
        extractedUrls.slackUrls.length, 
        extractedUrls.externalUrls.length
      );
      showInfo('Opening URLs', openingMessage);
      
      const result = await openUrlsSmart(
        prepared.slackUrl,
        prepared.externalUrls,
        200
      );
      
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
      await reactionService.toggleReaction(message.channel, message.ts, emoji, $reactionsStore);
      const newReactions = await reactionService.getReactions(message.channel, message.ts);
      reactionsStore.set(newReactions);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  }

  async function handleQuickReaction(shortcut: number) {
    if (!enableReactions || !selected) return;

    try {
      const currentReactions = await reactionService.getReactions(message.channel, message.ts);
      await reactionService.addReactionByShortcut(message.channel, message.ts, shortcut, currentReactions);
      const newReactions = await reactionService.getReactions(message.channel, message.ts);
      reactionsStore.set(newReactions);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }

  // Get reactions added by other users (not the current user) - made reactive
  $: otherUsersReactions = (() => {
    if (!$reactionsStore || !$currentUserId) return [];

    // Keep the original order (left-to-right as displayed)
    return $reactionsStore
      .filter(reaction => !reaction.users.includes($currentUserId));
  })();

  // Handle adding a reaction from other users using Shift+number
  async function handleOtherReaction(index: number) {
    if (!enableReactions || !selected) return;

    // Get reactions from other users (not added by current user)
    const otherReactions = otherUsersReactions;

    if (index > 0 && index <= otherReactions.length) {
      const reactionToAdd = otherReactions[index - 1];
      try {
        // Use addReaction directly since we know the user hasn't added this reaction yet
        await reactionService.addReaction(message.channel, message.ts, reactionToAdd.name);
        const newReactions = await reactionService.getReactions(message.channel, message.ts);
        reactionsStore.set(newReactions);
      } catch (error) {
        console.error('Failed to add reaction from others:', error);
      }
    }
  }

  // Get shortcut hint for a reaction - made reactive
  $: getReactionShortcutHint = (reaction: EmojiReaction): string | null => {
    if (!selected || !$currentUserId) return null;

    // If user hasn't reacted, check if it's in the other reactions list
    if (!reaction.users.includes($currentUserId)) {
      const index = otherUsersReactions.findIndex(r => r.name === reaction.name);
      if (index >= 0 && index < 9) {
        return `⇧${index + 1}`;  // Show Shift+number
      }
    }

    return null;
  };

  // Check if this message is bookmarked
  // Subscribe to bookmarkStore to get reactive updates
  $: isBookmarked = $bookmarkStore.some(
    bookmark => bookmark.messageTs === message.ts && bookmark.channelId === message.channel
  );

  function openReactionPicker(event: MouseEvent) {
    if (!enableReactions || isPickerOpen) return;

    event.stopPropagation();
    showReactionPicker = true;
    isPickerOpen = true;
  }

  function closeReactionPicker() {
    showReactionPicker = false;
    isPickerOpen = false;
  }

  async function handleEmojiSelect(event: CustomEvent<{emoji: string}>) {
    const { emoji } = event.detail;
    showReactionPicker = false;
    isPickerOpen = false;
    
    if (!enableReactions) return;
    
    try {
      await reactionService.toggleReaction(message.channel, message.ts, emoji, $reactionsStore);
      const newReactions = await reactionService.getReactions(message.channel, message.ts);
      reactionsStore.set(newReactions);
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  }

  function handleOpenLightbox() {
    if (!selected || !message.files || message.files.length === 0) return;
    
    // Process all file metadata
    const metadata = message.files.map(file => processFileMetadata(file));
    
    // Open lightbox with the first image file or first file if no images
    const imageFiles = metadata.filter(m => m.type === 'image');
    const fileToOpen = imageFiles[lastFocusedFileIndex] || imageFiles[0] || metadata[0];
    
    if (fileToOpen) {
      filePreviewStore.openLightbox(fileToOpen, metadata);
    }
  }

  async function handleDownloadAllAttachments() {
    // Check if lightbox is open - if so, don't handle here
    const isLightboxOpen = $lightboxOpen;
    if (isLightboxOpen) {
      return; // Let lightbox handle its own D key
    }

    if (!selected || !message.files || message.files.length === 0) return;

    const totalFiles = message.files.length;

    // Show batch download started notification
    showInfo(
      'Batch download started',
      `Downloading ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`,
      3000
    );

    try {
      const downloadFolder = getDownloadFolder();
      const filesToDownload = message.files.map(f => ({
        url: f.url_private_download || f.url_private,
        fileName: f.name
      }));

      const result = await downloadFilesInBatch(filesToDownload, {
        savePath: downloadFolder,
        showDialog: !downloadFolder
      });

      if (result.success) {
        const downloadedCount = result.paths?.length || 0;
        const location = downloadFolder || 'Downloads folder';

        // Show success with details
        showSuccess(
          'Batch download complete',
          `${downloadedCount} of ${totalFiles} files saved to ${location}`,
          3000
        );

        // List file names if reasonable number
        if (downloadedCount > 0 && downloadedCount <= 5) {
          const fileNames = message.files.slice(0, downloadedCount).map(f => f.name).join(', ');
          showInfo('Downloaded files', fileNames, 5000);
        }
      } else if (result.error && !result.error.includes('cancelled')) {
        showError(
          'Batch download failed',
          `Failed to download files: ${result.error}`,
          5000
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Batch download failed';
      showError(
        'Batch download failed',
        `Failed to download files: ${errorMessage}`,
        5000
      );
    }
  }

  function registerKeyboardHandlers() {
    const keyboardService = getKeyboardService();

    if (!keyboardService) {
      return;
    }

    // Always proceed with registration to ensure handlers are active
    // handlersRegistered flag will be set at the end

    try {
      // Register 'd' key for downloading all attachments
      keyboardService.registerHandler('downloadAllAttachments', {
        action: () => {
          handleDownloadAllAttachments();
        },
        allowInInput: false
      });

      // Register 'i' key for opening image/file lightbox
      keyboardService.registerHandler('openLightbox', {
        action: () => {
          handleOpenLightbox();
        },
        allowInInput: false
      });
      
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
      // This handles cases where state might be inconsistent
      keyboardService.unregisterHandler('downloadAllAttachments');
      keyboardService.unregisterHandler('openLightbox');
      keyboardService.unregisterHandler('openReactionPicker');
      for (let i = 1; i <= 9; i++) {
        keyboardService.unregisterHandler(`reaction${i}` as any);
      }
      for (let i = 1; i <= 9; i++) {
        keyboardService.unregisterHandler(`otherReaction${i}` as any);
      }
      handlersRegistered = false;
    } catch (error) {
      console.error('Failed to unregister keyboard handlers:', error);
      handlersRegistered = false; // Reset state even on error
    }
  }

  // Register/unregister keyboard shortcuts when selection changes
  // Use a more stable approach that handles navigation
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
      <span class="user-name">{$decodedUserName}</span>
      <span class="separator">•</span>
      {#if showChannelBadge}
        <span class="channel-badge">#{$decodedChannelName}</span>
      {:else}
        <span class="channel-name">#{$decodedChannelName}</span>
      {/if}
      <span class="separator">•</span>
      <span class="timestamp">{$formattedTimestamp}</span>
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

      {#if isBookmarked}
        <span class="bookmark-indicator" title="Bookmarked">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
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
  
  {#if $reactionsStore && $reactionsStore.length > 0}
    <div class="reactions">
      {#each $reactionsStore as reaction}
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
    <!-- Debug: Log files data -->
    {@const _ = console.log('[OptimizedMessageItem] Files for message:', {
      messageId: message.id,
      filesCount: message.files.length,
      files: message.files
    })}
    <FileAttachments
      files={message.files}
      workspaceId={$activeWorkspace?.id || 'default'}
      compact={true}
    />
  {/if}
  
  {#if selected && enableReactions}
    <div class="reaction-shortcuts">
      {#each $reactionMappings.slice(0, 9) as mapping}
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

  .bookmark-indicator {
    display: flex;
    align-items: center;
    color: var(--primary);
    opacity: 0.8;
  }

  .bookmark-indicator:hover {
    opacity: 1;
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
    position: relative;
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