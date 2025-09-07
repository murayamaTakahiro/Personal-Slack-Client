import { writable, derived, get } from 'svelte/store';
import type { SearchResult, SearchParams, SearchHistory, Message } from '../types/slack';
import { batchFetchReactions, type ReactionRequest } from '../api/slack';

// Search state
export const searchQuery = writable<string>('');
export const searchResults = writable<SearchResult | null>(null);
export const searchLoading = writable<boolean>(false);
export const searchError = writable<string | null>(null);
export const searchProgress = writable<{ current: number; total: number; channel?: string } | null>(null);

// Reaction loading state
export const reactionLoadingState = writable<{
  isLoading: boolean;
  loadedCount: number;
  totalCount: number;
  errors: number;
}>({
  isLoading: false,
  loadedCount: 0,
  totalCount: 0,
  errors: 0
});

// Search parameters
export const searchParams = writable<SearchParams>({
  query: '',
  limit: 100
});

// Search history
const MAX_HISTORY = 20;
const storedHistory = localStorage.getItem('searchHistory');
const initialHistory: SearchHistory[] = storedHistory ? JSON.parse(storedHistory) : [];

export const searchHistory = writable<SearchHistory[]>(initialHistory);

// Subscribe to history changes and save to localStorage
searchHistory.subscribe(value => {
  localStorage.setItem('searchHistory', JSON.stringify(value.slice(0, MAX_HISTORY)));
});

// Add to search history
export function addToHistory(query: string, resultCount: number) {
  searchHistory.update(history => {
    const newEntry: SearchHistory = {
      query,
      timestamp: new Date(),
      resultCount
    };
    
    // Remove duplicate queries
    const filtered = history.filter(h => h.query !== query);
    
    // Add new entry at the beginning
    return [newEntry, ...filtered].slice(0, MAX_HISTORY);
  });
}

// Selected message for thread view
export const selectedMessage = writable<Message | null>(null);

// Derived store for message count
export const messageCount = derived(
  searchResults,
  $searchResults => $searchResults?.messages.length || 0
);

// Clear search
export function clearSearch() {
  searchQuery.set('');
  searchResults.set(null);
  searchError.set(null);
  selectedMessage.set(null);
  reactionLoadingState.set({
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,
    errors: 0
  });
}

// Load reactions progressively for all messages
export async function loadReactionsProgressive(messages: Message[]) {
  // Skip if no messages or reactions already loaded
  if (!messages || messages.length === 0) return;
  
  // Check if we already have reactions for most messages
  const messagesNeedingReactions = messages.filter(m => !m.reactions);
  if (messagesNeedingReactions.length === 0) return;
  
  // Update loading state
  reactionLoadingState.set({
    isLoading: true,
    loadedCount: messages.length - messagesNeedingReactions.length,
    totalCount: messages.length,
    errors: 0
  });
  
  try {
    // Prepare requests for messages that need reactions
    const requests: ReactionRequest[] = messagesNeedingReactions.map((msg, idx) => ({
      channel_id: msg.channel,
      timestamp: msg.ts,
      message_index: messages.findIndex(m => m.ts === msg.ts)
    }));
    
    // Optimized batch sizes for much better performance
    const INITIAL_BATCH_SIZE = 10; // Increased from 3 for faster initial load
    const REGULAR_BATCH_SIZE = 15; // Increased from 5 for better throughput
    
    let processedCount = 0;
    let errorCount = 0;
    
    // Process initial batch (visible messages)
    if (requests.length > 0) {
      const initialBatch = requests.slice(0, INITIAL_BATCH_SIZE);
      const initialResponse = await batchFetchReactions({
        requests: initialBatch,
        batch_size: INITIAL_BATCH_SIZE
      });
      
      // Apply reactions to messages
      applyReactionsToMessages(messages, initialResponse.reactions);
      processedCount += initialResponse.fetched_count;
      errorCount += initialResponse.error_count;
      
      // Update loading state
      reactionLoadingState.update(state => ({
        ...state,
        loadedCount: state.loadedCount + initialResponse.fetched_count,
        errors: errorCount
      }));
    }
    
    // Process remaining messages in background
    if (requests.length > INITIAL_BATCH_SIZE) {
      const remainingRequests = requests.slice(INITIAL_BATCH_SIZE);
      
      // Process in chunks
      for (let i = 0; i < remainingRequests.length; i += REGULAR_BATCH_SIZE) {
        const chunk = remainingRequests.slice(i, i + REGULAR_BATCH_SIZE);
        
        // Minimal delay between batches - reduced from 100ms
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        const response = await batchFetchReactions({
          requests: chunk,
          batch_size: REGULAR_BATCH_SIZE
        });
        
        // Apply reactions to messages
        applyReactionsToMessages(messages, response.reactions);
        processedCount += response.fetched_count;
        errorCount += response.error_count;
        
        // Update loading state
        reactionLoadingState.update(state => ({
          ...state,
          loadedCount: state.loadedCount + response.fetched_count,
          errors: state.errors + response.error_count
        }));
        
        // Update the search results to trigger UI update
        searchResults.update(results => {
          if (results) {
            return { ...results, messages: [...messages] };
          }
          return results;
        });
      }
    }
    
  } catch (error) {
    console.error('Error loading reactions:', error);
    reactionLoadingState.update(state => ({
      ...state,
      errors: state.errors + 1
    }));
  } finally {
    // Mark loading as complete
    reactionLoadingState.update(state => ({
      ...state,
      isLoading: false
    }));
  }
}

// Helper function to apply reactions to messages
function applyReactionsToMessages(messages: Message[], reactions: any[]) {
  for (const reaction of reactions) {
    if (reaction.reactions && reaction.message_index >= 0 && reaction.message_index < messages.length) {
      messages[reaction.message_index].reactions = reaction.reactions;
    }
  }
}