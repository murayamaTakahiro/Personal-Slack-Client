<script lang="ts">
  import { onMount } from 'svelte';
  import SearchBar from './lib/components/SearchBar.svelte';
  import ResultList from './lib/components/ResultList.svelte';
  import ThreadView from './lib/components/ThreadView.svelte';
  import { 
    searchResults, 
    searchLoading, 
    searchError,
    searchParams,
    selectedMessage,
    addToHistory
  } from './lib/stores/search';
  import { 
    secureSettings, 
    updateTokenSecure, 
    updateWorkspaceSecure, 
    loadSecureSettings 
  } from './lib/stores/secureSettings';
  import { maskTokenClient } from './lib/api/secure';
  import { 
    searchMessages, 
    getUserChannels, 
    testConnection,
    getThreadFromUrl,
    initTokenFromStorage 
  } from './lib/api/slack';
  
  let channels: [string, string][] = [];
  let showSettings = false;
  let token = '';
  let maskedToken = '';
  let workspace = '';
  let urlInput = '';
  let urlLoading = false;
  
  onMount(async () => {
    // Load secure settings
    const { token: savedToken, workspace: savedWorkspace } = await loadSecureSettings();
    if (savedToken) {
      token = savedToken;
      maskedToken = maskTokenClient(savedToken);
      await loadChannels();
    }
    if (savedWorkspace) {
      workspace = savedWorkspace;
    }
  });
  
  async function handleSearch() {
    searchLoading.set(true);
    searchError.set(null);
    
    try {
      const params = $searchParams;
      const result = await searchMessages(params);
      searchResults.set(result);
      addToHistory(params.query, result.messages.length);
    } catch (err) {
      searchError.set(err instanceof Error ? err.message : 'Search failed');
      console.error('Search error:', err);
    } finally {
      searchLoading.set(false);
    }
  }
  
  async function loadChannels() {
    try {
      channels = await getUserChannels();
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  }
  
  async function handleSaveSettings() {
    if (!token) {
      alert('Please enter a Slack token');
      return;
    }
    
    try {
      const isValid = await testConnection(token);
      if (!isValid) {
        alert('Invalid token. Please check and try again.');
        return;
      }
      
      // Save to secure storage
      await updateTokenSecure(token);
      await updateWorkspaceSecure(workspace);
      maskedToken = maskTokenClient(token);
      
      await loadChannels();
      showSettings = false;
      alert('Settings saved successfully!');
    } catch (err) {
      alert('Failed to save settings: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }
  
  async function handleUrlPaste() {
    if (!urlInput.trim()) return;
    
    urlLoading = true;
    searchError.set(null);
    
    try {
      // First ensure the token is initialized in the backend
      console.log('Initializing token from storage...');
      const tokenInitialized = await initTokenFromStorage();
      if (!tokenInitialized) {
        console.warn('No token found in storage, user may need to configure it');
      }
      
      console.log('Attempting to load thread from URL:', urlInput);
      const thread = await getThreadFromUrl(urlInput);
      console.log('Thread loaded successfully:', thread);
      selectedMessage.set(thread.parent);
      urlInput = '';
    } catch (err) {
      let errorMessage = 'Failed to load thread from URL';
      if (err instanceof Error) {
        errorMessage = err.message;
        // Extract more specific error details if available
        if (err.message.includes('Invalid Slack URL')) {
          errorMessage = 'Invalid Slack URL format. Please paste a valid Slack message link.';
        } else if (err.message.includes('Authentication') || err.message.includes('No Slack token')) {
          errorMessage = 'Authentication failed. Please check your Slack token in Settings.';
        } else if (err.message.includes('Network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.message.includes('not found')) {
          errorMessage = 'Thread not found. The message may have been deleted or you may not have access.';
        }
      }
      searchError.set(errorMessage);
      console.error('URL parse error:', err);
    } finally {
      urlLoading = false;
    }
  }
</script>

<div class="app">
  <header class="app-header">
    <h1>Slack Search Enhancer</h1>
    <button
      class="btn-settings"
      on:click={() => showSettings = !showSettings}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v6m0 6v6m4.22-13.22 4.24 4.24M1.54 1.54l4.24 4.24M20.46 20.46l-4.24-4.24M1.54 20.46l4.24-4.24"/>
      </svg>
      Settings
    </button>
  </header>
  
  {#if showSettings}
    <div class="settings-panel">
      <h2>Settings</h2>
      
      <div class="setting-group">
        <label>
          Slack User Token (xoxp-...)
          <input
            type="password"
            bind:value={token}
            placeholder="xoxp-xxxxxxxxxxxx"
          />
        </label>
        {#if maskedToken}
          <p class="masked-token">Current token: {maskedToken}</p>
        {/if}
        <p class="help-text">
          Get your token from: 
          <a href="https://api.slack.com/authentication/token-types#user" target="_blank">
            Slack API Documentation
          </a>
        </p>
      </div>
      
      <div class="setting-group">
        <label>
          Workspace Name
          <input
            type="text"
            bind:value={workspace}
            placeholder="your-workspace"
          />
        </label>
        <p class="help-text">
          The name that appears in your Slack URL (workspace.slack.com)
        </p>
      </div>
      
      <div class="settings-actions">
        <button class="btn-secondary" on:click={() => showSettings = false}>
          Cancel
        </button>
        <button class="btn-primary" on:click={handleSaveSettings}>
          Save Settings
        </button>
      </div>
    </div>
  {:else}
    <div class="url-input-section">
      <input
        type="text"
        bind:value={urlInput}
        placeholder="Paste a Slack thread URL to view..."
        on:keydown={(e) => e.key === 'Enter' && handleUrlPaste()}
        disabled={urlLoading}
        class="url-input"
      />
      <button
        on:click={handleUrlPaste}
        disabled={!urlInput.trim() || urlLoading}
        class="btn-primary"
      >
        {urlLoading ? 'Loading...' : 'Load Thread'}
      </button>
    </div>
    
    {#if $searchError}
      <div class="error-banner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{$searchError}</span>
        <button class="btn-close" on:click={() => searchError.set(null)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    {/if}
    
    <SearchBar
      {channels}
      on:search={handleSearch}
    />
    
    <div class="main-content">
      <div class="results-panel">
        <ResultList
          messages={$searchResults?.messages || []}
          loading={$searchLoading}
          error={$searchError}
        />
      </div>
      
      <div class="thread-panel">
        <ThreadView message={$selectedMessage} />
      </div>
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-hover: #f1f3f5;
    --text-primary: #212529;
    --text-secondary: #6c757d;
    --border: #dee2e6;
    --primary: #4a90e2;
    --primary-hover: #357abd;
    --primary-bg: #e7f1fb;
    --error: #dc3545;
  }
  
  :global(:root.dark) {
    --bg-primary: #1a1d21;
    --bg-secondary: #232629;
    --bg-hover: #2d3136;
    --text-primary: #e1e1e3;
    --text-secondary: #a0a0a2;
    --border: #3e4146;
    --primary: #4a90e2;
    --primary-hover: #357abd;
    --primary-bg: #1e3a5c;
    --error: #f56565;
  }
  
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
  }
  
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 1rem;
  }
  
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  
  .app-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .btn-settings {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-settings:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .settings-panel {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 2rem;
  }
  
  .settings-panel h2 {
    margin-bottom: 1.5rem;
  }
  
  .setting-group {
    margin-bottom: 1.5rem;
  }
  
  .setting-group label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-weight: 500;
  }
  
  .setting-group input {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 1rem;
  }
  
  .help-text {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .help-text a {
    color: var(--primary);
    text-decoration: none;
  }
  
  .help-text a:hover {
    text-decoration: underline;
  }
  
  .masked-token {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-hover);
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
  
  .settings-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
  }
  
  .url-input-section {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .url-input {
    flex: 1;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .url-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .main-content {
    display: flex;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  
  .results-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  .thread-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: var(--primary);
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .btn-secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    background: var(--bg-hover);
  }
  
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: var(--error);
    color: white;
    border-radius: 6px;
    animation: slideDown 0.3s ease;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .error-banner svg {
    flex-shrink: 0;
  }
  
  .error-banner span {
    flex: 1;
    font-size: 0.875rem;
  }
  
  .btn-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  
  .btn-close:hover {
    opacity: 1;
  }
</style>