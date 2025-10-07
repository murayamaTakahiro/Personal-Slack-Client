<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { mentionService } from '../services/mentionService';
  import type { MentionContext } from '../services/mentionService';
  import type { SlackUser } from '../types/slack';
  import type { EmojiSearchResult } from '../services/emojiSearchService';
  import MentionAutocomplete from './MentionAutocomplete.svelte';
  import EmojiAutocomplete from './EmojiAutocomplete.svelte';

  export let value: string = '';
  export let placeholder: string = '';
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();

  let textarea: HTMLTextAreaElement;
  let showAutocomplete = false;
  let mentionContext: MentionContext | null = null;
  let showEmojiAutocomplete = false;
  let emojiContext: { triggerPosition: number; searchQuery: string; cursorCoordinates: { x: number; y: number } } | null = null;
  
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;

    const cursorPos = textarea.selectionStart;

    // Check for mention trigger first (higher priority)
    mentionContext = mentionService.detectMentionTrigger(value, cursorPos);

    if (mentionContext && textarea) {
      // Calculate cursor coordinates for dropdown positioning
      const coords = mentionService.getCursorCoordinates(textarea);
      mentionContext.cursorCoordinates = coords;
      showAutocomplete = true;
      showEmojiAutocomplete = false; // Close emoji autocomplete
    } else {
      showAutocomplete = false;

      // Check for emoji trigger only if mention autocomplete is not active
      emojiContext = detectEmojiTrigger(value, cursorPos);

      if (emojiContext && textarea) {
        const coords = mentionService.getCursorCoordinates(textarea);
        emojiContext.cursorCoordinates = coords;
        showEmojiAutocomplete = true;
      } else {
        showEmojiAutocomplete = false;
      }
    }

    dispatch('input', { value });
  }

  function detectEmojiTrigger(text: string, cursorPos: number): { triggerPosition: number; searchQuery: string; cursorCoordinates: { x: number; y: number } } | null {
    if (cursorPos === 0) return null;

    // Look backwards from cursor to find : emoji trigger
    let searchStart = cursorPos - 1;

    // Search backwards for :
    while (searchStart >= 0) {
      const char = text[searchStart];

      // Found : character
      if (char === ':') {
        // Check if it's at the beginning or preceded by whitespace
        const prevChar = searchStart > 0 ? text[searchStart - 1] : null;
        const isValidPosition = prevChar === null || prevChar === ' ' || prevChar === '\n' || prevChar === '\r' || prevChar === '\t';

        if (isValidPosition) {
          const searchQuery = text.substring(searchStart + 1, cursorPos);

          // Only trigger if search query is at least 1 character
          if (searchQuery.length >= 1) {
            return {
              triggerPosition: searchStart,
              searchQuery,
              cursorCoordinates: { x: 0, y: 0 } // Will be calculated later
            };
          }
        }
        // : is not at a valid position or query is too short
        return null;
      }

      // Check if we're still in a valid emoji context
      // Allow alphanumeric, dash, and underscore
      const isValidChar = /^[\w-]$/.test(char);

      // If we hit whitespace or invalid char, stop searching
      if (!isValidChar && char !== ':') {
        return null;
      }

      searchStart--;
    }

    return null;
  }
  
  function handleMentionSelect(event: CustomEvent<{ user: SlackUser }>) {
    const { user } = event.detail;

    if (!mentionContext) return;

    // Record this mention in history
    mentionService.recordMention(user.id);

    // Insert the mention
    const before = value.substring(0, mentionContext.triggerPosition);
    const after = value.substring(textarea.selectionStart);
    const mentionText = `@${user.displayName || user.realName || user.name}`;

    value = `${before}${mentionText} ${after}`;
    showAutocomplete = false;
    mentionContext = null;

    // Set cursor position after the mention
    setTimeout(() => {
      if (textarea) {
        const newCursorPos = before.length + mentionText.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      }
    }, 0);

    dispatch('input', { value });
    dispatch('mentionSelect', { user });
  }

  function handleEmojiSelect(event: CustomEvent<{ emoji: EmojiSearchResult }>) {
    const { emoji } = event.detail;

    if (!emojiContext) return;

    // Insert the emoji
    const before = value.substring(0, emojiContext.triggerPosition);
    const after = value.substring(textarea.selectionStart);
    const emojiText = `:${emoji.name}:`;

    value = `${before}${emojiText} ${after}`;
    showEmojiAutocomplete = false;
    emojiContext = null;

    // Set cursor position after the emoji
    setTimeout(() => {
      if (textarea) {
        const newCursorPos = before.length + emojiText.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      }
    }, 0);

    dispatch('input', { value });
    dispatch('emojiSelect', { emoji });
  }
  
  function handleKeydown(event: KeyboardEvent) {
    // Handle special keys when mention autocomplete is open
    if (showAutocomplete) {
      // These keys are handled by the autocomplete component
      if (['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(event.key)) {
        // Autocomplete will handle these keys
        if (event.key === 'Escape') {
          // Only stop propagation if autocomplete is open
          // This allows the focus trap to handle Escape when autocomplete is closed
          event.stopPropagation();
          showAutocomplete = false;
          mentionContext = null;
          return; // Don't dispatch to parent
        }
        // Don't pass arrow keys, Tab, or Enter to parent when autocomplete is open
        return;
      }
    }

    // Handle special keys when emoji autocomplete is open
    if (showEmojiAutocomplete) {
      // These keys are handled by the emoji autocomplete component
      if (['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(event.key)) {
        // Autocomplete will handle these keys
        if (event.key === 'Escape') {
          event.stopPropagation();
          showEmojiAutocomplete = false;
          emojiContext = null;
          return; // Don't dispatch to parent
        }
        // Don't pass arrow keys, Tab, or Enter to parent when autocomplete is open
        return;
      }
    }

    // Handle Enter key separately to prevent bubbling to SearchBar
    if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
      // Regular Enter key press - just allow default behavior (new line)
      // Stop both propagation methods to ensure it doesn't bubble up
      event.stopPropagation();
      event.stopImmediatePropagation();
      // Don't dispatch to parent - let the textarea handle it naturally
      return;
    }

    // Log Ctrl+Enter for debugging
    if (event.ctrlKey && event.key === 'Enter') {
      console.log('[MentionTextarea] Ctrl+Enter detected, dispatching to parent');
    }

    // Pass other keyboard events to parent (including Ctrl+Enter)
    dispatch('keydown', event);
  }
  
  function handleAutocompleteClose() {
    showAutocomplete = false;
    mentionContext = null;
    textarea?.focus();
  }

  function handleEmojiAutocompleteClose() {
    showEmojiAutocomplete = false;
    emojiContext = null;
    textarea?.focus();
  }
  
  // Expose focus method for parent components
  export function focus() {
    if (textarea) {
      textarea.focus();
      // Set cursor to the beginning to ensure it's visible
      textarea.setSelectionRange(0, 0);
    }
  }

  export function select() {
    if (textarea) {
      textarea.select();
      textarea.focus();
    }
  }

  // Focus and set cursor to end of text
  export function focusAtEnd() {
    if (textarea) {
      textarea.focus();
      // Set cursor to the end of the text
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }

  // Expose textarea element for focus trap
  export function getTextarea() {
    return textarea;
  }
</script>

<div class="mention-textarea-container">
  <textarea
    bind:this={textarea}
    {value}
    {placeholder}
    {disabled}
    on:input={handleInput}
    on:keydown={handleKeydown}
    on:blur
    on:focus
  />

  {#if showAutocomplete && mentionContext}
    <MentionAutocomplete
      searchQuery={mentionContext.searchQuery}
      position={mentionContext.cursorCoordinates}
      on:select={handleMentionSelect}
      on:close={handleAutocompleteClose}
    />
  {/if}

  {#if showEmojiAutocomplete && emojiContext}
    <EmojiAutocomplete
      searchQuery={emojiContext.searchQuery}
      position={emojiContext.cursorCoordinates}
      on:select={handleEmojiSelect}
      on:close={handleEmojiAutocompleteClose}
    />
  {/if}
</div>

<style>
  .mention-textarea-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
  
  textarea {
    width: 100%;
    height: 100%;
    min-height: 200px;
    padding: 12px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    background: var(--bg-primary, #ffffff);
    color: var(--text-primary, #000000);
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
    transition: border-color 0.2s, background-color 0.2s;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  
  textarea:focus {
    outline: none;
    border-color: var(--color-primary, #4a90e2);
    background: var(--bg-primary, #ffffff);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 2px rgba(74, 144, 226, 0.1);
  }
  
  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  /* Dark mode specific adjustments */
  :global([data-theme='dark']) textarea {
    background: #2a2a2a !important;
    color: #ffffff !important;
    border-color: #444;
  }
  
  /* Light mode explicit styles */
  :global([data-theme='light']) textarea {
    background: #ffffff !important;
    color: #000000 !important;
    border-color: #ddd;
  }
</style>