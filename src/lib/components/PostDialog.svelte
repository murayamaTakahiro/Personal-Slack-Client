<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { postToChannel, postThreadReply } from '../api/slack';
  import MentionTextarea from './MentionTextarea.svelte';
  import { mentionService } from '../services/mentionService';
  import { userService } from '../services/userService';
  import type { SlackUser } from '../types/slack';
  import { decodeSlackText } from '../utils/htmlEntities';
  import FileUploadManager from './upload/FileUploadManager.svelte';
  import { getClipboardImage } from '../api/upload';
  import { open } from '@tauri-apps/plugin-dialog';
  
  export let mode: 'channel' | 'thread';
  export let channelId: string;
  export let channelName: string;
  export let threadTs: string = '';
  export let messagePreview: string = '';
  export let continuousMode: boolean = false; // New property for continuous posting mode

  const dispatch = createEventDispatcher();
  
  let text = '';
  let posting = false;
  let error: string | null = null;
  let mentionTextarea: MentionTextarea;
  let userMap: Map<string, SlackUser> = new Map();
  let alsoSendToChannel = false; // For thread replies, option to also post to channel
  let postedCount = 0; // Track number of messages posted in continuous mode
  let showSuccessMessage = false; // Show success feedback
  let fileUploadManager: FileUploadManager;
  let isDragging = false; // For drag and drop visual feedback
  
  // Reset state and focus when component mounts (dialog opens)
  onMount(async () => {
    text = '';
    error = null;
    posting = false;
    alsoSendToChannel = false; // Reset checkbox state
    postedCount = 0; // Reset posted count
    showSuccessMessage = false; // Reset success message
    
    // Load users for mention conversion
    const users = await userService.getAllUsers();
    users.forEach(user => {
      userMap.set(user.id, user);
    });
    
    // Focus the textarea after DOM updates
    setTimeout(() => {
      if (mentionTextarea) {
        mentionTextarea.focus();
        mentionTextarea.select();
      }
    }, 50);
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
        // Pass the alsoSendToChannel flag to the API
        await postThreadReply(channelId, threadTs, formattedText, alsoSendToChannel);
      }

      text = ''; // Reset text after successful post
      postedCount++; // Increment counter

      if (continuousMode) {
        // In continuous mode, don't close the dialog
        showSuccessMessage = true;
        // Hide success message after 2 seconds
        setTimeout(() => {
          showSuccessMessage = false;
        }, 2000);

        // Refocus the textarea for the next message
        // Use setTimeout to ensure DOM updates are complete
        setTimeout(() => {
          if (mentionTextarea) {
            mentionTextarea.focus();
            // Also trigger a select to ensure the cursor is visible
            mentionTextarea.select();
          }
        }, 50);
      } else {
        // Normal mode - close dialog after posting
        dispatch('success');
        handleCancel();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to post message';
    } finally {
      posting = false;
    }
  }
  
  function handleCancel() {
    text = ''; // Reset text when canceling
    error = null; // Clear any errors
    postedCount = 0; // Reset posted count
    showSuccessMessage = false; // Hide any success messages
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

  // File upload handlers
  async function handlePaste(event: ClipboardEvent) {
    // Check for image data in clipboard
    const clipboardImage = await getClipboardImage();
    if (clipboardImage && fileUploadManager) {
      await fileUploadManager.addClipboardData(clipboardImage.data, clipboardImage.filename);
    }
  }

  async function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;

    if (!event.dataTransfer?.files || !fileUploadManager) {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    await fileUploadManager.addFiles(files);
  }

  async function handleSelectFiles() {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
      });

      if (selected && fileUploadManager) {
        // Convert file paths to File objects
        // For now, we'll need to handle this differently since we get paths, not File objects
        // We'll upload directly using the paths
        if (Array.isArray(selected)) {
          for (const path of selected) {
            // We'll need to implement direct path upload
            console.log('Selected file path:', path);
          }
        } else if (selected) {
          console.log('Selected file path:', selected);
        }
      }
    } catch (err) {
      console.error('Failed to select files:', err);
    }
  }
</script>

<div class="post-dialog-overlay" on:click={handleCancel}>
  <div class="post-dialog" on:click|stopPropagation>
    <div class="dialog-header">
      <h3>
        {mode === 'channel' ? 'Post to Channel' : 'Reply to Thread'}
        {#if continuousMode}
          <span class="continuous-badge">Continuous Mode</span>
        {/if}
      </h3>
      <button class="close-btn" on:click={handleCancel}>×</button>
    </div>
    
    <div class="dialog-info">
      <span class="channel-badge">#{decodeSlackText(channelName)}</span>
      {#if continuousMode && postedCount > 0}
        <span class="posted-count">{postedCount} message{postedCount > 1 ? 's' : ''} posted</span>
      {/if}
      {#if mode === 'thread' && messagePreview}
        <div class="thread-preview">
          Replying to: {decodeSlackText(messagePreview)}
        </div>
        <div class="also-send-to-channel">
          <label>
            <input 
              type="checkbox" 
              bind:checked={alsoSendToChannel}
              disabled={posting}
            />
            <span>Also send to <span class="channel-name">#{decodeSlackText(channelName)}</span></span>
          </label>
        </div>
      {/if}
    </div>
    
    <div
      class="dialog-body"
      class:dragging={isDragging}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
      on:paste={handlePaste}
    >
      <MentionTextarea
        bind:this={mentionTextarea}
        value={text}
        placeholder="Type your message... (Use @ to mention users)"
        disabled={posting}
        on:input={handleInput}
        on:keydown={handleKeydown}
      />

      <!-- File Upload Manager -->
      <FileUploadManager
        bind:this={fileUploadManager}
        {channelId}
        threadTs={mode === 'thread' ? threadTs : ''}
      />

      <!-- File Upload Actions -->
      <div class="upload-actions">
        <button
          class="btn-attach"
          on:click={handleSelectFiles}
          disabled={posting}
          title="Attach files"
        >
          📎 Attach files
        </button>
        <span class="upload-hint">
          or drag & drop files, or paste images from clipboard
        </span>
      </div>

      {#if showSuccessMessage && continuousMode}
        <div class="success-message">Message posted successfully!</div>
      {/if}

      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>
    
    <div class="dialog-footer">
      <span class="hint">
        {#if continuousMode}
          Ctrl+Enter to send (stays open) • Escape to exit • @ to mention
        {:else}
          Ctrl+Enter to send • Escape to cancel • @ to mention
        {/if}
      </span>
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

  .continuous-badge {
    display: inline-block;
    margin-left: 12px;
    padding: 2px 8px;
    background: #4CAF50;
    color: white;
    border-radius: 12px;
    font-size: 12px;
    font-weight: normal;
    vertical-align: middle;
  }

  .posted-count {
    margin-left: 12px;
    padding: 4px 8px;
    background: var(--color-background);
    border-radius: 4px;
    font-size: 13px;
    color: var(--color-text-secondary);
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

  .also-send-to-channel {
    margin-top: 12px;
    padding: 0;
  }

  .also-send-to-channel label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--color-text);
  }

  .also-send-to-channel input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .also-send-to-channel input[type="checkbox"]:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .also-send-to-channel .channel-name {
    font-weight: 600;
    color: var(--color-primary);
  }

  .dialog-body {
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: var(--color-background, #ffffff);
    position: relative;
  }

  .dialog-body.dragging {
    background: var(--color-background-secondary);
    border: 2px dashed var(--color-primary);
  }

  .dialog-body.dragging::after {
    content: 'Drop files here';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.1);
    font-size: 18px;
    font-weight: 500;
    color: var(--color-primary);
    pointer-events: none;
  }


  .success-message {
    margin-top: 12px;
    padding: 8px 12px;
    background: #e8f5e9;
    border: 1px solid #4CAF50;
    border-radius: 4px;
    color: #2e7d32;
    font-size: 13px;
    animation: fadeIn 0.3s ease-in;
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

  .upload-actions {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-attach {
    padding: 6px 12px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;
  }

  .btn-attach:hover:not(:disabled) {
    background: var(--color-hover);
    border-color: var(--color-primary);
  }

  .btn-attach:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .upload-hint {
    font-size: 12px;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
  :global([data-theme='dark']) .success-message {
    background: #1b3a1f;
    border-color: #4CAF50;
    color: #81c784;
  }

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