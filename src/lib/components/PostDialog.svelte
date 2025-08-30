<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { postToChannel, postThreadReply } from '../api/slack';
  import MentionTextarea from './MentionTextarea.svelte';
  import { mentionService } from '../services/mentionService';
  import { userService } from '../services/userService';
  import type { SlackUser } from '../types/slack';
  
  export let mode: 'channel' | 'thread';
  export let channelId: string;
  export let channelName: string;
  export let threadTs: string = '';
  export let messagePreview: string = '';
  
  const dispatch = createEventDispatcher();
  
  let text = '';
  let posting = false;
  let error: string | null = null;
  let mentionTextarea: MentionTextarea;
  let userMap: Map<string, SlackUser> = new Map();
  
  // Reset state and focus when component mounts (dialog opens)
  onMount(async () => {
    text = '';
    error = null;
    posting = false;
    
    // Load users for mention conversion
    const users = await userService.getAllUsers();
    users.forEach(user => {
      userMap.set(user.id, user);
    });
    
    // Focus the textarea after a tick
    tick().then(() => {
      if (mentionTextarea) {
        mentionTextarea.focus();
        mentionTextarea.select();
      }
    });
  });
  
  async function handlePost() {
    if (!text.trim()) return;
    
    posting = true;
    error = null;
    
    try {
      // Convert mentions to Slack format before posting
      const formattedText = mentionService.convertToSlackFormat(text, userMap);
      
      if (mode === 'channel') {
        await postToChannel(channelId, formattedText);
      } else {
        await postThreadReply(channelId, threadTs, formattedText);
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
  
  function handleKeydown(event: CustomEvent) {
    // The event from MentionTextarea dispatches the KeyboardEvent directly
    const keyEvent = event.detail as KeyboardEvent;
    if (keyEvent.key === 'Escape') {
      handleCancel();
    } else if (keyEvent.ctrlKey && keyEvent.key === 'Enter') {
      handlePost();
    }
  }
  
  function handleInput(event: CustomEvent<{ value: string }>) {
    text = event.detail.value;
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
      <MentionTextarea
        bind:this={mentionTextarea}
        value={text}
        placeholder="Type your message... (Use @ to mention users)"
        disabled={posting}
        on:input={handleInput}
        on:keydown={handleKeydown}
      />
      
      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>
    
    <div class="dialog-footer">
      <span class="hint">Ctrl+Enter to send • Escape to cancel • @ to mention</span>
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
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 600px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15), 0 4px 6px rgba(0, 0, 0, 0.1);
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
    background: var(--color-background, #ffffff);
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
  
  :global([data-theme='dark']) .post-dialog {
    background: #2a2a2a;
  }
  
  :global([data-theme='dark']) .dialog-body {
    background: #2a2a2a;
  }
</style>