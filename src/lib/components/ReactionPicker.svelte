<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { reactionMappings, recentReactions } from '../services/reactionService';
  import { emojiService } from '../services/emojiService';
  import EmojiImage from './EmojiImage.svelte';
  import type { ReactionMapping } from '../types/slack';
  
  // Remove x and y props - we'll use fixed center positioning
  // export let x = 0;
  // export let y = 0;
  
  const dispatch = createEventDispatcher();
  
  let searchQuery = '';
  let selectedIndex = 0;
  let pickerElement: HTMLDivElement;
  let emojiButtons: HTMLButtonElement[] = [];
  
  // Reset state when component mounts (picker opens)
  onMount(() => {
    console.log('🔍 DEBUG: ReactionPicker mounted');
    searchQuery = '';
    selectedIndex = 0;
    emojiButtons = [];
    
    // Use tick to ensure proper focus management
    tick().then(() => {
      if (pickerElement) {
        pickerElement.focus();
        console.log('🔍 DEBUG: ReactionPicker focused after tick');
      }
    });
  });
  
  $: mappings = $reactionMappings;
  $: recent = $recentReactions.slice(0, 5);
  
  // Common emojis not in default mappings
  // Let's get these from the emoji service to ensure consistency
  const additionalEmojis = [
    { emoji: 'clap', display: emojiService.getEmoji('clap') || '👏' },
    { emoji: 'fire', display: emojiService.getEmoji('fire') || '🔥' },
    { emoji: 'heart_eyes', display: emojiService.getEmoji('heart_eyes') || '😍' },
    { emoji: 'joy', display: emojiService.getEmoji('joy') || '😂' },
    { emoji: 'ok_hand', display: emojiService.getEmoji('ok_hand') || '👌' },
    { emoji: 'pray', display: emojiService.getEmoji('pray') || '🙏' },
    { emoji: 'raised_hands', display: emojiService.getEmoji('raised_hands') || '🙌' },
    { emoji: 'wave', display: emojiService.getEmoji('wave') || '👋' },
    { emoji: 'muscle', display: emojiService.getEmoji('muscle') || '💪' },
    { emoji: 'sparkles', display: emojiService.getEmoji('sparkles') || '✨' },
  ];
  
  // Combine all available emojis for filtering
  $: allEmojis = searchQuery 
    ? [...mappings, ...additionalEmojis].filter(e => 
        e.emoji.includes(searchQuery.toLowerCase())
      )
    : recent.length > 0 
      ? [...recent.map(e => ({ emoji: e, display: e })), ...mappings, ...additionalEmojis]
      : [...mappings, ...additionalEmojis];
  
  $: filteredEmojis = allEmojis;
  
  // Keep selectedIndex within bounds when filtered results change
  $: if (selectedIndex >= filteredEmojis.length) {
    selectedIndex = Math.max(0, filteredEmojis.length - 1);
  }
  
  // Auto-scroll to selected emoji
  $: if (emojiButtons[selectedIndex]) {
    emojiButtons[selectedIndex].scrollIntoView({ 
      block: 'nearest', 
      behavior: 'smooth' 
    });
  }
  
  function selectEmoji(emoji: string) {
    console.log('🔍 DEBUG: ReactionPicker selectEmoji called', { emoji });
    dispatch('select', { emoji });
    close();
  }
  
  function close() {
    console.log('🔍 DEBUG: ReactionPicker close called');
    // Reset all state when closing
    searchQuery = '';
    selectedIndex = 0;
    emojiButtons = [];
    dispatch('close');
  }
  
  function handleKeydown(event: KeyboardEvent) {
    // Don't handle keydown if search input has focus and it's a character key
    if (event.target === pickerElement?.querySelector('input') && 
        !['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        close();
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (filteredEmojis[selectedIndex]) {
          const emoji = 'display' in filteredEmojis[selectedIndex] 
            ? filteredEmojis[selectedIndex].emoji 
            : filteredEmojis[selectedIndex];
          selectEmoji(emoji);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (selectedIndex > 5) {
          selectedIndex -= 6; // Move up one row (6 columns)
        } else {
          selectedIndex = 0; // Stay at top
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (selectedIndex + 6 < filteredEmojis.length) {
          selectedIndex += 6; // Move down one row (6 columns)
        } else {
          selectedIndex = filteredEmojis.length - 1; // Go to last item
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        selectedIndex = Math.max(0, selectedIndex - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
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
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const num = parseInt(event.key);
        const mapping = mappings.find(m => m.shortcut === num);
        if (mapping) {
          selectEmoji(mapping.emoji);
        }
        break;
    }
  }
  
  function handleClickOutside(event: MouseEvent) {
    console.log('🔍 DEBUG: ReactionPicker handleClickOutside', {
      target: event.target,
      pickerElement: !!pickerElement,
      contains: pickerElement?.contains(event.target as Node)
    });
    if (pickerElement && !pickerElement.contains(event.target as Node)) {
      console.log('🔍 DEBUG: Click outside detected, closing picker');
      close();
    }
  }
  
  onMount(() => {
    console.log('🔍 DEBUG: ReactionPicker onMount - setting up event listeners');
    
    // Add click outside listener with a slight delay to avoid immediate triggers
    const timeoutId = setTimeout(() => {
      console.log('🔍 DEBUG: Adding click outside listener');
      document.addEventListener('click', handleClickOutside, true); // Use capture phase
    }, 100); // Increased delay to ensure proper setup
    
    return () => {
      console.log('🔍 DEBUG: ReactionPicker cleanup - removing event listeners');
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  });
</script>

<!-- Add backdrop for better visibility -->
<div class="reaction-picker-backdrop" on:click={close}>
  <div 
    class="reaction-picker"
    bind:this={pickerElement}
    on:keydown={handleKeydown}
    on:click|stopPropagation
    tabindex="-1"
    role="dialog"
    aria-label="Emoji picker"
  >
  <div class="picker-header">
    <input
      type="text"
      placeholder="Search emoji..."
      bind:value={searchQuery}
      on:input={() => selectedIndex = 0}
    />
    <div class="navigation-hint">
      Use ↑↓←→ to navigate, Enter to select, Esc to close
    </div>
  </div>
  
  <div class="picker-body">
    {#if recent.length > 0 && !searchQuery}
      <div class="picker-section">
        <div class="section-title">Recent</div>
        <div class="emoji-grid">
          {#each recent.slice(0, 6) as emoji, index}
            {@const emojiValue = emojiService.getEmoji(emoji)}
            <button
              bind:this={emojiButtons[index]}
              class="emoji-button"
              class:selected={index === selectedIndex}
              on:click={() => selectEmoji(emoji)}
              on:mouseenter={() => selectedIndex = index}
              title={emoji}
              tabindex="-1"
            >
              <span class="emoji">
                {#if emojiValue && emojiValue.startsWith('http')}
                  <EmojiImage emoji={emoji} url={emojiValue} size="medium" />
                {:else if emojiValue}
                  {emojiValue}
                {:else}
                  {emoji}
                {/if}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    
    <div class="picker-section">
      <div class="section-title">
        {searchQuery ? 'Search Results' : 'Quick Reactions'}
      </div>
      <div class="emoji-grid">
        {#each filteredEmojis as item, index}
          {@const startIndex = recent.length > 0 && !searchQuery ? 6 : 0}
          {@const actualIndex = startIndex + index}
          {@const emojiName = 'emoji' in item ? item.emoji : item}
          {@const emojiValue = emojiService.getEmoji(emojiName)}
          <button
            bind:this={emojiButtons[actualIndex]}
            class="emoji-button"
            class:selected={actualIndex === selectedIndex}
            on:click={() => selectEmoji('display' in item ? item.emoji : item)}
            on:mouseenter={() => selectedIndex = actualIndex}
            title={'display' in item ? item.emoji : item}
            tabindex="-1"
          >
            {#if 'shortcut' in item && item.shortcut}
              <span class="shortcut">{item.shortcut}</span>
            {/if}
            <span class="emoji">
              {#if emojiValue && emojiValue.startsWith('http')}
                <EmojiImage emoji={emojiName} url={emojiValue} size="medium" />
              {:else if emojiValue}
                {emojiValue}
              {:else if 'display' in item}
                {item.display}
              {:else}
                {item}
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>
  
  <div class="picker-footer">
    <span class="hint">Press 1-9 for quick reactions</span>
  </div>
  </div>
</div>

<style>
  .reaction-picker-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  .reaction-picker {
    position: relative;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    width: 420px;
    max-height: 500px;
    display: flex;
    flex-direction: column;
    outline: none;
    animation: slideIn 0.2s;
  }
  
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .reaction-picker:focus {
    border-color: var(--primary);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 0 0 2px var(--primary-bg);
  }
  
  .picker-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  
  .picker-header input {
    width: 100%;
    padding: 0.625rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9375rem;
  }
  
  .picker-header input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  
  .navigation-hint {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
  }
  
  .picker-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }
  
  .picker-section {
    padding: 0.5rem 1rem;
  }
  
  .picker-section + .picker-section {
    border-top: 1px solid var(--border);
    margin-top: 0.5rem;
    padding-top: 1rem;
  }
  
  .section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.375rem;
  }
  
  .emoji-button {
    position: relative;
    width: 56px;
    height: 56px;
    padding: 0;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
  }
  
  .emoji-button:hover {
    background: var(--bg-hover);
    border-color: var(--border);
    transform: scale(1.05);
  }
  
  .emoji-button.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .emoji-button:active {
    transform: scale(0.95);
  }
  
  .emoji-button .shortcut {
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--primary);
    background: var(--bg-primary);
    padding: 1px 3px;
    border-radius: 3px;
    line-height: 1;
  }
  
  .emoji-button.selected .shortcut {
    background: var(--primary);
    color: white;
  }
  
  .emoji-button .emoji {
    font-size: 1.75rem;
    line-height: 1;
  }
  
  .picker-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    border-radius: 0 0 12px 12px;
    flex-shrink: 0;
  }
  
  .hint {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    display: block;
    text-align: center;
  }
  
  /* Scrollbar styling */
  .picker-body::-webkit-scrollbar {
    width: 8px;
  }
  
  .picker-body::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 4px;
  }
  
  .picker-body::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .picker-body::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
</style>