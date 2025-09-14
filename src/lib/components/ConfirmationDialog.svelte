<script lang="ts">
  import { confirmationStore } from '../stores/confirmation';
  import { fade, scale } from 'svelte/transition';
  import { onMount, onDestroy, tick } from 'svelte';

  $: state = $confirmationStore;

  let dialogElement: HTMLDivElement;
  let confirmButton: HTMLButtonElement;
  let cancelButton: HTMLButtonElement;
  let previousActiveElement: HTMLElement | null = null;

  function handleConfirm() {
    confirmationStore.respond(true);
  }

  function handleCancel() {
    confirmationStore.respond(false);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!state.isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    } else if (event.key === 'Enter' && document.activeElement !== cancelButton) {
      event.preventDefault();
      handleConfirm();
    } else if (event.key === 'Tab') {
      // Trap focus within the dialog
      event.preventDefault();

      if (event.shiftKey) {
        // Shift+Tab: move focus backwards
        if (document.activeElement === confirmButton || document.activeElement === dialogElement) {
          cancelButton?.focus();
        } else {
          confirmButton?.focus();
        }
      } else {
        // Tab: move focus forwards
        if (document.activeElement === cancelButton || document.activeElement === dialogElement) {
          confirmButton?.focus();
        } else {
          cancelButton?.focus();
        }
      }
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    // Only close if clicking the backdrop itself, not its children
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  // Focus management
  async function setupFocus() {
    if (state.isOpen) {
      // Store the currently focused element
      previousActiveElement = document.activeElement as HTMLElement;

      // Wait for the DOM to update
      await tick();

      // Focus the confirm button by default
      confirmButton?.focus();
    } else if (previousActiveElement) {
      // Restore focus when dialog closes
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  }

  // Watch for dialog state changes
  $: if (state.isOpen !== undefined) {
    setupFocus();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown, true); // Use capture phase
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown, true);
  });
</script>

{#if state.isOpen && state.options}
  <div
    class="confirmation-backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
  >
    <div
      bind:this={dialogElement}
      class="confirmation-dialog"
      transition:scale={{ duration: 200, start: 0.95 }}
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 id="dialog-title">{state.options.title}</h3>
      </div>

      <div class="dialog-body">
        <p>{state.options.message}</p>
      </div>

      <div class="dialog-footer">
        <button
          bind:this={cancelButton}
          class="btn-cancel"
          on:click={handleCancel}
          type="button"
        >
          {state.options.cancelText}
        </button>
        <button
          bind:this={confirmButton}
          class="btn-confirm {state.options.dangerous ? 'dangerous' : ''}"
          on:click={handleConfirm}
          type="button"
        >
          {state.options.confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirmation-backdrop {
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

  .confirmation-dialog {
    background: var(--bg-primary);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    width: 90%;
    overflow: hidden;
  }

  .dialog-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dialog-body {
    padding: 1.5rem;
  }

  .dialog-body p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.5;
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

  .btn-cancel {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .btn-cancel:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn-confirm {
    background: var(--primary);
    color: white;
    border: none;
  }

  .btn-confirm:hover {
    background: var(--primary-hover);
  }

  .btn-confirm.dangerous {
    background: var(--danger);
  }

  .btn-confirm.dangerous:hover {
    background: var(--danger-hover);
  }

  @media (max-width: 640px) {
    .confirmation-dialog {
      width: 95%;
    }
  }
</style>