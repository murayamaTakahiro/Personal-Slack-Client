<script lang="ts">
  import { toastStore, removeToast, type ToastMessage } from '../stores/toast';
  import { onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

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
      in:fly="{{ x: 100, duration: 300, easing: cubicOut }}"
      out:fade="{{ duration: 200 }}"
    >
      <div class="toast-icon-wrapper">
        <div class="toast-icon">
          {getIconForType(toast.type)}
        </div>
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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="toast-progress" style="animation-duration: {toast.duration}ms;"></div>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 10000;
    max-width: 420px;
    pointer-events: none;
  }

  .toast {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 16px;
    padding: 14px 16px;
    border-radius: 12px;
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.1),
      0 8px 10px -6px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    pointer-events: auto;
    font-size: 14px;
    line-height: 1.5;
    backdrop-filter: blur(10px);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .toast-success {
    background: linear-gradient(135deg,
      rgba(16, 185, 129, 0.95) 0%,
      rgba(5, 150, 105, 0.95) 100%);
    color: white;
  }

  .toast-error {
    background: linear-gradient(135deg,
      rgba(239, 68, 68, 0.95) 0%,
      rgba(220, 38, 38, 0.95) 100%);
    color: white;
  }

  .toast-warning {
    background: linear-gradient(135deg,
      rgba(251, 146, 60, 0.95) 0%,
      rgba(245, 158, 11, 0.95) 100%);
    color: white;
  }

  .toast-info {
    background: linear-gradient(135deg,
      rgba(59, 130, 246, 0.95) 0%,
      rgba(37, 99, 235, 0.95) 100%);
    color: white;
  }

  .toast-icon-wrapper {
    position: relative;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    font-size: 14px;
    font-weight: bold;
    backdrop-filter: blur(5px);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .toast-content {
    flex: 1;
    min-width: 0;
    padding-top: 3px;
  }

  .toast-title {
    font-weight: 600;
    margin-bottom: 2px;
    font-size: 14px;
    letter-spacing: 0.01em;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .toast-message {
    font-size: 13px;
    opacity: 0.9;
    word-wrap: break-word;
    line-height: 1.4;
  }

  .toast-close {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    cursor: pointer;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    padding: 0;
    margin: 2px 0 0 0;
    color: white;
    opacity: 0.7;
    flex-shrink: 0;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-close:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  .toast-close:active {
    transform: scale(0.95);
  }

  .toast-close:focus {
    opacity: 1;
    outline: 2px solid rgba(255, 255, 255, 0.5);
    outline-offset: -1px;
  }

  .toast-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 0 0 12px 12px;
    animation: shrink linear forwards;
    transform-origin: left;
  }

  @keyframes shrink {
    from {
      width: 100%;
    }
    to {
      width: 0;
    }
  }

  /* Dark theme adjustments */
  :global(body.dark) .toast {
    box-shadow:
      0 10px 40px -10px rgba(0, 0, 0, 0.4),
      0 8px 16px -8px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global(body.dark) .toast-success {
    background: linear-gradient(135deg,
      rgba(16, 185, 129, 0.9) 0%,
      rgba(5, 150, 105, 0.9) 100%);
  }

  :global(body.dark) .toast-error {
    background: linear-gradient(135deg,
      rgba(239, 68, 68, 0.9) 0%,
      rgba(220, 38, 38, 0.9) 100%);
  }

  :global(body.dark) .toast-warning {
    background: linear-gradient(135deg,
      rgba(251, 146, 60, 0.9) 0%,
      rgba(245, 158, 11, 0.9) 100%);
  }

  :global(body.dark) .toast-info {
    background: linear-gradient(135deg,
      rgba(59, 130, 246, 0.9) 0%,
      rgba(37, 99, 235, 0.9) 100%);
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .toast-container {
      top: 16px;
      right: 16px;
      left: 16px;
      max-width: none;
    }
  }
</style>