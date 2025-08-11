export interface SearchParams {
  query: string;
  channel?: string;
  user?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
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
}

export interface AppSettings {
  token?: string;
  workspace?: string;
  maxResults: number;
  theme: 'light' | 'dark' | 'auto';
  keyboardShortcuts?: KeyboardShortcuts;
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