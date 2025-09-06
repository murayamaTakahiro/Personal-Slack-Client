<script lang="ts">
  import { currentUserId, setManualUserId, clearUserId, getCurrentUserIdDebug, initializeCurrentUser } from '../stores/currentUser';
  import { showSuccess, showError, showInfo } from '../stores/toast';
  
  let manualUserId = '';
  let isRefreshing = false;
  
  $: currentId = $currentUserId;
  
  async function handleSetManualUserId() {
    if (!manualUserId.trim()) {
      showError('Please enter a valid user ID');
      return;
    }
    
    setManualUserId(manualUserId.trim());
    showSuccess(`User ID set to: ${manualUserId.trim()}`);
    manualUserId = '';
  }
  
  async function handleRefreshUserId() {
    isRefreshing = true;
    try {
      await initializeCurrentUser();
      const newId = getCurrentUserIdDebug();
      if (newId) {
        showSuccess(`User ID refreshed: ${newId}`);
      } else {
        showError('Failed to fetch user ID from Slack');
      }
    } catch (error) {
      showError('Error refreshing user ID');
      console.error('[UserIdSettings] Error:', error);
    } finally {
      isRefreshing = false;
    }
  }
  
  function handleClearUserId() {
    clearUserId();
    showInfo('User ID cleared');
  }
  
  function copyUserId() {
    if (currentId) {
      navigator.clipboard.writeText(currentId);
      showSuccess('User ID copied to clipboard');
    }
  }
</script>

<div class="user-id-settings">
  <h3>User ID Configuration</h3>
  
  <div class="current-id-section">
    <label>Current User ID:</label>
    <div class="id-display">
      {#if currentId}
        <code>{currentId}</code>
        <button class="copy-btn" on:click={copyUserId} title="Copy to clipboard">
          📋
        </button>
      {:else}
        <span class="no-id">Not configured</span>
      {/if}
    </div>
  </div>
  
  <div class="actions-section">
    <button 
      class="refresh-btn" 
      on:click={handleRefreshUserId}
      disabled={isRefreshing}
    >
      {isRefreshing ? 'Refreshing...' : '🔄 Refresh from Slack'}
    </button>
    
    {#if currentId}
      <button class="clear-btn" on:click={handleClearUserId}>
        🗑️ Clear User ID
      </button>
    {/if}
  </div>
  
  <div class="manual-section">
    <label for="manual-id">Manual Override:</label>
    <div class="manual-input-group">
      <input
        id="manual-id"
        type="text"
        bind:value={manualUserId}
        placeholder="Enter user ID (e.g., U1234ABCD)"
        on:keydown={(e) => e.key === 'Enter' && handleSetManualUserId()}
      />
      <button on:click={handleSetManualUserId} disabled={!manualUserId.trim()}>
        Set
      </button>
    </div>
    <small class="help-text">
      To find your user ID: Open Slack web, click your profile, select "View profile", 
      then click "More" → "Copy member ID"
    </small>
  </div>
  
  <div class="debug-section">
    <details>
      <summary>Debug Information</summary>
      <div class="debug-content">
        <p>Check the browser console for detailed logs:</p>
        <ul>
          <li>Look for <code>[UserID]</code> logs for initialization</li>
          <li>Look for <code>[AUTH]</code> logs in Tauri console</li>
          <li>Look for <code>[Reaction Debug]</code> logs for reaction matching</li>
        </ul>
        <p>Common issues:</p>
        <ul>
          <li>Token might not have sufficient permissions</li>
          <li>User ID format might differ between workspaces</li>
          <li>Cache might be outdated (try clearing and refreshing)</li>
        </ul>
      </div>
    </details>
  </div>
</div>

<style>
  .user-id-settings {
    padding: 1rem;
    background: var(--color-bg-secondary, #f5f5f5);
    border-radius: 8px;
    margin: 1rem 0;
  }
  
  h3 {
    margin: 0 0 1rem 0;
    color: var(--color-text-primary, #333);
  }
  
  .current-id-section {
    margin-bottom: 1rem;
  }
  
  .id-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  
  code {
    background: var(--color-bg-tertiary, #e0e0e0);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9rem;
  }
  
  .no-id {
    color: var(--color-text-secondary, #666);
    font-style: italic;
  }
  
  .copy-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
  }
  
  .copy-btn:hover {
    opacity: 0.7;
  }
  
  .actions-section {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: var(--color-primary, #007bff);
    color: white;
    font-size: 0.9rem;
  }
  
  button:hover:not(:disabled) {
    opacity: 0.9;
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .clear-btn {
    background: var(--color-danger, #dc3545);
  }
  
  .manual-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #ddd);
  }
  
  label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--color-text-primary, #333);
  }
  
  .manual-input-group {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  
  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  input:focus {
    outline: none;
    border-color: var(--color-primary, #007bff);
  }
  
  .help-text {
    display: block;
    margin-top: 0.5rem;
    color: var(--color-text-secondary, #666);
    font-size: 0.85rem;
  }
  
  .debug-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #ddd);
  }
  
  details {
    cursor: pointer;
  }
  
  summary {
    font-weight: 500;
    color: var(--color-text-primary, #333);
  }
  
  .debug-content {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--color-bg-tertiary, #f9f9f9);
    border-radius: 4px;
    font-size: 0.85rem;
  }
  
  .debug-content ul {
    margin: 0.5rem 0 0.5rem 1.5rem;
  }
  
  .debug-content li {
    margin: 0.25rem 0;
  }
</style>