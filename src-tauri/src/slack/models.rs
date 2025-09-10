use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub channel: Option<String>,
    pub user: Option<String>,
    pub from_date: Option<String>, // ISO 8601
    pub to_date: Option<String>,   // ISO 8601
    pub limit: Option<usize>,      // デフォルト: 100
    pub is_realtime: Option<bool>, // Flag for realtime/live mode searches
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub ts: String,
    #[serde(rename = "threadTs")]
    pub thread_ts: Option<String>,
    pub user: String,
    #[serde(rename = "userName")]
    pub user_name: String,
    pub text: String,
    pub channel: String,
    #[serde(rename = "channelName")]
    pub channel_name: String,
    pub permalink: String,
    #[serde(rename = "isThreadParent")]
    pub is_thread_parent: bool,
    #[serde(rename = "replyCount")]
    pub reply_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reactions: Option<Vec<SlackReaction>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<SlackFile>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadMessages {
    pub parent: Message,
    pub replies: Vec<Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub messages: Vec<Message>,
    pub total: usize,
    pub query: String,
    #[serde(rename = "executionTimeMs")]
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedUrl {
    #[serde(rename = "channelId")]
    pub channel_id: String,
    #[serde(rename = "messageTs")]
    pub message_ts: String,
    #[serde(rename = "threadTs")]
    pub thread_ts: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackUser {
    pub id: String,
    pub name: String,
    pub real_name: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackChannel {
    pub id: String,
    pub name: String,
    pub is_channel: bool,
    pub is_private: bool,
    pub is_im: bool,
    pub is_mpim: bool,
}

// Slack API Response structures
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SlackSearchResponse {
    pub ok: bool,
    pub query: Option<String>,
    pub messages: Option<SlackSearchMessages>,
    pub error: Option<String>,
    pub needed: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SlackSearchMessages {
    pub total: usize,
    pub pagination: SlackPagination,
    pub paging: SlackPaging,
    pub matches: Vec<SlackMessage>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SlackPagination {
    pub total_count: usize,
    pub page: usize,
    pub per_page: usize,
    pub page_count: usize,
    pub first: usize,
    pub last: usize,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SlackPaging {
    pub count: usize,
    pub total: usize,
    pub page: usize,
    pub pages: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackMessage {
    pub ts: String,
    pub thread_ts: Option<String>,
    pub user: Option<String>,
    pub username: Option<String>,
    pub text: String,
    pub channel: SlackChannelInfo,
    pub permalink: String,
    #[serde(default)]
    pub reactions: Option<Vec<SlackReaction>>,
    #[serde(default)]
    pub files: Option<Vec<SlackFile>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackChannelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SlackConversationsRepliesResponse {
    pub ok: bool,
    pub messages: Option<Vec<SlackReplyMessage>>,
    pub error: Option<String>,
    pub has_more: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct SlackReplyMessage {
    pub ts: String,
    pub thread_ts: Option<String>,
    pub user: Option<String>,
    pub text: String,
    pub reply_count: Option<usize>,
    pub reply_users: Option<Vec<String>>,
    pub reply_users_count: Option<usize>,
    pub latest_reply: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SlackUserInfoResponse {
    pub ok: bool,
    pub user: Option<SlackUserInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SlackUserInfo {
    pub id: String,
    pub name: String,
    pub real_name: Option<String>,
    pub profile: Option<SlackUserProfile>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct SlackUserProfile {
    pub display_name: Option<String>,
    pub real_name: Option<String>,
    pub image_48: Option<String>,
    pub image_72: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SlackConversationsListResponse {
    pub ok: bool,
    pub channels: Option<Vec<SlackConversation>>,
    pub error: Option<String>,
    pub response_metadata: Option<SlackResponseMetadata>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct SlackConversation {
    pub id: String,
    pub name: Option<String>,
    pub is_channel: Option<bool>,
    pub is_group: Option<bool>,
    pub is_im: Option<bool>,
    pub is_mpim: Option<bool>,
    pub is_private: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SlackResponseMetadata {
    pub next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SlackUsersListResponse {
    pub ok: bool,
    pub members: Option<Vec<SlackUserInfo>>,
    pub error: Option<String>,
    pub response_metadata: Option<SlackResponseMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackReaction {
    pub name: String,
    pub count: u32,
    pub users: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionRequest {
    pub channel: String,
    pub timestamp: String,
    pub emoji: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReactionResponse {
    pub ok: bool,
    pub error: Option<String>,
}

// File models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackFile {
    pub id: String,
    pub created: Option<i64>,
    pub timestamp: Option<i64>,
    pub name: String,
    pub title: String,
    pub mimetype: String,
    pub filetype: Option<String>,
    pub pretty_type: Option<String>,
    pub user: Option<String>,
    pub username: Option<String>,
    pub editable: Option<bool>,
    pub size: i64,
    pub mode: Option<String>,
    pub is_external: Option<bool>,
    pub external_type: Option<String>,
    pub is_public: Option<bool>,
    pub public_url_shared: Option<bool>,
    pub display_as_bot: Option<bool>,
    
    // URLs
    pub url_private: Option<String>,
    pub url_private_download: Option<String>,
    pub permalink: Option<String>,
    pub permalink_public: Option<String>,
    
    // Thumbnails
    pub thumb_64: Option<String>,
    pub thumb_80: Option<String>,
    pub thumb_160: Option<String>,
    pub thumb_360: Option<String>,
    pub thumb_360_gif: Option<String>,
    pub thumb_480: Option<String>,
    pub thumb_720: Option<String>,
    pub thumb_960: Option<String>,
    pub thumb_1024: Option<String>,
    pub thumb_pdf: Option<String>,
    pub thumb_video: Option<String>,
    
    // Image properties
    pub image_exif_rotation: Option<i32>,
    pub original_w: Option<i32>,
    pub original_h: Option<i32>,
    pub deanimate_gif: Option<String>,
    
    // Preview
    pub preview: Option<String>,
    pub preview_highlight: Option<String>,
    pub preview_is_truncated: Option<bool>,
    pub has_rich_preview: Option<bool>,
    
    // Sharing
    pub channels: Option<Vec<String>>,
    pub groups: Option<Vec<String>>,
    pub ims: Option<Vec<String>>,
    pub comments_count: Option<i32>,
}

// Post message models
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostMessageRequest {
    pub channel: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_ts: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostMessageResponse {
    pub ok: bool,
    pub channel: String,
    pub ts: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<PostedMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostedMessage {
    pub text: String,
    pub user: String,
    #[serde(rename = "userName", skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,
    pub ts: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_ts: Option<String>,
}
