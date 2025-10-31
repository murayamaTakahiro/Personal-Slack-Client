import { invoke } from '@tauri-apps/api/core';
import type { 
  SearchParams, 
  SearchResult, 
  ThreadMessages, 
  ParsedUrl,
  PostMessageResponse,
  OpenUrlsResult,
  SlackFile
} from '../types/slack';

export async function searchMessages(params: SearchParams): Promise<SearchResult> {
  // If no query but filters exist (including fileExtensions), use wildcard to search all messages
  const hasFilters = params.channel || params.user || params.fromDate || params.toDate ||
                     (params.fileExtensions && params.fileExtensions.length > 0);
  const query = (params.query && params.query.trim()) || (hasFilters ? '*' : '');

  const result = await invoke<SearchResult>('search_messages', {
    query,  // Send wildcard if no query but filters exist
    channel: params.channel,
    user: params.user,
    // Handle both Date objects and string formats
    fromDate: params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate,
    toDate: params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate,
    limit: params.limit,
    force_refresh: params.isRealtimeUpdate || false,  // Add force refresh for realtime updates - using snake_case for Rust
    last_timestamp: params.lastSearchTimestamp || undefined,  // For incremental fetching in live mode
    has_files: params.hasFiles || undefined,  // Deprecated: kept for backward compatibility
    file_extensions: params.fileExtensions || undefined  // Filter by file extensions (snake_case for Rust)
  });

  // Debug: Check if reactions are included in the response
  if (result.messages && result.messages.length > 0) {
    const messagesWithReactions = result.messages.filter(m => m.reactions && m.reactions.length > 0);
    console.log(`[searchMessages] ${messagesWithReactions.length}/${result.messages.length} messages have reactions`);
    if (messagesWithReactions.length > 0) {
      console.log('[searchMessages] Sample message with reactions:', messagesWithReactions[0]);
    }
  }

  return result;
}

export async function getThread(channelId: string, threadTs: string): Promise<ThreadMessages> {
  return await invoke('get_thread', {
    channelId,
    threadTs
  });
}

export async function getThreadFromUrl(url: string): Promise<ThreadMessages> {
  return await invoke('get_thread_from_url', { url });
}

export async function parseSlackUrl(url: string): Promise<ParsedUrl> {
  return await invoke('parse_slack_url_command', { url });
}

export async function openInSlack(permalink: string): Promise<void> {
  return await invoke('open_in_slack', { permalink });
}

export async function getUserChannels(includeDMs: boolean = false): Promise<[string, string][]> {
  return await invoke('get_user_channels', { includeDms: includeDMs });
}

export async function getUsers(): Promise<[string, string, string | null][]> {
  return await invoke('get_users', {});
}

export async function testConnection(token: string): Promise<boolean> {
  return await invoke('test_connection', { token });
}

export async function initTokenFromStorage(): Promise<boolean> {
  return await invoke('init_token_from_storage', {});
}

// Message posting functions
export async function postToChannel(
  channelId: string, 
  text: string
): Promise<PostMessageResponse> {
  return await invoke('post_to_channel', {
    channelId,
    text
  });
}

export async function postThreadReply(
  channelId: string,
  threadTs: string,
  text: string,
  replyBroadcast: boolean = false
): Promise<PostMessageResponse> {
  return await invoke('post_thread_reply', {
    channelId,
    threadTs,
    text,
    replyBroadcast
  });
}

export async function checkPostingPermissions(): Promise<boolean> {
  return await invoke('check_posting_permissions', {});
}

// URL opening functions
export async function openUrlsSmart(
  slackUrl: string | null,
  externalUrls: string[],
  delayMs?: number
): Promise<OpenUrlsResult> {
  return await invoke('open_urls_smart', {
    slackUrl,
    externalUrls,
    delayMs
  });
}

export async function validateUrls(urls: string[]): Promise<string[]> {
  return await invoke('validate_urls', { urls });
}

// Batch reaction fetching
export interface ReactionRequest {
  channel_id: string;
  timestamp: string;
  message_index: number;
}

export interface BatchReactionsRequest {
  requests: ReactionRequest[];
  batch_size?: number;
}

export interface ReactionResponse {
  message_index: number;
  reactions?: any[]; // SlackReaction[]
  error?: string;
}

export interface BatchReactionsResponse {
  reactions: ReactionResponse[];
  fetched_count: number;
  error_count: number;
}

export async function batchFetchReactions(
  request: BatchReactionsRequest
): Promise<BatchReactionsResponse> {
  return await invoke('batch_fetch_reactions', { request });
}

export async function fetchReactionsProgressive(
  channelId: string,
  timestamps: string[],
  initialBatchSize?: number
): Promise<(any[] | null)[]> {
  return await invoke('fetch_reactions_progressive', {
    channelId,
    timestamps,
    initialBatchSize
  });
}

export async function clearReactionCache(): Promise<void> {
  return await invoke('clear_reaction_cache', {});
}

/**
 * Mark a message as read on Slack
 *
 * This function calls the Slack API to update the read cursor for a specific
 * channel, marking all messages up to and including the specified timestamp as read.
 *
 * This is useful for:
 * - Syncing read status between this app and Slack
 * - Marking messages as read after viewing them in this app
 * - Bulk marking messages as read
 *
 * @param channelId - The channel ID where the message is located
 *   - Public/private channels: "C..." format (e.g., "C1234567890")
 *   - DMs: "D..." format (e.g., "D1234567890")
 *   - Group DMs: "G..." format (e.g., "G1234567890")
 * @param timestamp - The timestamp of the message to mark as read
 *   - Format: "1234567890.123456" (Unix timestamp with microseconds)
 *   - All messages up to and including this timestamp will be marked as read
 *
 * @throws Error if the API call fails (authentication, permission, network errors)
 *
 * @example
 * ```typescript
 * // Mark a single message as read
 * await markMessageAsRead('C1234567890', '1234567890.123456');
 *
 * // Mark a DM message as read
 * await markMessageAsRead('D1234567890', '1234567890.123456');
 *
 * // With error handling
 * try {
 *   await markMessageAsRead(message.channel, message.ts);
 *   console.log('Message marked as read successfully');
 * } catch (error) {
 *   console.error('Failed to mark message as read:', error);
 * }
 * ```
 */
export async function markMessageAsRead(
  channelId: string,
  timestamp: string
): Promise<void> {
  console.log(`[markMessageAsRead] Marking message as read: channel=${channelId}, ts=${timestamp}`);

  try {
    await invoke('mark_message_as_read', {
      channelId,
      timestamp
    });
    console.log(`[markMessageAsRead] Successfully marked message as read`);
  } catch (error) {
    console.error(`[markMessageAsRead] Failed to mark message as read:`, error);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Get all unmuted channels where the user is a member
 *
 * Returns channels filtered by:
 * - is_member = true
 * - is_muted = false
 * - is_archived = false
 *
 * @returns Array of [channelId, channelName] tuples
 */
export async function getUnmutedMemberChannels(): Promise<[string, string][]> {
  return await invoke('get_unmuted_member_channels', {});
}