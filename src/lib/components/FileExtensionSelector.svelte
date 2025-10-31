<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { FILE_EXTENSION_GROUPS, type ExtensionGroup } from '../constants/fileExtensions';
  import { accessKeyService } from '../services/accessKeyService';

  export let id: string = '';
  export let selectedExtensions: string[] = [];

  const dispatch = createEventDispatcher();

  let accessKeyRegistrations: string[] = [];
  let showDropdown = false;
  let searchInput = '';
  let dropdownElement: HTMLDivElement;
  let inputElement: HTMLInputElement;
  let highlightedIndex = -1;
  let expandedGroups: Set<string> = new Set();

  // Filter groups and extensions based on search
  $: filteredGroups = searchInput
    ? FILE_EXTENSION_GROUPS.map(group => ({
        ...group,
        extensions: group.extensions.filter(ext =>
          ext.toLowerCase().includes(searchInput.toLowerCase())
        )
      })).filter(group =>
        group.extensions.length > 0 ||
        group.label.toLowerCase().includes(searchInput.toLowerCase())
      )
    : FILE_EXTENSION_GROUPS;

  // Check if a group is fully selected
  function isGroupFullySelected(group: ExtensionGroup): boolean {
    if (group.id === 'other' || group.extensions.length === 0) return false;
    return group.extensions.every(ext => selectedExtensions.includes(ext));
  }

  // Check if a group is partially selected
  function isGroupPartiallySelected(group: ExtensionGroup): boolean {
    if (group.id === 'other' || group.extensions.length === 0) return false;
    const selectedCount = group.extensions.filter(ext => selectedExtensions.includes(ext)).length;
    return selectedCount > 0 && selectedCount < group.extensions.length;
  }

  // Toggle entire group selection
  function toggleGroup(group: ExtensionGroup) {
    if (group.id === 'other' || group.extensions.length === 0) return;

    if (isGroupFullySelected(group)) {
      // Deselect all extensions in this group
      selectedExtensions = selectedExtensions.filter(ext => !group.extensions.includes(ext));
    } else {
      // Select all extensions in this group
      const newExtensions = group.extensions.filter(ext => !selectedExtensions.includes(ext));
      selectedExtensions = [...selectedExtensions, ...newExtensions];
    }
    dispatch('change', selectedExtensions);
  }

  // Toggle individual extension
  function toggleExtension(extension: string) {
    if (selectedExtensions.includes(extension)) {
      selectedExtensions = selectedExtensions.filter(ext => ext !== extension);
    } else {
      selectedExtensions = [...selectedExtensions, extension];
    }
    dispatch('change', selectedExtensions);
  }

  // Remove extension from selection (used in chips)
  function removeExtension(extension: string) {
    selectedExtensions = selectedExtensions.filter(ext => ext !== extension);
    dispatch('change', selectedExtensions);
  }

  // Toggle group expansion
  function toggleGroupExpansion(groupId: string) {
    if (expandedGroups.has(groupId)) {
      expandedGroups.delete(groupId);
    } else {
      expandedGroups.add(groupId);
    }
    expandedGroups = expandedGroups; // Trigger reactivity
  }

  // Clear all selections
  export function clearSelection() {
    selectedExtensions = [];
    searchInput = '';
    dispatch('change', selectedExtensions);
    dispatch('clear');
  }

  function handleInputFocus() {
    showDropdown = true;
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    searchInput = target.value;
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      showDropdown = false;
      searchInput = '';
      inputElement?.blur();
      highlightedIndex = -1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();

      // If a group is highlighted, toggle its selection
      if (highlightedIndex >= 0 && highlightedIndex < filteredGroups.length) {
        const group = filteredGroups[highlightedIndex];
        if (group.id !== 'other' && group.extensions.length > 0) {
          toggleGroup(group);
        }
      } else {
        // Close dropdown if nothing is highlighted
        showDropdown = false;
        inputElement?.blur();
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      // Open dropdown if not already open
      if (!showDropdown) {
        showDropdown = true;
      }

      const groups = filteredGroups.filter(g => g.extensions.length > 0);
      if (groups.length === 0) return;

      if (event.key === 'ArrowDown') {
        highlightedIndex = highlightedIndex < 0 ? 0 : Math.min(highlightedIndex + 1, groups.length - 1);
      } else {
        highlightedIndex = highlightedIndex <= 0 ? groups.length - 1 : highlightedIndex - 1;
      }

      // Scroll highlighted item into view
      scrollHighlightedIntoView();
    }
  }

  function scrollHighlightedIntoView() {
    if (highlightedIndex < 0) return;

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      const highlightedElement = dropdownElement?.querySelector('.group-item.highlighted');
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  function handleDropdownKeydown(event: KeyboardEvent) {
    // Handle keyboard navigation within dropdown
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      const groups = filteredGroups.filter(g => g.extensions.length > 0);
      if (groups.length === 0) return;

      if (event.key === 'ArrowDown') {
        highlightedIndex = highlightedIndex < 0 ? 0 : Math.min(highlightedIndex + 1, groups.length - 1);
      } else {
        highlightedIndex = highlightedIndex <= 0 ? groups.length - 1 : highlightedIndex - 1;
      }

      scrollHighlightedIntoView();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();

      // Toggle highlighted group
      if (highlightedIndex >= 0 && highlightedIndex < filteredGroups.length) {
        const group = filteredGroups[highlightedIndex];
        if (group.id !== 'other' && group.extensions.length > 0) {
          toggleGroup(group);
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      showDropdown = false;
      highlightedIndex = -1;
      inputElement?.focus();
    } else if (event.key === 'Tab') {
      // Allow Tab to close dropdown and move focus
      showDropdown = false;
      highlightedIndex = -1;
    }
  }

  function setupAccessKeys() {
    const registrations: string[] = [];

    // F: Toggle dropdown
    const id = accessKeyService.register('F', inputElement, () => {
      if (showDropdown) {
        showDropdown = false;
        inputElement?.blur();
      } else {
        showDropdown = true;
        inputElement?.focus();
      }
    }, 10);
    if (id) registrations.push(id);

    accessKeyRegistrations = registrations;
  }

  function cleanupAccessKeys() {
    accessKeyRegistrations.forEach(id => {
      accessKeyService.unregister(id);
    });
    accessKeyRegistrations = [];
  }

  onMount(() => {
    function handleClickOutside(event: MouseEvent) {
      if (inputElement && !inputElement.contains(event.target as Node) &&
          dropdownElement && !dropdownElement.contains(event.target as Node)) {
        showDropdown = false;
      }
    }

    document.addEventListener('click', handleClickOutside);
    setupAccessKeys();

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  onDestroy(() => {
    cleanupAccessKeys();
  });
</script>

<div class="file-extension-selector" {id}>
  <div class="selector-container">
    <div class="input-wrapper">
      <input
        bind:this={inputElement}
        bind:value={searchInput}
        on:focus={handleInputFocus}
        on:input={handleInput}
        on:keydown={handleInputKeydown}
        type="text"
        placeholder={selectedExtensions.length > 0
          ? `Search to add more (${selectedExtensions.length} selected)`
          : 'Select file type'}
        class="file-input"
        class:has-selection={selectedExtensions.length > 0}
        autocomplete="off"
      />

      {#if selectedExtensions.length > 0}
        <button
          on:click={clearSelection}
          class="clear-btn"
          title="Clear all selections"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>

    <div class="selector-controls">
      <span class="control-label">
        {selectedExtensions.length} selected
      </span>
    </div>
  </div>

  {#if selectedExtensions.length > 0}
    <div class="selected-extensions">
      <span class="selected-label">Selected file types:</span>
      {#each selectedExtensions as ext}
        <span class="selected-tag">
          .{ext}
          <button
            on:click={() => removeExtension(ext)}
            class="remove-tag"
            title="Remove {ext}"
          >
            ×
          </button>
        </span>
      {/each}
    </div>
  {/if}

  {#if showDropdown}
    <div
      bind:this={dropdownElement}
      class="dropdown"
      role="listbox"
      tabindex="-1"
      on:keydown={handleDropdownKeydown}
      aria-label="File type groups"
    >
      <div class="dropdown-header">
        <span class="header-title">📎 File Types</span>
        {#if selectedExtensions.length > 0}
          <button
            class="clear-all-btn"
            on:click={clearSelection}
          >
            Clear All
          </button>
        {/if}
      </div>

      <div class="groups-list">
        {#each filteredGroups as group, index (group.id)}
          {@const isFullySelected = isGroupFullySelected(group)}
          {@const isPartiallySelected = isGroupPartiallySelected(group)}
          {@const isExpanded = expandedGroups.has(group.id)}

          <div
            class="group-item"
            class:highlighted={index === highlightedIndex}
            role="option"
            aria-selected={isFullySelected}
            aria-label={`${group.label} file type group`}
          >
            <div class="group-header">
              <button
                class="group-toggle"
                on:click={() => toggleGroup(group)}
                on:keydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleGroup(group);
                  }
                }}
                class:selected={isFullySelected}
                class:partial={isPartiallySelected}
                disabled={group.id === 'other' || group.extensions.length === 0}
                tabindex="-1"
                aria-label={`${isFullySelected ? 'Deselect' : 'Select'} all ${group.label} file types`}
              >
                <span class="checkbox">
                  {#if isFullySelected}
                    ☑
                  {:else if isPartiallySelected}
                    ◐
                  {:else}
                    ☐
                  {/if}
                </span>
                <span class="icon">{group.icon}</span>
                <span class="label">{group.label}</span>
                {#if group.extensions.length > 0}
                  <span class="count">({group.extensions.length})</span>
                {/if}
              </button>

              {#if group.extensions.length > 0}
                <button
                  class="expand-btn"
                  on:click={() => toggleGroupExpansion(group.id)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              {/if}
            </div>

            {#if isExpanded && group.extensions.length > 0}
              <div class="extensions-list">
                {#each group.extensions as ext (ext)}
                  <button
                    class="extension-item"
                    class:selected={selectedExtensions.includes(ext)}
                    on:click={() => toggleExtension(ext)}
                  >
                    <span class="ext-checkbox">
                      {selectedExtensions.includes(ext) ? '☑' : '☐'}
                    </span>
                    <span class="ext-name">.{ext}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      {#if filteredGroups.length === 0}
        <div class="no-results">
          No file types found
        </div>
      {/if}

      <div class="dropdown-footer">
        <div class="help-text">
          Click groups to select all extensions, or expand to select individual ones
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .file-extension-selector {
    position: relative;
    width: 100%;
  }

  .selector-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .input-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .file-input {
    width: 100%;
    padding: 0.5rem;
    padding-right: 2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .file-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .file-input.has-selection {
    background: var(--primary-bg);
    border-color: var(--primary);
    font-weight: 500;
  }

  .clear-btn {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    color: var(--text-primary);
  }

  .selector-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .control-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .selected-extensions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-hover);
    border-radius: 4px;
    align-items: center;
  }

  .selected-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-right: 0.25rem;
  }

  .selected-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--primary-bg);
    border: 1px solid var(--primary);
    border-radius: 12px;
    font-size: 0.75rem;
    color: var(--primary);
    font-family: 'Courier New', monospace;
  }

  .remove-tag {
    background: transparent;
    border: none;
    color: var(--primary);
    cursor: pointer;
    padding: 0;
    margin-left: 0.25rem;
    font-size: 1rem;
    line-height: 1;
    transition: opacity 0.2s;
    opacity: 0.8;
  }

  .remove-tag:hover {
    opacity: 1;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    max-height: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .header-title {
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .clear-all-btn {
    padding: 0.25rem 0.5rem;
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .clear-all-btn:hover {
    background: #cc0000;
  }

  .groups-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .group-item {
    margin-bottom: 0.25rem;
  }

  .group-item.highlighted {
    background: var(--bg-hover);
    border-radius: 4px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .group-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-primary);
    text-align: left;
    transition: all 0.2s;
  }

  .group-toggle:not(:disabled):hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .group-toggle.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
  }

  .group-toggle.partial {
    background: var(--bg-hover);
    border-color: var(--primary);
    opacity: 0.8;
  }

  .group-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .checkbox {
    font-size: 0.875rem;
    color: var(--primary);
  }

  .icon {
    font-size: 1rem;
  }

  .label {
    flex: 1;
    font-weight: 500;
  }

  .count {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .expand-btn {
    padding: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: all 0.2s;
  }

  .expand-btn:hover {
    background: var(--bg-hover);
    border-radius: 4px;
  }

  .extensions-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.5rem 2rem;
  }

  .extension-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-primary);
    transition: all 0.2s;
  }

  .extension-item:hover {
    background: var(--bg-hover);
  }

  .extension-item.selected {
    background: var(--primary-bg);
    border-color: var(--primary);
  }

  .ext-checkbox {
    font-size: 0.75rem;
    color: var(--primary);
  }

  .ext-name {
    font-family: 'Courier New', monospace;
    font-weight: 500;
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .dropdown-footer {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  /* Scrollbar styling for dropdown */
  .groups-list::-webkit-scrollbar {
    width: 8px;
  }

  .groups-list::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  .groups-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  .groups-list::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
</style>
