import { invoke } from '@tauri-apps/api/core';
import type { SearchParams, SearchResult, Message } from '../types/slack';
import { batchChannelSearch } from '../services/apiBatcher';
import { get } from 'svelte/store';
import { performanceSettings } from '../stores/performance';
import { searchMessagesFast, shouldUseFastSearch } from './fastSearch';

/**
 * Enhanced search function with batching support for multi-channel searches
 */
export async function searchMessagesWithBatching(params: SearchParams): Promise<SearchResult> {
  const settings = get(performanceSettings);

  // NEVER use fast search for realtime updates - we need fresh reactions
  if (params.isRealtimeUpdate) {
    console.log('[BatchedSearch] Realtime update - skipping fast search to get fresh reactions');
  } else if (shouldUseFastSearch(params)) {
    // Use ultra-fast search for large result sets (but not for realtime)
    console.log('[BatchedSearch] Using ultra-fast search for optimal performance');
    return searchMessagesFast(params);
  }
  
  // Check if we have multiple channels and batching is enabled
  const hasMultipleChannels = params.channel && params.channel.includes(',');
  const shouldUseBatching = settings.enableApiBatching && hasMultipleChannels;
  
  if (!shouldUseBatching) {
    // Use regular single search
    // IMPORTANT: Tauri expects exact parameter names from Rust function signature
    const invokeParams: Record<string, any> = {
      query: params.query || '',
    };

    // Only include optional parameters if they have values
    // IMPORTANT: Tauri v2 expects camelCase from JavaScript, which gets converted to snake_case in Rust
    if (params.channel) invokeParams.channel = params.channel;
    if (params.user) invokeParams.user = params.user;
    if (params.fromDate) {
      invokeParams.fromDate = params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate;
    }
    if (params.toDate) {
      invokeParams.toDate = params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate;
    }
    if (params.limit) invokeParams.limit = params.limit;
    if (params.isRealtimeUpdate) invokeParams.forceRefresh = params.isRealtimeUpdate;
    if (params.hasFiles === true) invokeParams.hasFiles = true;

    const result = await invoke<SearchResult>('search_messages', invokeParams);

    return result;
  }
  
  // Split channels for batching
  const channels = params.channel!.split(',').map(ch => ch.trim()).filter(ch => ch);
  
  console.log(`[BatchedSearch] Using batched search for ${channels.length} channels`);
  
  try {
    // Use batchChannelSearch to optimize API calls
    const batchedResults = await batchChannelSearch(
      channels,
      params.query || '',
      async (channelBatch: string[], query: string) => {
        // Execute search for each batch
        const batchChannel = channelBatch.join(',');
        // IMPORTANT: Tauri expects exact parameter names from Rust function signature
        const batchInvokeParams: Record<string, any> = {
          query: query,
        };

        // Only include optional parameters if they have values
        // IMPORTANT: Tauri v2 expects camelCase from JavaScript, which gets converted to snake_case in Rust
        if (batchChannel) batchInvokeParams.channel = batchChannel;
        if (params.user) batchInvokeParams.user = params.user;
        if (params.fromDate) {
          batchInvokeParams.fromDate = params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate;
        }
        if (params.toDate) {
          batchInvokeParams.toDate = params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate;
        }
        if (params.limit) batchInvokeParams.limit = params.limit;
        if (params.isRealtimeUpdate) batchInvokeParams.forceRefresh = params.isRealtimeUpdate;
        if (params.hasFiles === true) batchInvokeParams.hasFiles = true;

        const batchResult = await invoke<SearchResult>('search_messages', batchInvokeParams);

        return batchResult.messages || [];
      }
    );
    
    // Aggregate results from all batches
    const allMessages = batchedResults.flat() as Message[];
    
    // Sort messages by timestamp (newest first)
    allMessages.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
    
    // Apply limit if specified
    const limitedMessages = params.limit 
      ? allMessages.slice(0, params.limit)
      : allMessages;
    
    console.log(`[BatchedSearch] Aggregated ${limitedMessages.length} messages from ${channels.length} channels`);
    
    const result = {
      messages: limitedMessages,
      total: limitedMessages.length,
      query: params.query || '',
      executionTimeMs: 0
    };
    
    return result;
  } catch (error) {
    console.error('[BatchedSearch] Error in batched search:', error);
    throw error;
  }
}

/**
 * Get optimal batch size based on channel count
 */
export function getOptimalBatchSize(channelCount: number): number {
  if (channelCount <= 5) return channelCount;
  if (channelCount <= 20) return 5;
  if (channelCount <= 50) return 10;
  return 15;
}

/**
 * Check if batching should be used for the given parameters
 */
export function shouldUseBatching(params: SearchParams): boolean {
  const settings = get(performanceSettings);
  
  if (!settings.enableApiBatching) {
    return false;
  }
  
  // Only batch multi-channel searches
  const hasMultipleChannels = params.channel && params.channel.includes(',');
  if (!hasMultipleChannels) {
    return false;
  }
  
  // Count channels
  const channelCount = params.channel?.split(',').length || 0;
  
  // Use batching for 2+ channels
  return channelCount >= 2;
}