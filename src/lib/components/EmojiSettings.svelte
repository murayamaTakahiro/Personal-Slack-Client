<script lang="ts">
  import { reactionMappings, DEFAULT_REACTION_MAPPINGS } from '../services/reactionService';
  import { settings, updateSettings } from '../stores/settings';
  import type { ReactionMapping } from '../types/slack';
  import { get } from 'svelte/store';
  
  let mappings: ReactionMapping[] = [...get(reactionMappings)];
  let editingIndex: number | null = null;
  let newEmoji = '';
  
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
    { name: 'raised_hands', display: '🙌' }
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
  
  function resetToDefaults() {
    mappings = [...DEFAULT_REACTION_MAPPINGS];
    saveSettings();
  }
  
  async function saveSettings() {
    reactionMappings.set(mappings);
    await updateSettings({
      reactionMappings: mappings
    });
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
    <button class="reset-button" on:click={resetToDefaults}>
      デフォルトに戻す
    </button>
  </div>
  
  <p class="description">
    数字キー（1〜9）で追加・削除できる絵文字をカスタマイズできます
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
  
  .reset-button {
    padding: 8px 16px;
    background: var(--button-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .reset-button:hover {
    background: var(--button-secondary-hover);
  }
  
  .description {
    color: var(--text-secondary);
    margin-bottom: 24px;
    font-size: 14px;
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