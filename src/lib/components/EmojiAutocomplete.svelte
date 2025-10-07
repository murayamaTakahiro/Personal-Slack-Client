<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { emojiSearchService, type EmojiSearchResult } from '../services/emojiSearchService';

  export let searchQuery: string = '';
  export let position: { x: number; y: number };

  const dispatch = createEventDispatcher();

  let selectedIndex = 0;
  let filteredEmojis: EmojiSearchResult[] = [];
  let dropdownElement: HTMLDivElement;
  let loading = false;

  onMount(() => {
    // Initial search
    searchEmojis(searchQuery);

    // Add keyboard event listener
    document.addEventListener('keydown', handleKeydown);

    // Position dropdown
    if (dropdownElement) {
      adjustDropdownPosition();
    }
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  $: searchEmojis(searchQuery);

  function searchEmojis(query: string) {
    loading = true;

    try {
      // Search for emojis matching the query (limit to 10)
      filteredEmojis = emojiSearchService.search(query, 10);

      // Reset selection index if needed
      if (selectedIndex >= filteredEmojis.length) {
        selectedIndex = 0;
      }
    } catch (error) {
      console.error('Failed to search emojis:', error);
      filteredEmojis = [];
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    // Only handle keys when autocomplete is visible
    if (!filteredEmojis.length) return;

    switch(event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, filteredEmojis.length - 1);
        scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        scrollToSelected();
        break;
      case 'Tab':
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        if (filteredEmojis[selectedIndex]) {
          selectEmoji(filteredEmojis[selectedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        dispatch('close');
        break;
    }
  }

  function selectEmoji(emoji: EmojiSearchResult) {
    dispatch('select', { emoji });
  }

  function scrollToSelected() {
    if (!dropdownElement) return;

    const items = dropdownElement.querySelectorAll('.emoji-item');
    const selectedItem = items[selectedIndex] as HTMLElement;

    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function adjustDropdownPosition() {
    if (!dropdownElement) return;

    const rect = dropdownElement.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    // Adjust vertical position if dropdown goes below viewport
    if (rect.bottom > windowHeight) {
      dropdownElement.style.top = `${position.y - rect.height - 20}px`;
    }

    // Adjust horizontal position if dropdown goes beyond viewport
    if (rect.right > windowWidth) {
      dropdownElement.style.left = `${windowWidth - rect.width - 10}px`;
    }
  }

  function getEmojiDisplay(emoji: EmojiSearchResult): string {
    if (emoji.isCustom) {
      // For custom emojis, show an image
      return '';
    } else {
      // For standard emojis, show the unicode character
      return emoji.value;
    }
  }
</script>

<div
  bind:this={dropdownElement}
  class="emoji-dropdown"
  style="left: {position.x || 100}px; top: {position.y || 200}px"
>
  {#if loading}
    <div class="loading">Searching...</div>
  {:else if filteredEmojis.length === 0}
    <div class="no-results">No emojis found</div>
  {:else}
    {#each filteredEmojis as emoji, index}
      <div
        class="emoji-item"
        class:selected={index === selectedIndex}
        on:click={() => selectEmoji(emoji)}
        on:mouseenter={() => selectedIndex = index}
      >
        <div class="emoji-display">
          {#if emoji.isCustom}
            <img src={emoji.value} alt={emoji.name} class="emoji-image" />
          {:else}
            <span class="emoji-unicode">{emoji.value}</span>
          {/if}
        </div>
        <div class="emoji-info">
          <div class="emoji-name">
            :{emoji.name}:
          </div>
          {#if emoji.matchedOn && emoji.matchedOn !== emoji.name}
            <div class="emoji-match">
              matched: {emoji.matchedOn}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .emoji-dropdown {
    position: fixed;
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 300px;
    width: 280px;
    overflow-y: auto;
    z-index: 100001;
    display: block;
  }

  .loading,
  .no-results {
    padding: 12px;
    text-align: center;
    color: var(--color-text-secondary, #666);
    font-size: 13px;
  }

  .emoji-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.1s;
    border-bottom: 1px solid var(--color-border-light, #f0f0f0);
  }

  .emoji-item:last-child {
    border-bottom: none;
  }

  .emoji-item:hover,
  .emoji-item.selected {
    background: var(--color-hover, #f5f5f5);
  }

  .emoji-display {
    width: 32px;
    height: 32px;
    margin-right: 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-image {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .emoji-unicode {
    font-size: 24px;
    line-height: 1;
  }

  .emoji-info {
    flex: 1;
    min-width: 0;
  }

  .emoji-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
    font-family: monospace;
  }

  .emoji-match {
    font-size: 11px;
    color: var(--color-text-secondary, #999);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
  }

  /* Dark mode adjustments */
  :global([data-theme='dark']) .emoji-dropdown {
    background: #2a2a2a;
    border-color: #444;
  }

  :global([data-theme='dark']) .emoji-item {
    border-bottom-color: #3a3a3a;
  }

  :global([data-theme='dark']) .emoji-item:hover,
  :global([data-theme='dark']) .emoji-item.selected {
    background: #3a3a3a;
  }

  :global([data-theme='dark']) .emoji-name {
    color: #fff;
  }

  :global([data-theme='dark']) .emoji-match {
    color: #999;
  }
</style>
