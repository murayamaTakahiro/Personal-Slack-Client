<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { postToChannel, postThreadReply } from '../api/slack';
  
  export let mode: 'channel' | 'thread';
  export let channelId: string;
  export let channelName: string;
  export let threadTs: string = '';
  export let messagePreview: string = '';
  
  const dispatch = createEventDispatcher();
  
  let text = '';
  let posting = false;
  let error: string | null = null;
  
  // Reset state when component mounts (dialog opens)
  onMount(() => {
    text = '';
    error = null;
    posting = false;
  });
  
  async function handlePost() {
    if (!text.trim()) return;
    
    posting = true;
    error = null;
    
    try {
      if (mode === 'channel') {
        await postToChannel(channelId, text);
      } else {
        await postThreadReply(channelId, threadTs, text);
      }
      
      text = ''; // Reset text after successful post
      dispatch('success');
      handleCancel();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to post message';
    } finally {
      posting = false;
    }
  }
  
  function handleCancel() {
    text = ''; // Reset text when canceling
    error = null; // Clear any errors
    dispatch('cancel');
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.ctrlKey && event.key === 'Enter') {
      handlePost();
    }
  }
</script>

<div class="post-dialog-overlay" on:click={handleCancel}>
  <div class="post-dialog" on:click|stopPropagation>
    <div class="dialog-header">
      <h3>
        {mode === 'channel' ? 'Post to Channel' : 'Reply to Thread'}
      </h3>
      <button class="close-btn" on:click={handleCancel}>×</button>
    </div>
    
    <div class="dialog-info">
      <span class="channel-badge">#{channelName}</span>
      {#if mode === 'thread' && messagePreview}
        <div class="thread-preview">
          Replying to: {messagePreview}
        </div>
      {/if}
    </div>
    
    <div class="dialog-body">
      <textarea
        bind:value={text}
        on:keydown={handleKeydown}
        placeholder="Type your message..."
        disabled={posting}
        autofocus
      />
      
      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>
    
    <div class="dialog-footer">
      <span class="hint">Ctrl+Enter to send • Escape to cancel</span>
      <div class="buttons">
        <button 
          class="btn-cancel" 
          on:click={handleCancel}
          disabled={posting}
        >
          Cancel
        </button>
        <button 
          class="btn-send" 
          on:click={handlePost}
          disabled={posting || !text.trim()}
        >
          {posting ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .post-dialog-overlay {
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

  .post-dialog {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 600px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--color-text-secondary);
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .close-btn:hover {
    background: var(--color-hover);
  }

  .dialog-info {
    padding: 12px 20px;
    background: var(--color-background-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .channel-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--color-primary);
    color: white;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
  }

  .thread-preview {
    margin-top: 8px;
    padding: 8px;
    background: var(--color-background);
    border-left: 3px solid var(--color-border);
    font-size: 13px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-body {
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  textarea {
    flex: 1;
    min-height: 200px;
    padding: 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-input-background);
    color: var(--color-text);
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
    transition: border-color 0.2s;
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    margin-top: 12px;
    padding: 8px 12px;
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 4px;
    color: #c00;
    font-size: 13px;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-top: 1px solid var(--color-border);
    background: var(--color-background-secondary);
  }

  .hint {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--color-hover);
  }

  .btn-send {
    background: var(--color-primary);
    border: none;
    color: white;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Dark mode specific adjustments */
  :global([data-theme='dark']) .error-message {
    background: #400;
    border-color: #600;
    color: #faa;
  }
</style>