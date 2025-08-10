import { writable, derived } from 'svelte/store';
import type { SearchResult, SearchParams, SearchHistory, Message } from '../types/slack';

// Search state
export const searchQuery = writable<string>('');
export const searchResults = writable<SearchResult | null>(null);
export const searchLoading = writable<boolean>(false);
export const searchError = writable<string | null>(null);

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
}