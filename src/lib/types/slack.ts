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
  user?: string;  // User ID
  userName?: string;  // User display name
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  isRealtimeUpdate?: boolean;
  lastSearchTimestamp?: string | null; // For incremental updates in live mode
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
  files?: SlackFile[];
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

// Conversation type returned by conversations.list API
export interface SlackConversation {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
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
  executeSearch: string | string[];
  toggleAdvancedSearch: string | string[];
  focusSearchBar: string | string[];
  focusResults: string | string[];
  focusThread: string | string[];
  // focusUrlInput removed - now optional for backward compatibility
  focusUrlInput?: string | string[];
  toggleSettings: string | string[];
  newSearch: string | string[];
  nextResult: string | string[];
  prevResult: string | string[];
  openResult: string | string[];
  clearSearch: string | string[];
  toggleChannelSelector: string | string[];
  toggleMultiSelectMode?: string | string[];
  selectRecentChannels?: string | string[];
  selectAllFavorites?: string | string[];
  applySelectedChannels?: string | string[];
  toggleLiveMode?: string | string[];
  jumpToFirst: string | string[];
  jumpToLast: string | string[];
  quoteMessage?: string | string[];
  postMessage?: string | string[];
  postMessageContinuous?: string | string[];
  replyInThread?: string | string[];
  replyInThreadContinuous?: string | string[];
  openReactionPicker?: string | string[];
  openUrls?: string | string[];
  reaction1?: string | string[];
  reaction2?: string | string[];
  reaction3?: string | string[];
  reaction4?: string | string[];
  reaction5?: string | string[];
  reaction6?: string | string[];
  reaction7?: string | string[];
  reaction8?: string | string[];
  reaction9?: string | string[];
  // Shortcuts for adding reactions from other users
  otherReaction1?: string | string[];
  otherReaction2?: string | string[];
  otherReaction3?: string | string[];
  otherReaction4?: string | string[];
  otherReaction5?: string | string[];
  otherReaction6?: string | string[];
  otherReaction7?: string | string[];
  otherReaction8?: string | string[];
  otherReaction9?: string | string[];
  toggleKeyboardHelp?: string | string[];
  toggleEmojiSearch?: string | string[];
  zoomIn?: string | string[];
  zoomOut?: string | string[];
  zoomReset?: string | string[];
  toggleChannelFavorite?: string | string[];
  togglePerformanceMonitor?: string | string[];
  // Saved searches shortcuts
  toggleSavedSearches?: string | string[];
  saveCurrentSearch?: string | string[];
  quickSaveSearch?: string | string[];
  // Lightbox shortcuts
  openLightbox?: string | string[];
  lightboxNext?: string | string[];
  lightboxPrevious?: string | string[];
  lightboxScrollUp?: string | string[];
  lightboxScrollDown?: string | string[];
  lightboxZoomIn?: string | string[];
  lightboxZoomOut?: string | string[];
  lightboxZoomReset?: string | string[];
  lightboxClose?: string | string[];
  // File download shortcuts
  downloadAllAttachments?: string | string[];
  // File preview shortcut
  openFilePreview?: string | string[];
}

export interface MentionHistory {
  userId: string;
  count: number;
  lastUsed: string; // ISO date string
}

export interface AppSettings {
  token?: string;
  workspace?: string;
  maxResults: number;
  theme: 'light' | 'dark' | 'auto';
  keyboardShortcuts?: KeyboardShortcuts;
  userFavorites?: UserFavorite[];
  userFavoriteOrder?: string[];  // Track order of favorite user IDs
  recentUsers?: string[];  // Track recent user IDs
  reactionMappings?: ReactionMapping[];
  mentionHistory?: MentionHistory[];
  debugMode?: boolean;
  downloadFolder?: string | null;  // Custom download folder path, null means use default
  // Feature flags for experimental features
  experimentalFeatures?: {
    dmChannelsEnabled?: boolean;  // Enable DM channel discovery (Phase 1: read-only)
    highlightNewSearchResults?: boolean;  // Highlight messages that are new since last search
  };
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
  userName?: string;
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

// File types
export interface SlackFile {
  id: string;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  user: string;
  username?: string;
  editable: boolean;
  size: number;
  mode: string;
  is_external: boolean;
  external_type: string;
  is_public: boolean;
  public_url_shared: boolean;
  display_as_bot: boolean;
  
  // URLs
  url_private: string;
  url_private_download: string;
  permalink: string;
  permalink_public?: string;
  
  // Thumbnails
  thumb_64?: string;
  thumb_80?: string;
  thumb_160?: string;
  thumb_360?: string;
  thumb_360_gif?: string;
  thumb_480?: string;
  thumb_720?: string;
  thumb_960?: string;
  thumb_1024?: string;
  thumb_pdf?: string;
  thumb_video?: string;
  
  // Image properties
  image_exif_rotation?: number;
  original_w?: number;
  original_h?: number;
  deanimate_gif?: string;
  
  // Preview
  preview?: string;
  preview_highlight?: string;
  preview_is_truncated?: boolean;
  has_rich_preview?: boolean;
  
  // Sharing
  channels?: string[];
  groups?: string[];
  ims?: string[];
  comments_count?: number;
}