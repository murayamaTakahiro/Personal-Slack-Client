<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { reactionMappings, recentReactions } from '../services/reactionService';
  import type { ReactionMapping } from '../types/slack';
  
  export let x = 0;
  export let y = 0;
  
  const dispatch = createEventDispatcher();
  
  let searchQuery = '';
  let selectedIndex = 0;
  let pickerElement: HTMLDivElement;
  
  $: mappings = $reactionMappings;
  $: recent = $recentReactions.slice(0, 5);
  
  // Common emojis not in default mappings
  const additionalEmojis = [
    { emoji: 'clap', display: '👏' },
    { emoji: 'fire', display: '🔥' },
    { emoji: 'heart_eyes', display: '😍' },
    { emoji: 'joy', display: '😂' },
    { emoji: 'ok_hand', display: '👌' },
    { emoji: 'pray', display: '🙏' },
    { emoji: 'raised_hands', display: '🙌' },
    { emoji: 'wave', display: '👋' },
    { emoji: 'muscle', display: '💪' },
    { emoji: 'sparkles', display: '✨' },
  ];
  
  $: filteredEmojis = searchQuery 
    ? [...mappings, ...additionalEmojis].filter(e => 
        e.emoji.includes(searchQuery.toLowerCase())
      )
    : [...mappings, ...additionalEmojis];
  
  function selectEmoji(emoji: string) {
    dispatch('select', { emoji });
    close();
  }
  
  function close() {
    dispatch('close');
  }
  
  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        close();
        break;
      case 'Enter':
        if (filteredEmojis[selectedIndex]) {
          selectEmoji(filteredEmojis[selectedIndex].emoji);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(filteredEmojis.length - 1, selectedIndex + 1);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        const num = parseInt(event.key);
        const mapping = mappings.find(m => m.shortcut === num);
        if (mapping) {
          selectEmoji(mapping.emoji);
        }
        break;
    }
  }
  
  function handleClickOutside(event: MouseEvent) {
    if (pickerElement && !pickerElement.contains(event.target as Node)) {
      close();
    }
  }
  
  onMount(() => {
    // Focus search input
    const input = pickerElement?.querySelector('input');
    input?.focus();
    
    // Add click outside listener
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div 
  class="reaction-picker"
  style="left: {x}px; top: {y}px;"
  bind:this={pickerElement}
  on:keydown={handleKeydown}
>
  <div class="picker-header">
    <input
      type="text"
      placeholder="Search emoji..."
      bind:value={searchQuery}
      on:keydown|stopPropagation
    />
  </div>
  
  {#if recent.length > 0 && !searchQuery}
    <div class="picker-section">
      <div class="section-title">Recent</div>
      <div class="emoji-grid">
        {#each recent as emoji}
          <button
            class="emoji-button"
            on:click={() => selectEmoji(emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  
  <div class="picker-section">
    <div class="section-title">
      {searchQuery ? 'Search Results' : 'Quick Reactions (1-9)'}
    </div>
    <div class="emoji-grid">
      {#each filteredEmojis as item, index}
        <button
          class="emoji-button"
          class:selected={index === selectedIndex}
          on:click={() => selectEmoji(item.emoji)}
          title={item.emoji}
        >
          {#if 'shortcut' in item}
            <span class="shortcut">{item.shortcut}</span>
          {/if}
          <span class="emoji">{item.display}</span>
        </button>
      {/each}
    </div>
  </div>
  
  <div class="picker-footer">
    <span class="hint">Use number keys 1-9 for quick selection</span>
  </div>
</div>

<style>
  .reaction-picker {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 280px;
    max-width: 320px;
    max-height: 400px;
    overflow-y: auto;
  }
  
  .picker-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  
  .picker-header input {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .picker-header input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .picker-section {
    padding: 0.75rem;
  }
  
  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
  }
  
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.25rem;
  }
  
  .emoji-button {
    position: relative;
    padding: 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .emoji-button:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }
  
  .emoji-button.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
  }
  
  .emoji-button .shortcut {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  
  .emoji-button .emoji {
    font-size: 1.25rem;
  }
  
  .picker-footer {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  
  .hint {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
</style>