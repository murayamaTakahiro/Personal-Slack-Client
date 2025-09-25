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
  const result = await invoke<SearchResult>('search_messages', {
    query: params.query || '',  // Send empty string if no query
    channel: params.channel,
    user: params.user,
    // Handle both Date objects and string formats
    fromDate: params.fromDate instanceof Date ? params.fromDate.toISOString() : params.fromDate,
    toDate: params.toDate instanceof Date ? params.toDate.toISOString() : params.toDate,
    limit: params.limit,
    forceRefresh: params.isRealtimeUpdate || false  // Add force refresh for realtime updates
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