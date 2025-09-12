<script lang="ts">
  import { settings, updateDownloadFolder } from '../stores/settings';
  import { showToast } from '../stores/toast';
  
  let downloadFolder = '';
  let isSelecting = false;
  let isTauriAvailable = false;
  
  // Check if Tauri is available
  import { onMount } from 'svelte';
  onMount(async () => {
    try {
      // Dynamically import Tauri API only if available
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        isTauriAvailable = true;
      }
    } catch (err) {
      console.log('Tauri not available, folder selection disabled');
    }
  });
  
  // Initialize from settings
  $: downloadFolder = $settings.downloadFolder || '';
  
  async function selectFolder() {
    if (!isTauriAvailable) {
      showToast('Folder selection is only available in the desktop app', 'error');
      return;
    }
    
    isSelecting = true;
    try {
      // Dynamically import invoke only when needed
      const { invoke } = await import('@tauri-apps/api/core');
      const selectedPath = await invoke<string | null>('select_download_folder');
      if (selectedPath) {
        downloadFolder = selectedPath;
        updateDownloadFolder(selectedPath);
        showToast('Download folder updated', 'success');
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      showToast('Failed to select folder', 'error');
    } finally {
      isSelecting = false;
    }
  }
  
  function resetToDefault() {
    downloadFolder = '';
    updateDownloadFolder(null);
    showToast('Download folder reset to default', 'success');
  }
  
  function handlePathInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const path = input.value.trim();
    
    if (path) {
      updateDownloadFolder(path);
    } else {
      updateDownloadFolder(null);
    }
  }
</script>

<div class="setting-group">
  <h3>Download Settings</h3>
  
  <div class="download-folder-setting">
    <label for="download-folder">
      Download Folder
      <span class="help-text">
        Leave empty to use the default Downloads folder
      </span>
    </label>
    
    <div class="folder-input-group">
      <input
        id="download-folder"
        type="text"
        bind:value={downloadFolder}
        on:change={handlePathInput}
        placeholder="Default Downloads folder"
        class="folder-input"
      />
      
      <button
        class="btn-secondary"
        on:click={selectFolder}
        disabled={isSelecting}
      >
        {#if isSelecting}
          Selecting...
        {:else}
          Browse...
        {/if}
      </button>
      
      {#if downloadFolder}
        <button
          class="btn-ghost"
          on:click={resetToDefault}
          title="Reset to default"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
        </button>
      {/if}
    </div>
    
    {#if downloadFolder}
      <p class="current-path">
        Current: <code>{downloadFolder}</code>
      </p>
    {/if}
  </div>
  
  <div class="keyboard-shortcuts-info">
    <h4>Keyboard Shortcuts</h4>
    <ul class="shortcuts-list">
      <li>
        <kbd>d</kbd> - Download current file in lightbox
      </li>
      <li>
        <kbd>Shift+d</kbd> - Download all files from current message
      </li>
    </ul>
  </div>
</div>

<style>
  .setting-group {
    margin-bottom: 2rem;
    padding: 1rem;
    background: var(--bg-hover);
    border-radius: 8px;
  }
  
  .setting-group h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .download-folder-setting {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .help-text {
    display: block;
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: normal;
    margin-top: 0.25rem;
  }
  
  .folder-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  
  .folder-input {
    flex: 1;
    padding: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.95rem;
  }
  
  .folder-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .btn-secondary {
    padding: 0.5rem 1rem;
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: background 0.2s;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-ghost {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .btn-ghost:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .current-path {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }
  
  .current-path code {
    background: var(--bg-primary);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.85rem;
  }
  
  .keyboard-shortcuts-info {
    padding: 1rem;
    background: var(--bg-primary);
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  
  .keyboard-shortcuts-info h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .shortcuts-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .shortcuts-list li {
    padding: 0.4rem 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
  
  kbd {
    padding: 0.2rem 0.4rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    min-width: 1.5rem;
    text-align: center;
    display: inline-block;
  }
</style>