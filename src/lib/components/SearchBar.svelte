<script lang="ts">
  import { searchQuery, searchParams, searchLoading } from '../stores/search';
  import { createEventDispatcher } from 'svelte';
  
  export let channels: [string, string][] = [];
  export let showAdvanced = false;
  
  const dispatch = createEventDispatcher();
  
  let channel = '';
  let user = '';
  let fromDate = '';
  let toDate = '';
  let limit = 100;
  
  function handleSearch() {
    if ($searchQuery.trim()) {
      searchParams.set({
        query: $searchQuery,
        channel: channel || undefined,
        user: user || undefined,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit
      });
      dispatch('search');
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !$searchLoading) {
      handleSearch();
    }
  }
  
  function toggleAdvanced() {
    showAdvanced = !showAdvanced;
  }
  
  function clearFilters() {
    channel = '';
    user = '';
    fromDate = '';
    toDate = '';
    limit = 100;
  }
</script>

<div class="search-bar">
  <div class="search-main">
    <input
      type="text"
      bind:value={$searchQuery}
      on:keydown={handleKeydown}
      placeholder="Search messages..."
      disabled={$searchLoading}
      class="search-input"
    />
    
    <button
      on:click={toggleAdvanced}
      class="btn-icon"
      title="Advanced filters"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 4h18v2.172a2 2 0 0 1-.586 1.414l-6.828 6.828A2 2 0 0 0 13 15.828V20l-4 2v-6.172a2 2 0 0 0-.586-1.414L1.586 7.586A2 2 0 0 1 1 6.172V4z"/>
      </svg>
    </button>
    
    <button
      on:click={handleSearch}
      disabled={$searchLoading || !$searchQuery.trim()}
      class="btn-primary"
    >
      {#if $searchLoading}
        Searching...
      {:else}
        Search
      {/if}
    </button>
  </div>
  
  {#if showAdvanced}
    <div class="search-advanced">
      <div class="filter-row">
        <label>
          Channel:
          <select bind:value={channel}>
            <option value="">All channels</option>
            {#each channels as [_id, name]}
              <option value={name}>#{name}</option>
            {/each}
          </select>
        </label>
        
        <label>
          User:
          <input
            type="text"
            bind:value={user}
            placeholder="@username"
          />
        </label>
      </div>
      
      <div class="filter-row">
        <label>
          From:
          <input
            type="date"
            bind:value={fromDate}
          />
        </label>
        
        <label>
          To:
          <input
            type="date"
            bind:value={toDate}
          />
        </label>
        
        <label>
          Max results:
          <input
            type="number"
            bind:value={limit}
            min="10"
            max="1000"
            step="10"
          />
        </label>
      </div>
      
      <div class="filter-actions">
        <button on:click={clearFilters} class="btn-secondary">
          Clear filters
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .search-bar {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .search-main {
    display: flex;
    gap: 0.5rem;
  }
  
  .search-input {
    flex: 1;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 1rem;
    background: var(--bg-primary);
    color: var(--text-primary);
  }
  
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .search-input:disabled {
    opacity: 0.6;
  }
  
  .search-advanced {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  
  .filter-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .filter-row label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .filter-row input,
  .filter-row select {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .filter-actions {
    display: flex;
    justify-content: flex-end;
  }
  
  .btn-primary,
  .btn-secondary,
  .btn-icon {
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
  
  .btn-icon {
    padding: 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .btn-icon:hover {
    background: var(--bg-hover);
  }
</style>