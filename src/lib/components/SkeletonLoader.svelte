<script lang="ts">
  export let type: 'message' | 'list' | 'thread' | 'channel' = 'message';
  export let count = 3;
  export let animate = true;
</script>

<div class="skeleton-container" role="status" aria-label="Loading content">
  <span class="sr-only">Loading...</span>
  
  {#if type === 'message'}
    {#each Array(count) as _, i}
      <div class="skeleton skeleton-message" class:animate>
        <div class="skeleton-avatar"></div>
        <div class="skeleton-content">
          <div class="skeleton-header">
            <div class="skeleton-name"></div>
            <div class="skeleton-time"></div>
          </div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
    {/each}
    
  {:else if type === 'list'}
    {#each Array(count) as _, i}
      <div class="skeleton skeleton-list-item" class:animate>
        <div class="skeleton-channel"></div>
        <div class="skeleton-message-preview">
          <div class="skeleton-text"></div>
          <div class="skeleton-text medium"></div>
        </div>
      </div>
    {/each}
    
  {:else if type === 'thread'}
    <div class="skeleton skeleton-thread" class:animate>
      <div class="skeleton-message">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-content">
          <div class="skeleton-header">
            <div class="skeleton-name"></div>
            <div class="skeleton-time"></div>
          </div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
      <div class="skeleton-replies">
        {#each Array(2) as _, i}
          <div class="skeleton-message reply">
            <div class="skeleton-avatar small"></div>
            <div class="skeleton-content">
              <div class="skeleton-text"></div>
              <div class="skeleton-text short"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
    
  {:else if type === 'channel'}
    {#each Array(count) as _, i}
      <div class="skeleton skeleton-channel-item" class:animate>
        <div class="skeleton-channel-icon"></div>
        <div class="skeleton-channel-name"></div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  
  .skeleton-container {
    padding: 0.5rem 0;
  }
  
  .skeleton {
    background: var(--bg-primary, white);
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }
  
  .skeleton.animate * {
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }
  
  /* Message skeleton */
  .skeleton-message {
    display: flex;
    padding: 0.75rem;
    gap: 0.75rem;
  }
  
  .skeleton-message.reply {
    margin-left: 2rem;
    padding: 0.5rem;
  }
  
  .skeleton-avatar {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    flex-shrink: 0;
  }
  
  .skeleton-avatar.small {
    width: 24px;
    height: 24px;
  }
  
  .skeleton-content {
    flex: 1;
  }
  
  .skeleton-header {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    align-items: center;
  }
  
  .skeleton-name {
    width: 80px;
    height: 14px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    border-radius: 2px;
  }
  
  .skeleton-time {
    width: 40px;
    height: 12px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    border-radius: 2px;
  }
  
  .skeleton-text {
    height: 14px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    border-radius: 2px;
    margin-bottom: 0.25rem;
    width: 100%;
  }
  
  .skeleton-text.short {
    width: 60%;
  }
  
  .skeleton-text.medium {
    width: 80%;
  }
  
  /* List item skeleton */
  .skeleton-list-item {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .skeleton-channel {
    width: 100px;
    height: 14px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    border-radius: 2px;
  }
  
  .skeleton-message-preview {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  /* Thread skeleton */
  .skeleton-thread {
    padding: 1rem;
  }
  
  .skeleton-replies {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color, #e1e4e8);
  }
  
  /* Channel item skeleton */
  .skeleton-channel-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
  }
  
  .skeleton-channel-icon {
    width: 16px;
    height: 16px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    border-radius: 2px;
  }
  
  .skeleton-channel-name {
    width: 120px;
    height: 14px;
    background: linear-gradient(90deg, #e0e0e0 0%, #f0f0f0 50%, #e0e0e0 100%);
    border-radius: 2px;
  }
</style>