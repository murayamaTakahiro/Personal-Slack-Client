<script lang="ts">
  import EmojiImage from './EmojiImage.svelte';
  import { parseMessageWithEmojis } from '../utils/emojiParser';
  import { parseMessageWithMarkdown } from '../utils/markdownParser';
  import { decodeSlackText } from '../utils/htmlEntities';
  import { parseMessageWithMentionsUsingUserStore } from '../utils/mentionParserWithUsers';

  export let text: string = '';

  // Rendering pipeline (same as MessageItem.svelte)
  $: decodedText = decodeSlackText(text);
  $: mentionSegments = parseMessageWithMentionsUsingUserStore(decodedText);
  $: emojiSegments = mentionSegments.flatMap(segment => {
    if (segment.type === 'mention' || segment.type === 'url') {
      return [segment];
    } else {
      return parseMessageWithEmojis(segment.content);
    }
  });
  $: messageSegments = parseMessageWithMarkdown(emojiSegments);
</script>

<div class="message-preview">
  <div class="preview-label">Preview</div>
  <div class="preview-content">
    {#if text.trim().length === 0}
      <span class="preview-placeholder">Enter text to see preview...</span>
    {:else}
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
    {/if}
  </div>
</div>

<style>
  .message-preview {
    display: flex;
    flex-direction: column;
    border: 1px dashed var(--color-border, #ddd);
    border-radius: 4px;
    background: var(--color-background-secondary, #f8f8f8);
    overflow: hidden;
    height: 100%;
  }

  .preview-label {
    padding: 6px 12px;
    background: var(--color-background-tertiary, #e8e8e8);
    border-bottom: 1px solid var(--color-border, #ddd);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .preview-content {
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-text, #333);
    overflow-y: auto;
    word-wrap: break-word;
    white-space: pre-wrap;
    flex: 1;
  }

  /* Mobile: limit preview height */
  @media (max-width: 767px) {
    .message-preview {
      height: auto;
    }

    .preview-content {
      max-height: 200px;
    }
  }

  .preview-placeholder {
    color: var(--color-text-tertiary, #999);
    font-style: italic;
  }

  /* Reuse MessageItem styles for consistency */
  .slack-blockquote {
    border-left: 3px solid var(--color-border, #ddd);
    padding-left: 12px;
    margin: 8px 0;
    color: var(--color-text-secondary, #666);
    font-style: italic;
  }

  .slack-code-block {
    background: var(--color-background-tertiary, #f0f0f0);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
  }

  .slack-code-block code {
    background: none;
    border: none;
    padding: 0;
  }

  .slack-inline-code {
    background: transparent;
    border: none;
    border-radius: 3px;
    padding: 2px 4px;
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
    color: #e01e5a;
    font-weight: 500;
  }

  .mention {
    background: var(--color-mention-bg, #e3f2fd);
    color: var(--color-mention-text, #1565c0);
    padding: 2px 4px;
    border-radius: 3px;
    font-weight: 500;
  }

  .url-link {
    color: var(--color-link, #1a73e8);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-bottom-color 0.2s;
  }

  .url-link:hover {
    border-bottom-color: var(--color-link, #1a73e8);
  }

  /* Dark mode */
  :global([data-theme='dark']) .message-preview {
    background: #2a2a2a;
    border-color: #444;
  }

  :global([data-theme='dark']) .preview-label {
    background: #1a1a1a;
    border-bottom-color: #444;
    color: #999;
  }

  :global([data-theme='dark']) .preview-content {
    color: #fff;
  }

  :global([data-theme='dark']) .preview-placeholder {
    color: #666;
  }

  :global([data-theme='dark']) .slack-blockquote {
    border-left-color: #444;
    color: #999;
  }

  :global([data-theme='dark']) .slack-code-block {
    background: #1a1a1a;
    border-color: #444;
  }

  :global([data-theme='dark']) .slack-inline-code {
    background: transparent;
    border: none;
    color: #ff6b9d;
  }

  :global([data-theme='dark']) .mention {
    background: #1a3a52;
    color: #64b5f6;
  }

  :global([data-theme='dark']) .url-link {
    color: #64b5f6;
  }
</style>
