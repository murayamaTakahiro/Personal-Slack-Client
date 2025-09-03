<script lang="ts">
  import { reactionMappings, DEFAULT_REACTION_MAPPINGS, reactionService } from '../services/reactionService';
  import { updateSettings, settings } from '../stores/settings';
  import { emojiService, emojiLoading, emojiData } from '../services/emojiService';
  import { emojiSearchService } from '../services/emojiSearchService';
  import type { ReactionMapping } from '../types/slack';
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import EmojiImage from './EmojiImage.svelte';
  
  // Get current mappings from store or use defaults
  let mappings: ReactionMapping[] = [];
  let editingIndex: number | null = null;
  let newEmoji = '';
  let searchQuery = '';
  let emojiGrid: HTMLElement;
  
  // Subscribe to the reaction mappings
  $: mappings = $reactionMappings;
  
  // Global Escape key handler for the emoji selection modal
  function handleGlobalEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && editingIndex !== null) {
      event.preventDefault();
      event.stopPropagation();
      cancelEditing();
    }
  }
  
  // Add/remove global Escape listener when editing state changes
  $: {
    if (editingIndex !== null) {
      document.addEventListener('keydown', handleGlobalEscape);
    } else {
      document.removeEventListener('keydown', handleGlobalEscape);
    }
  }
  
  onMount(() => {
    // Initialize with current settings
    const currentSettings = get(settings);
    if (currentSettings.reactionMappings && currentSettings.reactionMappings.length > 0) {
      mappings = [...currentSettings.reactionMappings];
    } else {
      mappings = [...DEFAULT_REACTION_MAPPINGS];
    }
    
    // Debug: Log what emojis are actually available for the current mappings
    console.log('[EmojiSettings] Current mappings and their availability:');
    mappings.forEach(mapping => {
      const emojiValue = emojiService.getEmoji(mapping.emoji);
      if (!emojiValue) {
        console.warn(`  ❌ "${mapping.emoji}" - NOT FOUND`);
      } else if (emojiValue.startsWith('http')) {
        console.log(`  ✅ "${mapping.emoji}" - Custom emoji with URL`);
      } else {
        console.log(`  ✅ "${mapping.emoji}" - Unicode: ${emojiValue}`);
      }
    });
  });
  
  onDestroy(() => {
    // Clean up global event listener
    document.removeEventListener('keydown', handleGlobalEscape);
  });
  
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
  
  // Function to auto-fix missing emojis
  function autoFixMissingEmojis() {
    let fixedCount = 0;
    const updatedMappings = mappings.map(mapping => {
      const emojiValue = emojiService.getEmoji(mapping.emoji);
      if (!emojiValue) {
        // Try to find a similar emoji using the advanced search service
        const searchResults = emojiSearchService.search(mapping.emoji, 5);
        if (searchResults.length > 0) {
          console.log(`[EmojiSettings] Auto-fixing "${mapping.emoji}" -> "${searchResults[0].name}"`);
          fixedCount++;
          return {
            ...mapping,
            emoji: searchResults[0].name,
            display: searchResults[0].isCustom ? searchResults[0].name : searchResults[0].value
          };
        }
      }
      return mapping;
    });
    
    if (fixedCount > 0) {
      mappings = updatedMappings;
      saveSettings();
      alert(`Auto-fixed ${fixedCount} missing emoji(s)`);
    } else {
      alert('All emojis are already valid!');
    }
  }
  
  // Common emoji suggestions - only include standard Unicode emojis
  // Custom emojis will be shown in the search results when searching
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
  
  // Get popular custom emojis dynamically from the emoji service
  function getPopularCustomEmojis() {
    // Use the new findJapaneseEmojis method to get actual available emojis
    const japaneseEmojis = emojiService.findJapaneseEmojis();
    
    // Also try to find specific emojis if they exist
    const specificNames = [
      'arigataya', 'kakuninshimasu', 'sasuga2', 'ohayougozaimasu',
      'otsukaresamadesu', 'tasukarimasu', 'tasikani', 'yokatta',
      'naruhodo', 'sugoi', 'ganbatte', 'ii'
    ];
    
    const customEmojis = [];
    const addedNames = new Set();
    
    // Add Japanese emojis found (limit to 12)
    for (const emoji of japaneseEmojis.slice(0, 12)) {
      if (!addedNames.has(emoji.name)) {
        customEmojis.push(emoji);
        addedNames.add(emoji.name);
      }
    }
    
    // Try to add specific ones if not already added
    for (const name of specificNames) {
      if (!addedNames.has(name)) {
        const emojiUrl = emojiService.getEmoji(name);
        if (emojiUrl && emojiUrl.startsWith('http')) {
          customEmojis.push({ name, url: emojiUrl });
          addedNames.add(name);
        }
      }
    }
    
    return customEmojis.slice(0, 12); // Limit to 12 emojis
  }
  
  $: popularCustomEmojis = getPopularCustomEmojis();
  
  function startEditing(index: number) {
    editingIndex = index;
    newEmoji = mappings[index].emoji;
    searchQuery = ''; // Clear search query when starting to edit
  }
  
  function cancelEditing() {
    editingIndex = null;
    newEmoji = '';
    searchQuery = ''; // Clear search query when canceling edit
  }
  
  function saveEmoji(index: number) {
    if (newEmoji.trim()) {
      const emojiName = newEmoji.trim().replace(/^:/, '').replace(/:$/, '');
      const emojiValue = emojiService.getEmoji(emojiName);
      
      // For custom emojis, use the same name for both emoji and display
      // For standard emojis, use the unicode for display
      mappings[index] = {
        ...mappings[index],
        emoji: emojiName,
        display: emojiValue && !emojiValue.startsWith('http') ? emojiValue : emojiName
      };
      mappings = [...mappings];
      saveSettings();
    }
    cancelEditing();
  }
  
  function selectEmoji(index: number, emoji: { name: string; display: string }) {
    const emojiValue = emojiService.getEmoji(emoji.name);
    
    // For custom emojis, use the same name for both emoji and display
    // For standard emojis, use the unicode for display
    mappings[index] = {
      ...mappings[index],
      emoji: emoji.name,
      display: emojiValue && !emojiValue.startsWith('http') ? emojiValue : emoji.name
    };
    mappings = [...mappings];
    saveSettings();
    cancelEditing();
  }
  
  function selectCustomEmoji(index: number, emojiName: string) {
    const cleanName = emojiName.replace(/^:/, '').replace(/:$/, '');
    const emojiValue = emojiService.getEmoji(cleanName);
    
    mappings[index] = {
      ...mappings[index],
      emoji: cleanName,
      display: cleanName  // Always use the emoji name for custom emojis
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
    // Save to both the reaction service and settings store
    reactionService.updateMappings(mappings);
    await updateSettings({ reactionMappings: mappings });
    console.log('[EmojiSettings] Saved reaction mappings:', mappings);
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
  
  function handleGridNavigation(event: KeyboardEvent) {
    // Handle Escape key to close the emoji selection modal
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelEditing();
      return;
    }
    
    // Handle Tab key separately for section navigation
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      
      const container = event.currentTarget as HTMLElement;
      const currentElement = document.activeElement as HTMLElement;
      
      // Identify current location
      const isInSearchInput = currentElement.classList.contains('search-input');
      const currentSection = currentElement.closest('.suggestions-section');
      let isInPopularEmojis = false;
      let isInCustomEmojis = false;
      let isInSearchResults = false;
      
      if (currentSection && !isInSearchInput) {
        const sectionLabel = currentSection.querySelector('.suggestions-label');
        if (sectionLabel) {
          const labelText = sectionLabel.textContent || '';
          isInPopularEmojis = labelText.includes('よく使われる');
          isInCustomEmojis = labelText.includes('カスタム');
          isInSearchResults = labelText.includes('検索して選択');
        }
      }
      
      // Get section elements
      const searchInput = container.querySelector('.search-input') as HTMLInputElement;
      const sections = Array.from(container.querySelectorAll('.suggestions-section'));
      const searchResultsSection = sections.find(s => s.querySelector('.suggestions-label')?.textContent?.includes('検索して選択'));
      const popularSection = sections.find(s => s.querySelector('.suggestions-label')?.textContent?.includes('よく使われる'));
      const customSection = sections.find(s => s.querySelector('.suggestions-label')?.textContent?.includes('カスタム'));
      
      // Helper function to focus first emoji in a section
      const focusFirstEmojiInSection = (section: Element | undefined) => {
        if (!section) return false;
        const firstEmoji = section.querySelector('.emoji-option:not([disabled])') as HTMLElement;
        if (firstEmoji) {
          firstEmoji.focus();
          firstEmoji.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return true;
        }
        return false;
      };
      
      // Helper function to focus last emoji in a section
      const focusLastEmojiInSection = (section: Element | undefined) => {
        if (!section) return false;
        const emojis = section.querySelectorAll('.emoji-option:not([disabled])');
        const lastEmoji = emojis[emojis.length - 1] as HTMLElement;
        if (lastEmoji) {
          lastEmoji.focus();
          lastEmoji.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return true;
        }
        return false;
      };
      
      // Determine next focus target
      if (event.shiftKey) {
        // Shift+Tab navigation (backwards)
        if (isInSearchInput) {
          // From search input -> wrap to last section (custom > popular > search results)
          if (!focusLastEmojiInSection(customSection)) {
            if (!focusLastEmojiInSection(popularSection)) {
              focusLastEmojiInSection(searchResultsSection);
            }
          }
        } else if (isInSearchResults) {
          // From search results -> go to search input
          if (searchInput) {
            searchInput.focus();
          }
        } else if (isInPopularEmojis) {
          // From popular emojis -> go to search results (if exists) or search input
          if (searchResultsSection && searchQuery) {
            focusFirstEmojiInSection(searchResultsSection);
          } else if (searchInput) {
            searchInput.focus();
          }
        } else if (isInCustomEmojis) {
          // From custom emojis -> go to popular emojis (if exists) or search results or search input
          if (!focusFirstEmojiInSection(popularSection)) {
            if (searchResultsSection && searchQuery) {
              focusFirstEmojiInSection(searchResultsSection);
            } else if (searchInput) {
              searchInput.focus();
            }
          }
        }
      } else {
        // Tab navigation (forwards)
        if (isInSearchInput) {
          // From search input -> go to first available section
          if (searchResultsSection && searchQuery) {
            focusFirstEmojiInSection(searchResultsSection);
          } else if (!focusFirstEmojiInSection(popularSection)) {
            focusFirstEmojiInSection(customSection);
          }
        } else if (isInSearchResults) {
          // From search results -> go to popular emojis (if exists) or custom emojis or wrap to search input
          if (!focusFirstEmojiInSection(popularSection)) {
            if (!focusFirstEmojiInSection(customSection)) {
              // Wrap back to search input
              if (searchInput) {
                searchInput.focus();
              }
            }
          }
        } else if (isInPopularEmojis) {
          // From popular emojis -> go to custom emojis (if exists) or wrap to search input
          if (!focusFirstEmojiInSection(customSection)) {
            // Wrap back to search input
            if (searchInput) {
              searchInput.focus();
            }
          }
        } else if (isInCustomEmojis) {
          // From custom emojis -> wrap back to search input (focus trap)
          if (searchInput) {
            searchInput.focus();
          }
        }
      }
      
      return;
    }
    
    // Only handle navigation if focus is on an emoji button
    const target = event.target as HTMLElement;
    if (!target.classList.contains('emoji-option')) return;
    
    // Don't interfere with search input
    if (target.tagName === 'INPUT') return;
    
    // Get emojis only from the current section
    const currentSection = target.closest('.suggestions-section');
    if (!currentSection) return;
    
    const sectionButtons = Array.from(currentSection.querySelectorAll('.emoji-option:not([disabled])')) as HTMLElement[];
    const currentIndex = sectionButtons.indexOf(target);
    if (currentIndex === -1) return;
    
    let nextIndex = -1;
    
    // Calculate grid columns for the current section
    const getColumns = () => {
      const sectionGrid = currentSection.querySelector('.emoji-grid');
      if (!sectionGrid) return 4; // Default fallback
      const gridStyle = window.getComputedStyle(sectionGrid);
      const columnTemplate = gridStyle.getPropertyValue('grid-template-columns');
      if (!columnTemplate) return 4;
      const columns = columnTemplate.split(' ').length;
      return columns > 0 ? columns : 4;
    };
    
    const columns = getColumns();
    
    switch (event.key) {
      case 'ArrowLeft':
      case 'h':
      case 'H':
        event.preventDefault();
        // Move left within the current section only
        nextIndex = currentIndex > 0 ? currentIndex - 1 : sectionButtons.length - 1;
        break;
      case 'ArrowRight':
      case 'l':
      case 'L':
        event.preventDefault();
        // Move right within the current section only
        nextIndex = currentIndex < sectionButtons.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
      case 'k':
      case 'K':
        event.preventDefault();
        nextIndex = currentIndex - columns;
        if (nextIndex < 0) {
          // If moving up from first row, wrap to last row same column within section
          const lastRowStart = Math.floor((sectionButtons.length - 1) / columns) * columns;
          const column = currentIndex % columns;
          nextIndex = Math.min(lastRowStart + column, sectionButtons.length - 1);
        }
        break;
      case 'ArrowDown':
      case 'j':
      case 'J':
        event.preventDefault();
        nextIndex = currentIndex + columns;
        if (nextIndex >= sectionButtons.length) {
          // If moving down from last row, wrap to first row same column within section
          nextIndex = currentIndex % columns;
          if (nextIndex >= sectionButtons.length) {
            nextIndex = sectionButtons.length - 1;
          }
        }
        break;
      case 'Home':
        event.preventDefault();
        // Go to first emoji in current section
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        // Go to last emoji in current section
        nextIndex = sectionButtons.length - 1;
        break;
      case 'PageUp':
        event.preventDefault();
        // Move up by 3 rows within current section
        nextIndex = Math.max(0, currentIndex - columns * 3);
        break;
      case 'PageDown':
        event.preventDefault();
        // Move down by 3 rows within current section
        nextIndex = Math.min(sectionButtons.length - 1, currentIndex + columns * 3);
        break;
    }
    
    if (nextIndex >= 0 && nextIndex < sectionButtons.length) {
      sectionButtons[nextIndex].focus();
      sectionButtons[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
</script>

<div class="emoji-settings">
  <div class="header">
    <h3>絵文字リアクション設定</h3>
    <div class="header-buttons">
      <button class="auto-fix-button" on:click={autoFixMissingEmojis} title="Find and fix missing emojis">
        🔧 Auto-Fix
      </button>
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
      <div class="mapping-item" class:editing={editingIndex === index}>
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
          
          <div class="suggestions" on:keydown={handleGridNavigation}>
            <div class="suggestions-section">
              <p class="suggestions-label">検索して選択:</p>
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="絵文字名で検索..."
                class="search-input"
              />
              {#if searchQuery}
                {@const searchResults = emojiSearchService.search(searchQuery, 12)}
                {#if searchResults.length > 0}
                  <div class="emoji-grid" bind:this={emojiGrid}>
                    {#each searchResults as result}
                      <button
                        class="emoji-option"
                        on:click={() => selectCustomEmoji(index, result.name)}
                        title="{result.name}{result.matchedOn ? ' (matched: ' + result.matchedOn + ')' : ''}"
                      >
                        <span class="emoji-display">
                          {#if result.value.startsWith('http')}
                            <EmojiImage emoji={result.name} url={result.value} size="small" />
                          {:else}
                            {result.value}
                          {/if}
                        </span>
                        <span class="emoji-name">{result.name}</span>
                        {#if result.matchType !== 'exact'}
                          <span class="match-type">{result.matchType}</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <p class="no-results">絵文字が見つかりません</p>
                {/if}
              {/if}
            </div>
            
            <div class="suggestions-section">
              <p class="suggestions-label">よく使われる絵文字:</p>
              <div class="emoji-grid" bind:this={emojiGrid}>
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
            
            {#if popularCustomEmojis.length > 0}
              <div class="suggestions-section">
                <p class="suggestions-label">カスタム絵文字:</p>
                <div class="emoji-grid" bind:this={emojiGrid}>
                  {#each popularCustomEmojis as emoji}
                    <button
                      class="emoji-option"
                      on:click={() => selectCustomEmoji(index, emoji.name)}
                      title={emoji.name}
                    >
                      <span class="emoji-display">
                        <EmojiImage emoji={emoji.name} url={emoji.url} size="small" />
                      </span>
                      <span class="emoji-name">{emoji.name}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="navigation-hint">
              💡 ナビゲーション: Tab(セクション切替) | 矢印キー(↑↓←→) または HJKL | Home/End | PageUp/Down
            </div>
          </div>
        {:else}
          {@const emojiValue = emojiService.getEmoji(mapping.emoji)}
          <div class="current-emoji">
            <span class="emoji-display">
              {#if emojiValue && emojiValue.startsWith('http')}
                <EmojiImage emoji={mapping.emoji} url={emojiValue} size="medium" />
              {:else if emojiValue}
                {emojiValue}
              {:else}
                :{mapping.emoji}:
              {/if}
            </span>
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
  
  .reset-button, .reload-button, .refresh-emoji-button, .auto-fix-button {
    padding: 8px 16px;
    background: var(--button-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .reset-button:hover, .reload-button:hover, .refresh-emoji-button:hover:not(:disabled), .auto-fix-button:hover {
    background: var(--button-secondary-hover);
  }
  
  .auto-fix-button {
    background: #ff9800;
    color: white;
    border: none;
  }
  
  .auto-fix-button:hover {
    background: #f57c00;
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
  
  .mapping-item.editing {
    margin-bottom: 420px; /* Add space for the suggestions popup when editing */
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
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 400px;
    overflow-y: auto;
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
  
  .emoji-option .match-type {
    font-size: 8px;
    color: var(--text-tertiary);
    background: var(--bg-hover);
    padding: 1px 3px;
    border-radius: 2px;
    margin-top: 2px;
  }
  
  .suggestions-section {
    margin-bottom: 16px;
  }
  
  .suggestions-section:last-child {
    margin-bottom: 0;
  }
  
  .search-input {
    width: 100%;
    padding: 8px;
    margin-bottom: 8px;
    background: var(--background-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 14px;
  }
  
  .no-results {
    text-align: center;
    color: var(--text-secondary);
    padding: 12px;
    font-size: 14px;
  }
  
  /* Scrollbar styling for suggestions popup */
  .suggestions::-webkit-scrollbar {
    width: 8px;
  }
  
  .suggestions::-webkit-scrollbar-track {
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 4px;
  }
  
  .suggestions::-webkit-scrollbar-thumb {
    background: var(--border-color, #ddd);
    border-radius: 4px;
  }
  
  .suggestions::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary, #666);
  }
  
  .navigation-hint {
    margin-top: 12px;
    padding: 8px;
    background: var(--background-tertiary, #f5f5f5);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary);
    text-align: center;
  }
</style>