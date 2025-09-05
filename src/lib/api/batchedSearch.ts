import { invoke } from '@tauri-apps/api/core';
import type { SearchParams, SearchResult, Message } from '../types/slack';
import { batchChannelSearch } from '../services/apiBatcher';
import { get } from 'svelte/store';
import { performanceSettings } from '../stores/performance';

/**
 * Enhanced search function with batching support for multi-channel searches
 */
export async function searchMessagesWithBatching(params: SearchParams): Promise<SearchResult> {
  const settings = get(performanceSettings);
  
  // Check if we have multiple channels and batching is enabled
  const hasMultipleChannels = params.channel && params.channel.includes(',');
  const shouldUseBatching = settings.enableApiBatching && hasMultipleChannels;
  
  if (!shouldUseBatching) {
    // Use regular single search
    return await invoke('search_messages', {
      query: params.query || '',
      channel: params.channel,
      user: params.user,
      fromDate: params.fromDate?.toISOString(),
      toDate: params.toDate?.toISOString(),
      limit: params.limit,
      forceRefresh: params.isRealtimeUpdate || false
    });
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
        const batchResult = await invoke<SearchResult>('search_messages', {
          query: query,
          channel: batchChannel,
          user: params.user,
          fromDate: params.fromDate?.toISOString(),
          toDate: params.toDate?.toISOString(),
          limit: params.limit,
          forceRefresh: params.isRealtimeUpdate || false
        });
        
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
    
    return {
      messages: limitedMessages,
      total: limitedMessages.length,
      query: params.query || '',
      executionTimeMs: 0
    };
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