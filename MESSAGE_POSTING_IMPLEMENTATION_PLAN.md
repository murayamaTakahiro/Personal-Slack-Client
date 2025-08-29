# Slack Search Enhancer - メッセージ投稿機能実装計画

## 概要
検索結果のメッセージ一覧から直接Slackに投稿・返信できる機能を追加する計画書。

## 機能要件

### 基本機能
1. **チャンネル投稿**: フォーカスされたメッセージのチャンネルに新規メッセージを投稿
2. **スレッド返信**: フォーカスされたメッセージにスレッド形式で返信

### キーボードショートカット
- `Shift+R`: チャンネルへの投稿モード起動
- `Ctrl+Shift+R`: スレッド返信モード起動
- `Ctrl+Enter`: メッセージ送信
- `Escape`: 投稿キャンセル

## 技術的実装詳細

### 1. バックエンド実装 (Rust/Tauri)

#### 1.1 Slack APIクライアント拡張
**ファイル**: `src-tauri/src/slack/client.rs`

```rust
// 新規メソッド追加
impl SlackClient {
    /// チャンネルにメッセージを投稿
    pub async fn post_message(
        &self,
        channel: &str,
        text: &str,
        thread_ts: Option<&str>
    ) -> Result<PostMessageResponse> {
        let mut params = HashMap::new();
        params.insert("channel", channel.to_string());
        params.insert("text", text.to_string());
        
        if let Some(ts) = thread_ts {
            params.insert("thread_ts", ts.to_string());
        }
        
        self.api_call::<PostMessageResponse>("chat.postMessage", params).await
    }
}
```

#### 1.2 Tauriコマンド実装
**新規ファイル**: `src-tauri/src/commands/post.rs`

```rust
#[tauri::command]
pub async fn post_to_channel(
    state: tauri::State<'_, AppState>,
    channel_id: String,
    text: String
) -> Result<PostMessageResponse, String> {
    // 実装
}

#[tauri::command]
pub async fn post_thread_reply(
    state: tauri::State<'_, AppState>,
    channel_id: String,
    thread_ts: String,
    text: String
) -> Result<PostMessageResponse, String> {
    // 実装
}
```

#### 1.3 モデル定義
**ファイル**: `src-tauri/src/slack/models.rs`

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct PostMessageResponse {
    pub ok: bool,
    pub channel: String,
    pub ts: String,
    pub message: PostedMessage,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PostedMessage {
    pub text: String,
    pub user: String,
    pub ts: String,
    pub thread_ts: Option<String>,
}
```

### 2. フロントエンドAPI層

#### 2.1 API関数
**ファイル**: `src/lib/api/slack.ts`

```typescript
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
```

#### 2.2 型定義
**ファイル**: `src/lib/types/slack.ts`

```typescript
export interface PostMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message: PostedMessage;
  error?: string;
}

export interface PostedMessage {
  text: string;
  user: string;
  ts: string;
  threadTs?: string;
}
```

### 3. UIコンポーネント実装

#### 3.1 投稿ダイアログコンポーネント
**新規ファイル**: `src/lib/components/PostDialog.svelte`

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { postToChannel, postThreadReply } from '../api/slack';
  
  export let mode: 'channel' | 'thread';
  export let channelId: string;
  export let channelName: string;
  export let threadTs: string = '';
  export let messagePreview: string = '';
  
  const dispatch = createEventDispatcher();
  
  let text = '';
  let posting = false;
  let error: string | null = null;
  
  async function handlePost() {
    if (!text.trim()) return;
    
    posting = true;
    error = null;
    
    try {
      if (mode === 'channel') {
        await postToChannel(channelId, text);
      } else {
        await postThreadReply(channelId, threadTs, text);
      }
      
      dispatch('success');
      handleCancel();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to post message';
    } finally {
      posting = false;
    }
  }
  
  function handleCancel() {
    dispatch('cancel');
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.ctrlKey && event.key === 'Enter') {
      handlePost();
    }
  }
</script>

<div class="post-dialog-overlay" on:click={handleCancel}>
  <div class="post-dialog" on:click|stopPropagation>
    <div class="dialog-header">
      <h3>
        {mode === 'channel' ? 'Post to Channel' : 'Reply to Thread'}
      </h3>
      <button class="close-btn" on:click={handleCancel}>×</button>
    </div>
    
    <div class="dialog-info">
      <span class="channel-badge">#{channelName}</span>
      {#if mode === 'thread' && messagePreview}
        <div class="thread-preview">
          Replying to: {messagePreview}
        </div>
      {/if}
    </div>
    
    <div class="dialog-body">
      <textarea
        bind:value={text}
        on:keydown={handleKeydown}
        placeholder="Type your message..."
        disabled={posting}
        autofocus
      />
      
      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>
    
    <div class="dialog-footer">
      <span class="hint">Ctrl+Enter to send • Escape to cancel</span>
      <div class="buttons">
        <button 
          class="btn-cancel" 
          on:click={handleCancel}
          disabled={posting}
        >
          Cancel
        </button>
        <button 
          class="btn-send" 
          on:click={handlePost}
          disabled={posting || !text.trim()}
        >
          {posting ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  </div>
</div>
```

### 4. ResultListコンポーネントの拡張

#### 4.1 キーボードショートカット追加
**ファイル**: `src/lib/components/ResultList.svelte`

```svelte
<script lang="ts">
  // 既存のインポートに追加
  import PostDialog from './PostDialog.svelte';
  
  // 新規状態変数
  let showPostDialog = false;
  let postMode: 'channel' | 'thread' = 'channel';
  
  // キーボードハンドラー追加
  function handleKeydown(event: KeyboardEvent) {
    // 既存のハンドラー...
    
    // Shift+R: チャンネル投稿
    if (event.shiftKey && event.key === 'R' && !event.ctrlKey) {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < messages.length) {
        const message = messages[focusedIndex];
        openPostDialog('channel', message);
      }
    }
    
    // Ctrl+Shift+R: スレッド返信
    if (event.ctrlKey && event.shiftKey && event.key === 'R') {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < messages.length) {
        const message = messages[focusedIndex];
        openPostDialog('thread', message);
      }
    }
  }
  
  function openPostDialog(mode: 'channel' | 'thread', message: Message) {
    postMode = mode;
    showPostDialog = true;
    // PostDialogに渡すデータを準備
  }
  
  function handlePostSuccess() {
    showPostDialog = false;
    // 成功通知を表示
  }
  
  function handlePostCancel() {
    showPostDialog = false;
  }
</script>

<!-- 既存のテンプレートに追加 -->
{#if showPostDialog && focusedIndex >= 0}
  <PostDialog
    mode={postMode}
    channelId={messages[focusedIndex].channel}
    channelName={messages[focusedIndex].channel_name}
    threadTs={messages[focusedIndex].ts}
    messagePreview={messages[focusedIndex].text.slice(0, 100)}
    on:success={handlePostSuccess}
    on:cancel={handlePostCancel}
  />
{/if}
```

### 5. 必要なSlack権限

#### 5.1 OAuth Scopesの追加
現在の権限に以下を追加する必要があります：
- `chat:write` - ユーザーとしてメッセージを投稿
- `chat:write.public` - パブリックチャンネルへの投稿（未参加でも可能）

#### 5.2 権限確認の実装
```typescript
// src/lib/api/slack.ts
export async function checkPostingPermissions(): Promise<boolean> {
  return await invoke('check_posting_permissions');
}
```

### 6. エラーハンドリング

#### 6.1 想定されるエラー
1. **権限不足**: トークンにchat:write権限がない
2. **チャンネル未参加**: プライベートチャンネルで未参加
3. **レート制限**: Slack APIのレート制限
4. **ネットワークエラー**: 接続エラー
5. **無効なスレッド**: 削除されたメッセージへの返信

#### 6.2 エラー処理実装
```typescript
enum PostErrorType {
  PERMISSION_DENIED = 'permission_denied',
  NOT_IN_CHANNEL = 'not_in_channel',
  RATE_LIMITED = 'rate_limited',
  NETWORK_ERROR = 'network_error',
  INVALID_THREAD = 'invalid_thread',
  UNKNOWN = 'unknown'
}

function handlePostError(error: any): string {
  const errorType = error.type || PostErrorType.UNKNOWN;
  
  switch(errorType) {
    case PostErrorType.PERMISSION_DENIED:
      return 'Your token does not have permission to post messages. Please update token with chat:write scope.';
    case PostErrorType.NOT_IN_CHANNEL:
      return 'You are not a member of this channel. Join the channel first.';
    case PostErrorType.RATE_LIMITED:
      return 'Too many requests. Please wait a moment and try again.';
    case PostErrorType.NETWORK_ERROR:
      return 'Network error. Please check your connection.';
    case PostErrorType.INVALID_THREAD:
      return 'Cannot reply to this message. It may have been deleted.';
    default:
      return `Failed to post message: ${error.message || 'Unknown error'}`;
  }
}
```

### 7. セキュリティ考慮事項

#### 7.1 実装時の注意点
1. **トークン権限の最小化**: 必要最小限の権限のみ要求
2. **投稿前確認**: 重要なチャンネルへの投稿時は確認ダイアログ
3. **レート制限対策**: クライアント側でも制限を実装
4. **XSS対策**: 投稿内容のサニタイズ（Slack側で実施されるが念のため）

#### 7.2 設定オプション
```typescript
interface PostingSettings {
  confirmBeforePost: boolean;        // 投稿前確認
  confirmForPublicChannels: boolean; // パブリックチャンネルのみ確認
  maxMessageLength: number;          // 最大文字数制限
  enableMarkdown: boolean;           // Markdownサポート
}
```

### 8. テスト計画

#### 8.1 単体テスト
- APIクライアントのモックテスト
- コンポーネントのレンダリングテスト
- キーボードショートカットのテスト

#### 8.2 統合テスト
- 実際のSlack APIとの通信テスト（テスト用ワークスペース）
- エラーケースのテスト
- 権限不足時の動作確認

#### 8.3 ユーザビリティテスト
- キーボードのみでの操作フロー
- エラーメッセージの分かりやすさ
- 投稿成功/失敗時のフィードバック

### 9. 実装スケジュール

1. **Phase 1**: バックエンド実装（Rust）
   - Slack APIクライアント拡張
   - Tauriコマンド実装

2. **Phase 2**: フロントエンド実装
   - API層の実装
   - PostDialogコンポーネント作成

3. **Phase 3**: 統合とテスト
   - ResultListへの統合
   - エラーハンドリング実装
   - テスト実施

4. **Phase 4**: ドキュメントとリリース
   - 使用方法のドキュメント作成
   - 権限設定ガイド更新

## まとめ

この実装により、Slack Search Enhancerは単なる検索ツールから、双方向のコミュニケーションツールへと進化します。ユーザーは検索結果から直接返信できるため、作業効率が大幅に向上します。

実装の鍵となるのは：
- 適切な権限管理
- 直感的なUI/UX
- 確実なエラーハンドリング
- キーボード操作の完全サポート

これらを適切に実装することで、ユーザーフレンドリーで実用的な機能を提供できます。