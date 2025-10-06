<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { ExportOptions } from '../types/export';

  export let visible = false;

  let format: 'tsv' | 'markdown' = 'markdown';
  let attachmentHandling: ExportOptions['attachmentHandling'] = 'data-url';
  let includeReactions = true;
  let includeUserInfo = true;

  const dispatch = createEventDispatcher<{
    export: ExportOptions;
    cancel: void;
  }>();

  let dialogElement: HTMLDivElement;
  let exportButton: HTMLButtonElement;
  let cancelButton: HTMLButtonElement;
  let previousActiveElement: HTMLElement | null = null;

  function handleExport() {
    dispatch('export', {
      format,
      attachmentHandling,
      includeReactions,
      includeUserInfo
    });
  }

  function handleCancel() {
    dispatch('cancel');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!visible) return;

    // Stop all key events from propagating when dialog is open
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      handleExport();
    } else if (event.key === 'Tab') {
      // Trap focus within the dialog
      event.preventDefault();

      // Get all focusable elements within the dialog
      const focusableElements = dialogElement?.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], select, button'
      );

      if (!focusableElements || focusableElements.length === 0) return;

      const focusableArray = Array.from(focusableElements) as HTMLElement[];
      const currentIndex = focusableArray.indexOf(document.activeElement as HTMLElement);

      if (event.shiftKey) {
        // Shift+Tab: move focus backwards
        const prevIndex = currentIndex <= 0 ? focusableArray.length - 1 : currentIndex - 1;
        focusableArray[prevIndex]?.focus();
      } else {
        // Tab: move focus forwards
        const nextIndex = currentIndex >= focusableArray.length - 1 ? 0 : currentIndex + 1;
        focusableArray[nextIndex]?.focus();
      }
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  // Focus management
  async function setupFocus() {
    if (visible) {
      previousActiveElement = document.activeElement as HTMLElement;
      await tick();
      exportButton?.focus();
    } else if (previousActiveElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  }

  $: if (visible !== undefined) {
    setupFocus();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown, true);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown, true);
  });
</script>

{#if visible}
  <div
    class="export-backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="export-dialog-title"
  >
    <div
      bind:this={dialogElement}
      class="export-dialog"
      transition:scale={{ duration: 200, start: 0.95 }}
      on:click|stopPropagation
      tabindex="-1"
    >
      <div class="dialog-header">
        <h2 id="export-dialog-title">Export Thread</h2>
        <p class="dialog-subtitle">Choose export options for this thread</p>
      </div>

      <div class="dialog-body">
        <div class="option-group">
          <label class="option-label">Format</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" bind:group={format} value="markdown" />
              <div class="radio-content">
                <div class="radio-title">Markdown</div>
                <div class="radio-description">Readable format, ideal for documentation</div>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" bind:group={format} value="tsv" />
              <div class="radio-content">
                <div class="radio-title">TSV</div>
                <div class="radio-description">Tab-separated values for data processing</div>
              </div>
            </label>
          </div>
        </div>

        <div class="option-group">
          <label class="option-label">Attachments</label>
          <select bind:value={attachmentHandling} class="select-input">
            <option value="data-url">Embed file content (recommended for LLM)</option>
            <option value="permalink-only">Slack permalinks</option>
            <option value="download">Download files locally</option>
            <option value="authenticated-url">Authenticated URLs (experimental)</option>
          </select>
          <p class="option-help">
            {#if attachmentHandling === 'data-url'}
              Embed files as data URLs - ideal for sharing with LLMs (images, PDFs, text files)
            {:else if attachmentHandling === 'permalink-only'}
              Use permanent Slack links (requires Slack login to view)
            {:else if attachmentHandling === 'download'}
              Download files to your computer for offline access
            {:else}
              Experimental: May not work for all file types
            {/if}
          </p>
        </div>

        <div class="option-group">
          <label class="checkbox-option">
            <input type="checkbox" bind:checked={includeReactions} />
            <div class="checkbox-content">
              <div class="checkbox-title">Include reactions</div>
              <div class="checkbox-description">Export emoji reactions with user lists</div>
            </div>
          </label>
        </div>

        <div class="option-group">
          <label class="checkbox-option">
            <input type="checkbox" bind:checked={includeUserInfo} />
            <div class="checkbox-content">
              <div class="checkbox-title">Include user information</div>
              <div class="checkbox-description">Export detailed user metadata</div>
            </div>
          </label>
        </div>
      </div>

      <div class="dialog-footer">
        <button bind:this={cancelButton} class="btn-cancel" on:click={handleCancel} type="button">
          Cancel
        </button>
        <button bind:this={exportButton} class="btn-export" on:click={handleExport} type="button">
          Export
        </button>
      </div>

      <div class="dialog-hint">
        Press <kbd>Ctrl+Enter</kbd> to export, <kbd>Esc</kbd> to cancel
      </div>
    </div>
  </div>
{/if}

<style>
  .export-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .export-dialog {
    background: var(--bg-primary);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    max-width: 500px;
    width: 90%;
    overflow: hidden;
  }

  .dialog-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .dialog-header h2 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dialog-subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .dialog-body {
    padding: 1.5rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .option-group {
    margin-bottom: 1.5rem;
  }

  .option-group:last-child {
    margin-bottom: 0;
  }

  .option-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .radio-option {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .radio-option:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
  }

  .radio-option input[type='radio'] {
    margin: 0.25rem 0.75rem 0 0;
    flex-shrink: 0;
  }

  .radio-option input[type='radio']:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .radio-content {
    flex: 1;
  }

  .radio-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .radio-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .select-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .select-input:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-color: var(--primary);
  }

  .option-help {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .checkbox-option {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .checkbox-option:hover {
    background: var(--bg-hover);
  }

  .checkbox-option input[type='checkbox'] {
    margin: 0.25rem 0.75rem 0 0;
    flex-shrink: 0;
  }

  .checkbox-option input[type='checkbox']:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .checkbox-content {
    flex: 1;
  }

  .checkbox-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .checkbox-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .dialog-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  button:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .btn-cancel:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-export {
    background: var(--primary);
    color: white;
    border: none;
  }

  .btn-export:hover {
    background: var(--primary-hover);
  }

  .dialog-hint {
    padding: 0.75rem 1.5rem;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .dialog-hint kbd {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  @media (max-width: 640px) {
    .export-dialog {
      width: 95%;
    }
  }
</style>
