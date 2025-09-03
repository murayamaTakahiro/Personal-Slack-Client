<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { emojiSearchService, type EmojiSearchResult } from '../services/emojiSearchService';
  import { emojiService } from '../services/emojiService';
  import EmojiImage from './EmojiImage.svelte';
  import { fade, fly } from 'svelte/transition';
  
  export let isOpen = false;
  
  const dispatch = createEventDispatcher();
  
  let searchQuery = '';
  let searchResults: EmojiSearchResult[] = [];
  let selectedIndex = 0;
  let searchInput: HTMLInputElement;
  let suggestions: string[] = [];
  let showTips = false;
  let activeTab: 'search' | 'browse' | 'recent' = 'search';
  let categories = ['greetings', 'thanks', 'work', 'emotions', 'gestures', 'celebrations'];
  let selectedCategory = '';
  let showHelp = false;
  let gridElement: HTMLDivElement;
  
  const searchTips = emojiSearchService.getSearchTips();
  
  // Example searches for help
  const exampleSearches = [
    { query: 'bow', description: 'Finds おじぎ (ojigi) emojis' },
    { query: 'arigatou', description: 'Finds ありがとう thank you emojis' },
    { query: 'gm', description: 'Finds good morning emojis' },
    { query: 'tsuka', description: 'Finds 助かります (tasukarimasu)' },
    { query: 'confirm', description: 'Finds 確認 (kakunin) emojis' }
  ];
  
  $: if (isOpen) {
    searchQuery = '';
    searchResults = emojiSearchService.search('', 30);
    selectedIndex = 0;
    showTips = false;
    activeTab = 'search';
  }
  
  $: if (searchQuery) {
    searchResults = emojiSearchService.search(searchQuery);
    suggestions = emojiSearchService.getSuggestions(searchQuery);
    selectedIndex = 0;
  } else {
    searchResults = emojiSearchService.search('', 30);
    suggestions = [];
  }
  
  $: if (selectedCategory) {
    searchResults = emojiSearchService.search(selectedCategory);
  }
  
  function selectEmoji(emoji: EmojiSearchResult) {
    emojiSearchService.updateFrequency(emoji.name);
    dispatch('select', { 
      emoji: emoji.name,
      value: emoji.value,
      isCustom: emoji.isCustom 
    });
    close();
  }
  
  function close() {
    isOpen = false;
    searchQuery = '';
    selectedCategory = '';
    showHelp = false;
    dispatch('close');
  }
  
  function getGridColumns(): number {
    if (!gridElement) return 8; // Default fallback
    
    // Get the first emoji button to measure column width
    const firstButton = gridElement.querySelector('.emoji-result');
    if (!firstButton) return 8;
    
    const gridWidth = gridElement.offsetWidth;
    const buttonWidth = firstButton.offsetWidth;
    const gap = 8; // Gap between items (0.5rem = 8px)
    
    // Calculate how many columns fit
    return Math.floor((gridWidth + gap) / (buttonWidth + gap)) || 8;
  }
  
  function handleKeydown(event: KeyboardEvent) {
    // Handle Tab key separately for section navigation
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      handleTabNavigation(event.shiftKey);
      return;
    }
    
    // Handle Escape key globally
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    
    // Get current element context
    const currentElement = document.activeElement as HTMLElement;
    const isInGrid = currentElement?.classList.contains('emoji-result');
    const isInSearchInput = currentElement?.classList.contains('search-input');
    const isInTab = currentElement?.classList.contains('tab');
    const isInCategory = currentElement?.classList.contains('category-button');
    
    // Handle arrow navigation in tabs
    if (isInTab) {
      handleTabButtonNavigation(event);
      return;
    }
    
    // Handle arrow navigation in categories
    if (isInCategory) {
      handleCategoryButtonNavigation(event);
      return;
    }
    
    // Handle Enter key in search input
    if (isInSearchInput && event.key === 'Enter') {
      event.preventDefault();
      if (searchResults[selectedIndex]) {
        selectEmoji(searchResults[selectedIndex]);
      }
      return;
    }
    
    // Only handle grid navigation if focus is in the emoji grid
    if (!isInGrid) {
      return;
    }
    
    // Grid navigation logic (only when focus is in grid)
    handleGridNavigation(event);
  }
  
  function handleTabButtonNavigation(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    
    event.preventDefault();
    const tabs = ['search', 'browse', 'recent'];
    const currentIndex = tabs.indexOf(activeTab);
    
    if (event.key === 'ArrowLeft') {
      activeTab = tabs[currentIndex > 0 ? currentIndex - 1 : tabs.length - 1];
    } else {
      activeTab = tabs[currentIndex < tabs.length - 1 ? currentIndex + 1 : 0];
    }
    
    // Focus the newly active tab
    setTimeout(() => {
      const newActiveTab = document.querySelector('.tab.active') as HTMLElement;
      if (newActiveTab) newActiveTab.focus();
    }, 10);
  }
  
  function handleCategoryButtonNavigation(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    
    event.preventDefault();
    const currentButton = document.activeElement as HTMLElement;
    const allButtons = Array.from(document.querySelectorAll('.category-button')) as HTMLElement[];
    const currentIndex = allButtons.indexOf(currentButton);
    
    let nextIndex: number;
    if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : allButtons.length - 1;
    } else {
      nextIndex = currentIndex < allButtons.length - 1 ? currentIndex + 1 : 0;
    }
    
    if (allButtons[nextIndex]) {
      allButtons[nextIndex].focus();
      allButtons[nextIndex].click();
    }
  }
  
  function handleGridNavigation(event: KeyboardEvent) {
    const columns = getGridColumns();
    const totalItems = searchResults.length;
    
    // Handle vim-style navigation (convert to arrow keys)
    let key = event.key;
    if (!event.ctrlKey && !event.altKey && !event.metaKey) {
      switch (key.toLowerCase()) {
        case 'h': key = 'ArrowLeft'; break;
        case 'j': key = 'ArrowDown'; break;
        case 'k': key = 'ArrowUp'; break;
        case 'l': key = 'ArrowRight'; break;
      }
    }
    
    switch (key) {
      case 'Enter':
        event.preventDefault();
        if (searchResults[selectedIndex]) {
          selectEmoji(searchResults[selectedIndex]);
        }
        break;
        
      case 'ArrowUp': {
        event.preventDefault();
        const newIndex = selectedIndex - columns;
        if (newIndex >= 0) {
          selectedIndex = newIndex;
        } else {
          // Move to top row, same column
          selectedIndex = selectedIndex % columns;
        }
        scrollToSelected();
        break;
      }
      
      case 'ArrowDown': {
        event.preventDefault();
        const newIndex = selectedIndex + columns;
        if (newIndex < totalItems) {
          selectedIndex = newIndex;
        } else {
          // Move to last row, same column or last item
          const currentColumn = selectedIndex % columns;
          const lastRowStart = Math.floor((totalItems - 1) / columns) * columns;
          selectedIndex = Math.min(lastRowStart + currentColumn, totalItems - 1);
        }
        scrollToSelected();
        break;
      }
      
      case 'ArrowLeft': {
        event.preventDefault();
        if (selectedIndex > 0) {
          selectedIndex--;
        } else {
          // Wrap to end
          selectedIndex = totalItems - 1;
        }
        scrollToSelected();
        break;
      }
      
      case 'ArrowRight': {
        event.preventDefault();
        if (selectedIndex < totalItems - 1) {
          selectedIndex++;
        } else {
          // Wrap to beginning
          selectedIndex = 0;
        }
        scrollToSelected();
        break;
      }
      
      case 'Home': {
        event.preventDefault();
        selectedIndex = 0;
        scrollToSelected();
        break;
      }
      
      case 'End': {
        event.preventDefault();
        selectedIndex = totalItems - 1;
        scrollToSelected();
        break;
      }
      
      case 'PageUp': {
        event.preventDefault();
        // Move up by 3 rows
        const newIndex = selectedIndex - (columns * 3);
        selectedIndex = Math.max(0, newIndex);
        scrollToSelected();
        break;
      }
      
      case 'PageDown': {
        event.preventDefault();
        // Move down by 3 rows
        const newIndex = selectedIndex + (columns * 3);
        selectedIndex = Math.min(totalItems - 1, newIndex);
        scrollToSelected();
        break;
      }
    }
  }
  
  function handleTabNavigation(isShiftTab: boolean) {
    const currentElement = document.activeElement as HTMLElement;
    const dialogElement = document.querySelector('.emoji-search-dialog') as HTMLElement;
    if (!dialogElement) return;
    
    // Define the navigation order for different tabs
    const navigationOrder = getNavigationOrder();
    
    // Find current index in navigation order
    let currentIndex = -1;
    for (let i = 0; i < navigationOrder.length; i++) {
      if (navigationOrder[i] === currentElement) {
        currentIndex = i;
        break;
      }
    }
    
    // If current element is not in navigation order, try to find the section it's in
    if (currentIndex === -1) {
      const isInGrid = currentElement?.classList.contains('emoji-result');
      const isInTab = currentElement?.classList.contains('tab');
      const isInCategory = currentElement?.classList.contains('category-button');
      const isInSuggestion = currentElement?.classList.contains('suggestion');
      const isInExample = currentElement?.classList.contains('example-search');
      const isInHelp = currentElement?.classList.contains('help-button');
      
      // Map grid/other elements to their section in navigation order
      if (isInGrid) {
        const grid = dialogElement.querySelector('.emoji-grid') as HTMLElement;
        currentIndex = navigationOrder.indexOf(grid);
      } else if (isInTab) {
        const tabs = dialogElement.querySelector('.dialog-tabs') as HTMLElement;
        currentIndex = navigationOrder.indexOf(tabs);
      } else if (isInCategory) {
        const categories = dialogElement.querySelector('.category-buttons') as HTMLElement;
        currentIndex = navigationOrder.indexOf(categories);
      } else if (isInSuggestion || isInExample || isInHelp) {
        // These are part of the search section, move from search input
        const searchInput = dialogElement.querySelector('.search-input') as HTMLElement;
        currentIndex = navigationOrder.indexOf(searchInput);
      }
    }
    
    // Calculate next index with wrapping
    let nextIndex: number;
    if (isShiftTab) {
      nextIndex = currentIndex <= 0 ? navigationOrder.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex >= navigationOrder.length - 1 ? 0 : currentIndex + 1;
    }
    
    // Focus next element
    const nextElement = navigationOrder[nextIndex];
    if (nextElement) {
      // Special handling for sections
      if (nextElement.classList.contains('dialog-tabs')) {
        // Focus active tab
        const activeTab = nextElement.querySelector('.tab.active') as HTMLElement;
        if (activeTab) activeTab.focus();
      } else if (nextElement.classList.contains('emoji-grid')) {
        // Focus selected emoji in grid
        const selectedEmoji = nextElement.querySelector('.emoji-result.selected') as HTMLElement;
        if (selectedEmoji) {
          selectedEmoji.focus();
        } else {
          const firstEmoji = nextElement.querySelector('.emoji-result') as HTMLElement;
          if (firstEmoji) {
            firstEmoji.focus();
            selectedIndex = 0;
          }
        }
      } else if (nextElement.classList.contains('category-buttons')) {
        // Focus active or first category
        const activeCategory = nextElement.querySelector('.category-button.active') as HTMLElement;
        if (activeCategory) {
          activeCategory.focus();
        } else {
          const firstCategory = nextElement.querySelector('.category-button') as HTMLElement;
          if (firstCategory) firstCategory.focus();
        }
      } else {
        nextElement.focus();
      }
    }
  }
  
  function getNavigationOrder(): HTMLElement[] {
    const dialogElement = document.querySelector('.emoji-search-dialog') as HTMLElement;
    if (!dialogElement) return [];
    
    const elements: HTMLElement[] = [];
    
    // Add elements in tab order
    // 1. Search input (if in search tab)
    if (activeTab === 'search') {
      const searchInput = dialogElement.querySelector('.search-input') as HTMLElement;
      if (searchInput) elements.push(searchInput);
    }
    
    // 2. Tab buttons
    const tabSection = dialogElement.querySelector('.dialog-tabs') as HTMLElement;
    if (tabSection) elements.push(tabSection);
    
    // 3. Category buttons (if in browse tab)
    if (activeTab === 'browse') {
      const categorySection = dialogElement.querySelector('.category-buttons') as HTMLElement;
      if (categorySection) elements.push(categorySection);
    }
    
    // 4. Emoji grid (if has results)
    const emojiGrid = dialogElement.querySelector('.emoji-grid') as HTMLElement;
    if (emojiGrid && searchResults.length > 0) {
      elements.push(emojiGrid);
    }
    
    // 5. Close button
    const closeButton = dialogElement.querySelector('.close-button') as HTMLElement;
    if (closeButton) elements.push(closeButton);
    
    return elements;
  }
  
  function scrollToSelected() {
    const element = document.querySelector('.emoji-result.selected');
    if (element) {
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  
  function tryExampleSearch(query: string) {
    searchQuery = query;
    showHelp = false;
  }
  
  function handleClickOutside(event: MouseEvent) {
    const dialog = document.querySelector('.emoji-search-dialog');
    if (dialog && !dialog.contains(event.target as Node)) {
      close();
    }
  }
  
  // Focus trap implementation
  let previousFocus: HTMLElement | null = null;
  
  function setupFocusTrap() {
    // Store the previously focused element
    previousFocus = document.activeElement as HTMLElement;
    
    // Focus search input when dialog opens
    setTimeout(() => {
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }
  
  function cleanupFocusTrap() {
    // Restore focus to previous element when dialog closes
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus();
    }
    previousFocus = null;
  }
  
  // Setup/cleanup focus trap when dialog opens/closes
  $: if (isOpen) {
    setupFocusTrap();
  } else {
    cleanupFocusTrap();
  }
  
  onMount(() => {
    if (isOpen && searchInput) {
      searchInput.focus();
    }
    document.addEventListener('click', handleClickOutside);
    
    // Rebuild index when component mounts to get latest emojis
    emojiSearchService.rebuildIndex();
  });
  
  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
    cleanupFocusTrap();
  });
</script>

{#if isOpen}
  <div class="emoji-search-backdrop" transition:fade={{ duration: 200 }}>
    <div 
      class="emoji-search-dialog"
      transition:fly={{ y: -20, duration: 300 }}
      on:keydown={handleKeydown}
    >
      <div class="dialog-header">
        <h2>Find Emoji</h2>
        <button class="close-button" on:click={close}>×</button>
      </div>
      
      <div class="dialog-tabs">
        <button 
          class="tab" 
          class:active={activeTab === 'search'}
          on:click={() => activeTab = 'search'}
        >
          Search
        </button>
        <button 
          class="tab" 
          class:active={activeTab === 'browse'}
          on:click={() => activeTab = 'browse'}
        >
          Browse
        </button>
        <button 
          class="tab" 
          class:active={activeTab === 'recent'}
          on:click={() => activeTab = 'recent'}
        >
          Recent
        </button>
      </div>
      
      {#if activeTab === 'search'}
        <div class="search-section">
          <div class="search-input-wrapper">
            <input
              type="text"
              class="search-input"
              placeholder="Search by name, English, romaji, or category..."
              bind:value={searchQuery}
              bind:this={searchInput}
              on:focus={() => showTips = true}
            />
            <button 
              class="help-button"
              on:click={() => showHelp = !showHelp}
              title="Search help"
            >
              ?
            </button>
          </div>
          
          {#if suggestions.length > 0 && searchQuery}
            <div class="suggestions">
              {#each suggestions as suggestion}
                <button 
                  class="suggestion"
                  on:click={() => searchQuery = suggestion}
                >
                  {suggestion}
                </button>
              {/each}
            </div>
          {/if}
          
          {#if showHelp}
            <div class="help-section" transition:fly={{ y: -10, duration: 200 }}>
              <h3>Search Tips</h3>
              <ul class="tips-list">
                {#each searchTips as tip}
                  <li>{tip}</li>
                {/each}
              </ul>
              
              <h3>Try These Searches</h3>
              <div class="example-searches">
                {#each exampleSearches as example}
                  <button 
                    class="example-search"
                    on:click={() => tryExampleSearch(example.query)}
                  >
                    <span class="example-query">"{example.query}"</span>
                    <span class="example-description">{example.description}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          
          <div class="search-results">
            {#if searchResults.length > 0}
              <div class="results-header">
                {searchQuery ? `Found ${searchResults.length} results` : 'Popular emojis'}
              </div>
              <div class="emoji-grid" bind:this={gridElement}>
                {#each searchResults as result, index}
                  <button
                    class="emoji-result"
                    class:selected={index === selectedIndex}
                    on:click={() => selectEmoji(result)}
                    on:mouseenter={() => selectedIndex = index}
                    title={`${result.name}${result.matchedOn ? ` (matched: ${result.matchedOn})` : ''}`}
                  >
                    <div class="emoji-display">
                      {#if result.isCustom}
                        <EmojiImage emoji={result.name} url={result.value} size="large" />
                      {:else}
                        <span class="emoji-unicode">{result.value}</span>
                      {/if}
                    </div>
                    <div class="emoji-name">{result.name}</div>
                    {#if result.matchType && result.matchType !== 'exact'}
                      <div class="match-type">{result.matchType}</div>
                    {/if}
                  </button>
                {/each}
              </div>
            {:else if searchQuery}
              <div class="no-results">
                <p>No emojis found for "{searchQuery}"</p>
                <p class="help-text">Try searching in English or romaji</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}
      
      {#if activeTab === 'browse'}
        <div class="browse-section">
          <div class="category-buttons">
            {#each categories as category}
              <button
                class="category-button"
                class:active={selectedCategory === category}
                on:click={() => selectedCategory = category}
              >
                {category}
              </button>
            {/each}
          </div>
          
          <div class="emoji-grid" bind:this={gridElement}>
            {#each searchResults as result, index}
              <button
                class="emoji-result"
                class:selected={index === selectedIndex}
                on:click={() => selectEmoji(result)}
                on:mouseenter={() => selectedIndex = index}
                title={result.name}
              >
                <div class="emoji-display">
                  {#if result.isCustom}
                    <EmojiImage emoji={result.name} url={result.value} size="large" />
                  {:else}
                    <span class="emoji-unicode">{result.value}</span>
                  {/if}
                </div>
                <div class="emoji-name">{result.name}</div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
      
      {#if activeTab === 'recent'}
        <div class="recent-section">
          <p class="help-text">Recently used emojis will appear here</p>
          <div class="emoji-grid">
            <!-- This would be populated from a recent emojis store -->
          </div>
        </div>
      {/if}
      
      <div class="dialog-footer">
        <div class="footer-hint">
          <span>Tab to navigate sections</span> • 
          <span>Arrow keys or HJKL in grid</span> • 
          <span>Enter to select</span> • 
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .emoji-search-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .emoji-search-dialog {
    background: var(--bg-primary);
    border-radius: 12px;
    width: 90%;
    max-width: 720px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }
  
  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  
  .dialog-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }
  
  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }
  
  .close-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .dialog-tabs {
    display: flex;
    padding: 0 1.25rem;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  
  .tab {
    background: none;
    border: none;
    padding: 0.75rem 1rem;
    color: var(--text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  
  .tab:hover {
    color: var(--text-primary);
  }
  
  .tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }
  
  .search-section,
  .browse-section,
  .recent-section {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }
  
  .search-input-wrapper {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .search-input {
    flex: 1;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 1rem;
  }
  
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-bg);
  }
  
  .help-button {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    width: 40px;
    transition: all 0.2s;
  }
  
  .help-button:hover {
    background: var(--primary-bg);
    color: var(--primary);
    border-color: var(--primary);
  }
  
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .suggestion {
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 16px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }
  
  .suggestion:hover {
    background: var(--primary-bg);
    color: var(--primary);
    border-color: var(--primary);
  }
  
  .help-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .help-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .tips-list {
    margin: 0 0 1rem 0;
    padding-left: 1.25rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }
  
  .example-searches {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .example-search {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .example-search:hover {
    background: var(--primary-bg);
    border-color: var(--primary);
  }
  
  .example-query {
    font-family: monospace;
    color: var(--primary);
    font-size: 0.875rem;
  }
  
  .example-description {
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }
  
  .results-header {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }
  
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.5rem;
  }
  
  .emoji-result {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem 0.5rem;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .emoji-result:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }
  
  .emoji-result.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
  }
  
  .emoji-display {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.25rem;
  }
  
  .emoji-unicode {
    font-size: 2rem;
  }
  
  .emoji-name {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: center;
    word-break: break-all;
    max-width: 100%;
  }
  
  .match-type {
    font-size: 0.625rem;
    color: var(--primary);
    background: var(--primary-bg);
    padding: 2px 4px;
    border-radius: 3px;
    margin-top: 0.25rem;
  }
  
  .no-results {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }
  
  .help-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-top: 0.5rem;
  }
  
  .category-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .category-button {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-secondary);
    cursor: pointer;
    text-transform: capitalize;
    transition: all 0.2s;
  }
  
  .category-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .category-button.active {
    background: var(--primary-bg);
    color: var(--primary);
    border-color: var(--primary);
  }
  
  .dialog-footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    border-radius: 0 0 12px 12px;
  }
  
  .footer-hint {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    text-align: center;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  
  .footer-hint span {
    white-space: nowrap;
  }
  
  /* Scrollbar styling */
  .search-section::-webkit-scrollbar,
  .browse-section::-webkit-scrollbar,
  .recent-section::-webkit-scrollbar {
    width: 8px;
  }
  
  .search-section::-webkit-scrollbar-track,
  .browse-section::-webkit-scrollbar-track,
  .recent-section::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 4px;
  }
  
  .search-section::-webkit-scrollbar-thumb,
  .browse-section::-webkit-scrollbar-thumb,
  .recent-section::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }
  
  .search-section::-webkit-scrollbar-thumb:hover,
  .browse-section::-webkit-scrollbar-thumb:hover,
  .recent-section::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
</style>