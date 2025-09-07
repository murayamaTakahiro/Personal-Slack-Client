import { invoke } from '@tauri-apps/api/core';
import type { 
  SearchParams, 
  SearchResult, 
  ThreadMessages, 
  ParsedUrl,
  PostMessageResponse,
  OpenUrlsResult
} from '../types/slack';

export async function searchMessages(params: SearchParams): Promise<SearchResult> {
  return await invoke('search_messages', {
    query: params.query || '',  // Send empty string if no query
    channel: params.channel,
    user: params.user,
    fromDate: params.fromDate?.toISOString(),
    toDate: params.toDate?.toISOString(),
    limit: params.limit,
    forceRefresh: params.isRealtimeUpdate || false  // Add force refresh for realtime updates
  });
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

export async function getUserChannels(): Promise<[string, string][]> {
  return await invoke('get_user_channels', {});
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
  text: string
): Promise<PostMessageResponse> {
  return await invoke('post_thread_reply', {
    channelId,
    threadTs,
    text
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