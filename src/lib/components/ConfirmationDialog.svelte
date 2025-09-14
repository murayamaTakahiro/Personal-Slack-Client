<script lang="ts">
  import { confirmationStore } from '../stores/confirmation';
  import { fade, scale } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';

  $: state = $confirmationStore;

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
    } else if (event.key === 'Enter') {
      event.preventDefault();
      handleConfirm();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    // Only close if clicking the backdrop itself, not its children
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if state.isOpen && state.options}
  <div
    class="confirmation-backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 200 }}
  >
    <div
      class="confirmation-dialog"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <div class="dialog-header">
        <h3>{state.options.title}</h3>
      </div>

      <div class="dialog-body">
        <p>{state.options.message}</p>
      </div>

      <div class="dialog-footer">
        <button
          class="btn-cancel"
          on:click={handleCancel}
        >
          {state.options.cancelText}
        </button>
        <button
          class="btn-confirm {state.options.dangerous ? 'dangerous' : ''}"
          on:click={handleConfirm}
          autofocus
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