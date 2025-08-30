<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { mentionService } from '../services/mentionService';
  import type { MentionContext } from '../services/mentionService';
  import type { SlackUser } from '../types/slack';
  import MentionAutocomplete from './MentionAutocomplete.svelte';
  
  export let value: string = '';
  export let placeholder: string = '';
  export let disabled: boolean = false;
  
  const dispatch = createEventDispatcher();
  
  let textarea: HTMLTextAreaElement;
  let showAutocomplete = false;
  let mentionContext: MentionContext | null = null;
  
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;
    
    const cursorPos = textarea.selectionStart;
    mentionContext = mentionService.detectMentionTrigger(value, cursorPos);
    
    // Debug log
    console.log('Input detected:', { value, cursorPos, mentionContext });
    
    if (mentionContext && textarea) {
      // Calculate cursor coordinates for dropdown positioning
      const coords = mentionService.getCursorCoordinates(textarea);
      mentionContext.cursorCoordinates = coords;
      showAutocomplete = true;
      console.log('Showing autocomplete', { coords, searchQuery: mentionContext.searchQuery });
    } else {
      showAutocomplete = false;
    }
    
    dispatch('input', { value });
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
  
  function handleKeydown(event: KeyboardEvent) {
    // Don't propagate Escape when autocomplete is open
    if (showAutocomplete && event.key === 'Escape') {
      event.stopPropagation();
      showAutocomplete = false;
      mentionContext = null;
      return;
    }
    
    // Pass keyboard events to parent (dispatch the event itself, not wrapped)
    dispatch('keydown', event);
  }
  
  function handleAutocompleteClose() {
    showAutocomplete = false;
    mentionContext = null;
    textarea?.focus();
  }
  
  // Expose focus method for parent components
  export function focus() {
    textarea?.focus();
  }
  
  export function select() {
    textarea?.select();
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
    <!-- Debug: Autocomplete should be visible -->
    {console.log('Rendering MentionAutocomplete with:', { 
      showAutocomplete, 
      mentionContext,
      searchQuery: mentionContext.searchQuery,
      position: mentionContext.cursorCoordinates 
    })}
    <MentionAutocomplete
      searchQuery={mentionContext.searchQuery}
      position={mentionContext.cursorCoordinates}
      on:select={handleMentionSelect}
      on:close={handleAutocompleteClose}
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