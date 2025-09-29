import { invoke } from '@tauri-apps/api/core';
import type { SearchParams, SearchResult } from '../types/slack';
import { batchFetchReactions, type ReactionRequest } from './slack';
import { get } from 'svelte/store';
import { reactionLoadingState, searchResults } from '../stores/search';

/**
 * Ultra-fast search implementation that returns messages immediately
 * and loads reactions progressively in the background
 */
export async function searchMessagesFast(params: SearchParams): Promise<SearchResult> {
  console.log('[FastSearch] Starting ultra-fast search');
  
  // Use the new fast search command that skips reaction fetching
  const result = await invoke<SearchResult>('search_messages_fast', {
    query: params.query || '',
    channel: params.channel,
    user: params.user,
    // Handle both Date objects and string formats
    fromDate: params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate,
    toDate: params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate,
    limit: params.limit,
    force_refresh: params.isRealtimeUpdate || false  // Using snake_case for Rust
  });
  
  console.log(`[FastSearch] Got ${result.messages.length} messages instantly`);
  
  // Start loading reactions in the background without blocking
  if (result.messages.length > 0) {
    // Don't await - let it run in the background
    loadReactionsUltraFast(result.messages).catch(err => {
      console.error('[FastSearch] Background reaction loading failed:', err);
    });
  }
  
  return result;
}

/**
 * Ultra-fast reaction loading with aggressive parallelism
 */
async function loadReactionsUltraFast(messages: any[]) {
  // Filter messages that need reactions
  const messagesNeedingReactions = messages.filter(m => !m.reactions);
  if (messagesNeedingReactions.length === 0) {
    console.log('[FastSearch] All messages already have reactions cached');
    return;
  }
  
  console.log(`[FastSearch] Loading reactions for ${messagesNeedingReactions.length} messages in background`);
  
  // Update loading state
  reactionLoadingState.set({
    isLoading: true,
    loadedCount: messages.length - messagesNeedingReactions.length,
    totalCount: messages.length,
    errors: 0
  });
  
  // Prepare all requests
  const requests: ReactionRequest[] = messagesNeedingReactions.map((msg) => ({
    channel_id: msg.channel,
    timestamp: msg.ts,
    message_index: messages.findIndex(m => m.ts === msg.ts)
  }));
  
  // ULTRA AGGRESSIVE: Process ALL messages in massive parallel batches
  const MEGA_BATCH_SIZE = 50; // Process 50 at a time
  
  let loadedCount = messages.length - messagesNeedingReactions.length;
  let errorCount = 0;
  
  // Process in mega batches
  for (let i = 0; i < requests.length; i += MEGA_BATCH_SIZE) {
    const batch = requests.slice(i, i + MEGA_BATCH_SIZE);
    
    try {
      const response = await batchFetchReactions({
        requests: batch,
        batch_size: MEGA_BATCH_SIZE // Use same size for backend processing
      });
      
      // Apply reactions to messages
      for (const reaction of response.reactions) {
        if (reaction.reactions && reaction.message_index >= 0 && reaction.message_index < messages.length) {
          const msg = messages[reaction.message_index];
          console.log(`[FastSearch] Applying ${reaction.reactions.length} reactions to message at index ${reaction.message_index} (ts: ${msg.ts})`);

          // Create a new message object to trigger Svelte reactivity
          messages[reaction.message_index] = {
            ...messages[reaction.message_index],
            reactions: reaction.reactions
          };
        }
      }

      loadedCount += response.fetched_count;
      errorCount += response.error_count;

      // Update loading state
      reactionLoadingState.update(state => ({
        ...state,
        loadedCount: loadedCount,
        errors: errorCount
      }));

      // CRITICAL: Update the searchResults store to trigger Svelte reactivity
      // This ensures the UI updates when reactions are loaded
      searchResults.update(results => {
        if (results && results.messages === messages) {
          // Force a new reference to trigger reactivity
          return {
            ...results,
            messages: [...messages]
          };
        }
        return results;
      });
      
      console.log(`[FastSearch] Loaded batch: ${loadedCount}/${messages.length} reactions`);
      
    } catch (error) {
      console.error('[FastSearch] Batch failed:', error);
      errorCount += batch.length;
    }
  }
  
  // Mark loading as complete
  reactionLoadingState.update(state => ({
    ...state,
    isLoading: false
  }));
  
  console.log(`[FastSearch] Reaction loading complete: ${loadedCount} loaded, ${errorCount} errors`);
}

/**
 * Check if fast search should be used based on message count estimate
 */
export function shouldUseFastSearch(params: SearchParams): boolean {
  // NEVER use fast search for realtime updates - we need fresh reactions
  if (params.isRealtimeUpdate) {
    return false;
  }

  // Use fast search for:
  // 1. Multi-channel searches (likely to have many results)
  // 2. No query (channel browse - lots of messages)
  // 3. Large limit requests
  // 4. Date range searches (potentially many results)

  const hasMultipleChannels = params.channel && params.channel.includes(',');
  const hasNoQuery = !params.query || params.query.trim() === '';
  const hasLargeLimit = (params.limit || 100) >= 100;
  const hasDateRange = params.fromDate || params.toDate;

  return hasMultipleChannels || (hasNoQuery && params.channel) || hasLargeLimit || hasDateRange;
}