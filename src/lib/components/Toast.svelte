<script lang="ts">
  import { toastStore, removeToast, type ToastMessage } from '../stores/toast';
  import { onDestroy } from 'svelte';

  $: messages = $toastStore.messages;

  function handleClose(id: string) {
    removeToast(id);
  }

  function getIconForType(type: ToastMessage['type']): string {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return 'ℹ';
    }
  }
</script>

<div class="toast-container" role="alert" aria-live="polite">
  {#each messages as toast (toast.id)}
    <div 
      class="toast toast-{toast.type}"
      role="alert"
      aria-live="assertive"
    >
      <div class="toast-icon">
        {getIconForType(toast.type)}
      </div>
      <div class="toast-content">
        <div class="toast-title">{toast.title}</div>
        {#if toast.message}
          <div class="toast-message">{toast.message}</div>
        {/if}
      </div>
      <button 
        class="toast-close" 
        on:click={() => handleClose(toast.id)}
        aria-label="Close notification"
        type="button"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
    font-size: 14px;
    line-height: 1.4;
  }

  .toast-success {
    background: #f0f9ff;
    border: 1px solid #0ea5e9;
    color: #0c4a6e;
  }

  .toast-error {
    background: #fef2f2;
    border: 1px solid #ef4444;
    color: #7f1d1d;
  }

  .toast-warning {
    background: #fffbeb;
    border: 1px solid #f59e0b;
    color: #78350f;
  }

  .toast-info {
    background: #f8fafc;
    border: 1px solid #64748b;
    color: #334155;
  }

  .toast-icon {
    font-size: 16px;
    font-weight: bold;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .toast-content {
    flex: 1;
    min-width: 0;
  }

  .toast-title {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .toast-message {
    font-size: 13px;
    opacity: 0.8;
    word-wrap: break-word;
  }

  .toast-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    padding: 0;
    margin: 0;
    color: inherit;
    opacity: 0.6;
    flex-shrink: 0;
    transition: opacity 0.2s;
  }

  .toast-close:hover {
    opacity: 1;
  }

  .toast-close:focus {
    opacity: 1;
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  /* Dark theme support */
  :global(body.dark) .toast-success {
    background: #0f172a;
    border-color: #0ea5e9;
    color: #7dd3fc;
  }

  :global(body.dark) .toast-error {
    background: #0f172a;
    border-color: #ef4444;
    color: #fca5a5;
  }

  :global(body.dark) .toast-warning {
    background: #0f172a;
    border-color: #f59e0b;
    color: #fcd34d;
  }

  :global(body.dark) .toast-info {
    background: #0f172a;
    border-color: #64748b;
    color: #cbd5e1;
  }
</style>