<script lang="ts">
  import { reactionMappings, DEFAULT_REACTION_MAPPINGS } from '../services/reactionService';
  import { updateSettings } from '../stores/settings';
  import { emojiService, emojiLoading, emojiData } from '../services/emojiService';
  import type { ReactionMapping } from '../types/slack';
  
  // Use DEFAULT_REACTION_MAPPINGS directly as the single source of truth
  let mappings: ReactionMapping[] = [...DEFAULT_REACTION_MAPPINGS];
  let editingIndex: number | null = null;
  let newEmoji = '';
  
  // Function to manually refresh emojis for debugging
  async function refreshEmojis() {
    console.log('[EmojiSettings] Manually refreshing emojis...');
    await emojiService.refresh();
    const data = $emojiData;
    console.log('[EmojiSettings] Emoji refresh complete:', {
      customCount: Object.keys(data.custom).length,
      standardCount: Object.keys(data.standard).length,
      sampleCustom: Object.entries(data.custom).slice(0, 5)
    });
    alert(`Emojis refreshed! Custom: ${Object.keys(data.custom).length}, Standard: ${Object.keys(data.standard).length}`);
  }
  
  // Common emoji suggestions
  const emojiSuggestions = [
    { name: '+1', display: '👍' },
    { name: 'heart', display: '❤️' },
    { name: 'smile', display: '😄' },
    { name: 'tada', display: '🎉' },
    { name: 'eyes', display: '👀' },
    { name: 'rocket', display: '🚀' },
    { name: 'white_check_mark', display: '✅' },
    { name: 'thinking_face', display: '🤔' },
    { name: '-1', display: '👎' },
    { name: 'clap', display: '👏' },
    { name: 'fire', display: '🔥' },
    { name: 'star', display: '⭐' },
    { name: 'thumbsdown', display: '👎' },
    { name: 'wave', display: '👋' },
    { name: 'pray', display: '🙏' },
    { name: '100', display: '💯' },
    { name: 'joy', display: '😂' },
    { name: 'sob', display: '😭' },
    { name: 'heart_eyes', display: '😍' },
    { name: 'raised_hands', display: '🙌' },
    // Additional emojis from screenshot
    { name: 'arigataya', display: '🙏' },
    { name: 'kakuninshimasu', display: '確認' },
    { name: 'ohayougozaimasu', display: '☀️' },
    { name: 'sasuga2', display: '拍手' },
    { name: 'otsukareamadesu', display: 'お疲れ様でした' },
    { name: 'tasikani', display: 'たしかに' },
    { name: 'tasukarimasu', display: '助かります!' }
  ];
  
  function startEditing(index: number) {
    editingIndex = index;
    newEmoji = mappings[index].emoji;
  }
  
  function cancelEditing() {
    editingIndex = null;
    newEmoji = '';
  }
  
  function saveEmoji(index: number) {
    if (newEmoji.trim()) {
      const suggestion = emojiSuggestions.find(s => s.name === newEmoji.trim());
      mappings[index] = {
        ...mappings[index],
        emoji: newEmoji.trim(),
        display: suggestion?.display || mappings[index].display
      };
      mappings = [...mappings];
      saveSettings();
    }
    cancelEditing();
  }
  
  function selectEmoji(index: number, emoji: { name: string; display: string }) {
    mappings[index] = {
      ...mappings[index],
      emoji: emoji.name,
      display: emoji.display
    };
    mappings = [...mappings];
    saveSettings();
    cancelEditing();
  }
  
  async function resetToDefaults() {
    // Since we're using direct code modification, just reload the defaults
    mappings = [...DEFAULT_REACTION_MAPPINGS];
    // Update the store to trigger any dependent UI updates
    reactionMappings.set(mappings);
  }
  
  async function reloadConfig() {
    // Reload the current DEFAULT_REACTION_MAPPINGS after code edit
    mappings = [...DEFAULT_REACTION_MAPPINGS];
    reactionMappings.set(mappings);
    console.log('[EmojiSettings] Reloaded DEFAULT_REACTION_MAPPINGS from reactionService.ts');
  }
  
  async function saveSettings() {
    // Since we're using direct code modification, this is now a no-op
    // The user should edit reactionService.ts directly
    console.log('[EmojiSettings] Note: To persist changes, edit DEFAULT_REACTION_MAPPINGS in reactionService.ts');
    alert('注意: 永続的な変更はsrc/lib/services/reactionService.tsのDEFAULT_REACTION_MAPPINGSを直接編集してください');
  }
  
  function handleKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEmoji(index);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }
</script>

<div class="emoji-settings">
  <div class="header">
    <h3>絵文字リアクション設定</h3>
    <div class="header-buttons">
      <button class="refresh-emoji-button" on:click={refreshEmojis} disabled={$emojiLoading}>
        {$emojiLoading ? 'Loading...' : 'Refresh Emojis'}
      </button>
      <button class="reload-button" on:click={reloadConfig}>
        設定を再読み込み
      </button>
      <button class="reset-button" on:click={resetToDefaults}>
        デフォルトに戻す
      </button>
    </div>
  </div>
  
  <div class="emoji-status">
    <span>Custom emojis: {Object.keys($emojiData.custom).length}</span>
    <span>Standard emojis: {Object.keys($emojiData.standard).length}</span>
  </div>
  
  <div class="config-notice">
    <p>⚠️ 設定は <code>src/lib/services/reactionService.ts</code> の <code>DEFAULT_REACTION_MAPPINGS</code> で管理されています</p>
    <p>詳細は <a href="/EMOJI_CONFIG_SIMPLE.md" target="_blank">EMOJI_CONFIG_SIMPLE.md</a> を参照してください</p>
  </div>
  
  <p class="description">
    数字キー（1〜9）で追加・削除できる絵文字（現在の設定を表示）
  </p>
  
  <div class="mappings-list">
    {#each mappings as mapping, index}
      <div class="mapping-item">
        <div class="shortcut-key">{mapping.shortcut}</div>
        
        {#if editingIndex === index}
          <div class="edit-section">
            <input
              type="text"
              bind:value={newEmoji}
              placeholder="絵文字名を入力"
              on:keydown={(e) => handleKeydown(e, index)}
              class="emoji-input"
            />
            <div class="action-buttons">
              <button class="save-btn" on:click={() => saveEmoji(index)}>
                保存
              </button>
              <button class="cancel-btn" on:click={cancelEditing}>
                キャンセル
              </button>
            </div>
          </div>
          
          <div class="suggestions">
            <p class="suggestions-label">よく使われる絵文字:</p>
            <div class="emoji-grid">
              {#each emojiSuggestions as emoji}
                <button
                  class="emoji-option"
                  on:click={() => selectEmoji(index, emoji)}
                  title={emoji.name}
                >
                  <span class="emoji-display">{emoji.display}</span>
                  <span class="emoji-name">{emoji.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div class="current-emoji">
            <span class="emoji-display">{mapping.display}</span>
            <span class="emoji-name">{mapping.emoji}</span>
          </div>
          <button class="edit-button" on:click={() => startEditing(index)}>
            編集
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .emoji-settings {
    padding: 20px;
    max-width: 800px;
    margin: 0 auto;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .header h3 {
    margin: 0;
    font-size: 20px;
    color: var(--text-primary);
  }
  
  .header-buttons {
    display: flex;
    gap: 8px;
  }
  
  .reset-button, .reload-button, .refresh-emoji-button {
    padding: 8px 16px;
    background: var(--button-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .reset-button:hover, .reload-button:hover, .refresh-emoji-button:hover:not(:disabled) {
    background: var(--button-secondary-hover);
  }
  
  .reload-button {
    background: var(--primary, #0066cc);
    color: white;
    border: none;
  }
  
  .reload-button:hover {
    background: var(--primary-hover, #0052a3);
  }
  
  .refresh-emoji-button {
    background: #4CAF50;
    color: white;
    border: none;
  }
  
  .refresh-emoji-button:hover:not(:disabled) {
    background: #45a049;
  }
  
  .refresh-emoji-button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .emoji-status {
    display: flex;
    gap: 20px;
    padding: 10px;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 4px;
    margin-bottom: 15px;
    font-size: 13px;
    color: var(--text-secondary);
  }
  
  .description {
    color: var(--text-secondary);
    margin-bottom: 24px;
    font-size: 14px;
  }
  
  .config-notice {
    background: var(--bg-hover, #f0f0f0);
    border: 1px solid var(--border, #ddd);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 20px;
    font-size: 14px;
  }
  
  .config-notice p {
    margin: 4px 0;
  }
  
  .config-notice code {
    background: var(--bg-primary, #fff);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
  }
  
  .config-notice a {
    color: var(--primary, #0066cc);
    text-decoration: none;
  }
  
  .config-notice a:hover {
    text-decoration: underline;
  }
  
  .mappings-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .mapping-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px;
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    position: relative;
  }
  
  .shortcut-key {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-weight: bold;
    font-size: 18px;
    color: var(--text-primary);
  }
  
  .current-emoji {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }
  
  .emoji-display {
    font-size: 24px;
  }
  
  .emoji-name {
    color: var(--text-secondary);
    font-size: 14px;
    font-family: monospace;
  }
  
  .edit-button {
    padding: 6px 12px;
    background: var(--button-primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .edit-button:hover {
    background: var(--button-primary-hover);
  }
  
  .edit-section {
    display: flex;
    gap: 8px;
    flex: 1;
  }
  
  .emoji-input {
    flex: 1;
    padding: 8px;
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 14px;
  }
  
  .action-buttons {
    display: flex;
    gap: 8px;
  }
  
  .save-btn, .cancel-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .save-btn {
    background: var(--success-color, #28a745);
    color: white;
  }
  
  .cancel-btn {
    background: var(--danger-color, #dc3545);
    color: white;
  }
  
  .suggestions {
    position: absolute;
    top: calc(100% + 8px);
    left: 12px;
    right: 12px;
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .suggestions-label {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 4px;
  }
  
  .emoji-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    background: var(--background-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .emoji-option:hover {
    background: var(--background-tertiary);
  }
  
  .emoji-option .emoji-display {
    font-size: 20px;
    margin-bottom: 2px;
  }
  
  .emoji-option .emoji-name {
    font-size: 10px;
    color: var(--text-secondary);
  }
</style>