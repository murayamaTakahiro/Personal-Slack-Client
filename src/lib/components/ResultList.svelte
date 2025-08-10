<script lang="ts">
  import type { Message } from '../types/slack';
  import MessageItem from './MessageItem.svelte';
  import { selectedMessage, searchParams } from '../stores/search';
  
  export let messages: Message[] = [];
  export let loading = false;
  export let error: string | null = null;
  
  function handleMessageClick(message: Message) {
    selectedMessage.set(message);
  }
  
  // Check if any filters are active
  $: hasFilters = $searchParams && (
    $searchParams.channel || 
    $searchParams.user || 
    $searchParams.fromDate || 
    $searchParams.toDate
  );
</script>

<div class="result-list">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Searching messages...</p>
    </div>
  {:else if error}
    <div class="error">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>{error}</p>
    </div>
  {:else if messages.length === 0}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" opacity="0.3">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <p>No messages found</p>
      {#if hasFilters}
        <p class="hint">Try removing some filters or adjusting the date range</p>
        <div class="filter-summary">
          {#if $searchParams?.channel}
            <span class="filter-item">Channel: {$searchParams.channel}</span>
          {/if}
          {#if $searchParams?.user}
            <span class="filter-item">User: {$searchParams.user}</span>
          {/if}
          {#if $searchParams?.fromDate}
            <span class="filter-item">From: {new Date($searchParams.fromDate).toLocaleDateString()}</span>
          {/if}
          {#if $searchParams?.toDate}
            <span class="filter-item">To: {new Date($searchParams.toDate).toLocaleDateString()}</span>
          {/if}
        </div>
      {:else}
        <p class="hint">Try adjusting your search criteria</p>
      {/if}
    </div>
  {:else}
    <div class="results-header">
      <h3>
        {#if !$searchParams?.query}
          Browsing {messages.length} message{messages.length !== 1 ? 's' : ''}
          {#if $searchParams?.channel}
            in #{$searchParams.channel}
          {/if}
        {:else}
          {messages.length} message{messages.length !== 1 ? 's' : ''} found
        {/if}
      </h3>
    </div>
    <div class="messages">
      {#each messages as message}
        <MessageItem 
          {message}
          on:click={() => handleMessageClick(message)}
          selected={$selectedMessage?.ts === message.ts}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .result-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: hidden;
  }
  
  .loading,
  .error,
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-secondary);
  }
  
  .loading .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    color: var(--error);
  }
  
  .error svg {
    margin-bottom: 1rem;
  }
  
  .empty .hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    opacity: 0.7;
  }
  
  .results-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-primary);
  }
  
  .results-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }
  
  .messages::-webkit-scrollbar {
    width: 8px;
  }
  
  .messages::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }
  
  .messages::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .messages::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
  
  .filter-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
    justify-content: center;
  }
  
  .filter-item {
    padding: 0.25rem 0.75rem;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 16px;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
</style>