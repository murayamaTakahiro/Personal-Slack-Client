<script lang="ts">
  import type { Message, EmojiReaction } from '../types/slack';
  import { createEventDispatcher } from 'svelte';
  import { activeWorkspace } from '../stores/workspaces';
  import { showInfo, showError } from '../stores/toast';
  import EmojiImage from './EmojiImage.svelte';
  import { parseMessageWithEmojis, parseEmoji } from '../utils/emojiParser';
  import { decodeSlackText } from '../utils/htmlEntities';
  
  export let message: Message;
  export let selected = false;
  export let focused = false;
  export let enableReactions = true;
  export let showChannelBadge = false;
  
  const dispatch = createEventDispatcher();
  
  // Memoize expensive computations
  $: decodedText = decodeSlackText(message.text);
  $: truncatedText = truncateText(decodedText, 200);
  $: messageSegments = parseMessageWithEmojis(truncatedText);
  $: formattedTime = formatTimestamp(message.ts);
  $: slackUrl = generateSlackUrl(message, $activeWorkspace);
  
  function formatTimestamp(ts: string) {
    const timestamp = parseFloat(ts) * 1000;
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
  
  function truncateText(text: string, maxLength = 200) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  function generateSlackUrl(msg: Message, workspace: any): string {
    if (!workspace) {
      return msg.permalink;
    }
    
    const channelId = msg.channel;
    const messageTs = msg.ts.replace('.', '');
    
    if (msg.threadTs && msg.threadTs !== msg.ts) {
      const threadTs = msg.threadTs.replace('.', '');
      return `https://${workspace.domain}.slack.com/archives/${channelId}/p${threadTs}?thread_ts=${msg.threadTs}&cid=${channelId}`;
    } else {
      return `https://${workspace.domain}.slack.com/archives/${channelId}/p${messageTs}`;
    }
  }
  
  async function handleOpenInSlack(e: MouseEvent) {
    e.stopPropagation();
    try {
      const { openInSlack } = await import('../api/slack');
      await openInSlack(slackUrl);
    } catch (error) {
      console.error('Failed to open in Slack:', error);
    }
  }
  
  function handleClick() {
    dispatch('click');
  }
  
  // Simplified reaction display
  function getEmojiDisplay(name: string) {
    const emojiData = parseEmoji(name);
    return emojiData;
  }
</script>

<button
  class="message-item"
  class:selected
  class:focused
  on:click={handleClick}
  aria-label="{decodedText} from {decodeSlackText(message.userName)}"
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
      <span class="timestamp">{formattedTime}</span>
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
        aria-label="Open in Slack"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
    </div>
  </div>
  
  {#if message.reactions && message.reactions.length > 0}
    <div class="reactions">
      {#each message.reactions.slice(0, 5) as reaction}
        {@const emojiData = getEmojiDisplay(reaction.name)}
        <span
          class="reaction-badge"
          class:user-reacted={reaction.users.includes(message.user)}
          title={`${reaction.users.length} reaction${reaction.users.length > 1 ? 's' : ''}`}
        >
          <span class="reaction-emoji">
            {#if emojiData.isCustom}
              <EmojiImage emoji={reaction.name} url={emojiData.value} size="small" />
            {:else}
              {emojiData.value}
            {/if}
          </span>
          <span class="reaction-count">{reaction.count}</span>
        </span>
      {/each}
      {#if message.reactions.length > 5}
        <span class="reaction-more">+{message.reactions.length - 5}</span>
      {/if}
    </div>
  {/if}
  
  <div class="message-content">
    {#each messageSegments as segment}
      {#if segment.type === 'mention'}
        <span class="mention">{segment.content}</span>
      {:else if segment.type === 'url'}
        <span class="url-link">{segment.content}</span>
      {:else if segment.type === 'emoji'}
        <EmojiImage emoji={segment.content.replace(/:/g, '')} url={segment.emoji} size="small" />
      {:else}
        <span>{segment.content}</span>
      {/if}
    {/each}
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
  
  .message-item.focused {
    box-shadow: 0 0 0 2px var(--primary);
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
  
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
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
  
  .reaction-more {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.375rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  .mention {
    display: inline-block;
    padding: 0.125rem 0.25rem;
    background: rgba(255, 235, 59, 0.25);
    color: inherit;
    font-weight: 600;
    border-radius: 3px;
    border: 1px solid rgba(255, 235, 59, 0.4);
  }
  
  .url-link {
    color: #1d9bd1;
    text-decoration: none;
    border-bottom: 1px solid transparent;
    word-break: break-all;
  }
</style>