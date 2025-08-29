export interface EmojiReaction {
  name: string;
  count: number;
  users: string[];
}

export interface ReactionMapping {
  shortcut: number; // 1-9
  emoji: string;    // emoji name without colons (e.g., "thumbsup", "heart")
  display: string;  // display emoji character (e.g., "👍", "❤️")
}

export interface SearchParams {
  query: string;
  channel?: string;
  user?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  isRealtimeUpdate?: boolean;
}

export interface Message {
  ts: string;
  threadTs?: string;
  user: string;
  userName: string;
  text: string;
  channel: string;
  channelName: string;
  permalink: string;
  isThreadParent: boolean;
  replyCount?: number;
  reactions?: EmojiReaction[];
}

export interface ThreadMessages {
  parent: Message;
  replies: Message[];
}

export interface SearchResult {
  messages: Message[];
  total: number;
  query: string;
  executionTimeMs: number;
}

export interface ParsedUrl {
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  displayName?: string;
  avatar?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isChannel: boolean;
  isPrivate: boolean;
  isIm: boolean;
  isMpim: boolean;
}

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description?: string;
}

export interface KeyboardShortcuts {
  executeSearch: string;
  toggleAdvancedSearch: string;
  focusSearchBar: string;
  focusResults: string;
  focusThread: string;
  focusUrlInput: string;
  toggleSettings: string;
  newSearch: string;
  nextResult: string;
  prevResult: string;
  openResult: string;
  clearSearch: string;
  toggleChannelSelector: string;
  jumpToFirst: string;
  jumpToLast: string;
  postMessage?: string;
  replyInThread?: string;
  openReactionPicker?: string;
  reaction1?: string;
  reaction2?: string;
  reaction3?: string;
  reaction4?: string;
  reaction5?: string;
  reaction6?: string;
  reaction7?: string;
  reaction8?: string;
  reaction9?: string;
  openUrls?: string;
}

export interface AppSettings {
  token?: string;
  workspace?: string;
  maxResults: number;
  theme: 'light' | 'dark' | 'auto';
  keyboardShortcuts?: KeyboardShortcuts;
  userFavorites?: UserFavorite[];
  reactionMappings?: ReactionMapping[];
}

export interface SearchHistory {
  query: string;
  timestamp: Date;
  resultCount: number;
}

export interface SearchPreset {
  id: string;
  name: string;
  query: string;
  channel?: string;
  user?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface UserFavorite {
  id: string;        // Slack member ID (e.g., U04F9M6J2Q4)
  name: string;      // Slack username
  displayName?: string; // Display name from profile
  realName?: string; // Real name from profile
  alias?: string;    // User-defined alias for easy identification
  avatar?: string;   // Avatar URL
}

// Message posting types
export interface PostMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message?: PostedMessage;
  error?: string;
}

export interface PostedMessage {
  text: string;
  user: string;
  ts: string;
  threadTs?: string;
}

// URL opening types
export interface OpenUrlsResult {
  opened_slack: boolean;
  opened_external_count: number;
  errors: string[];
}

export interface ExtractedUrls {
  slackUrls: string[];
  externalUrls: string[];
}