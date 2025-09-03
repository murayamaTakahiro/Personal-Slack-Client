<script lang="ts">
  import { onDestroy, createEventDispatcher, tick } from 'svelte';
  import { workspaceStore, activeWorkspace, sortedWorkspaces } from '../stores/workspaces';
  import type { Workspace } from '../types/workspace';
  import { maskTokenClient } from '../api/secure';
  
  const dispatch = createEventDispatcher();
  
  let showAddWorkspace = false;
  
  let isOpen = false;
  let addingWorkspace = false;
  let newWorkspaceName = '';
  let newWorkspaceDomain = '';
  let newWorkspaceToken = '';
  let newWorkspaceColor = '#4A90E2';
  let switchingWorkspace = false;
  
  // Edit mode state
  let editingWorkspaceId: string | null = null;
  let editWorkspaceName = '';
  let editWorkspaceColor = '';
  
  // Focus management
  let dropdownElement: HTMLElement;
  let workspaceButtonElement: HTMLButtonElement;
  let focusedIndex = -1;
  let focusableElements: HTMLElement[] = [];
  
  $: currentWorkspace = $activeWorkspace;
  $: workspaceList = $sortedWorkspaces;
  
  const defaultColors = [
    '#4A90E2', '#50C878', '#FFB84D', '#FF6B6B', 
    '#9B59B6', '#1ABC9C', '#E74C3C', '#3498DB'
  ];
  
  async function toggleDropdown() {
    isOpen = !isOpen;
    if (!isOpen) {
      addingWorkspace = false;
      resetNewWorkspaceForm();
      focusedIndex = -1;
    } else {
      // Wait for dropdown to render
      await tick();
      updateFocusableElements();
      // Focus first item
      if (focusableElements.length > 0) {
        focusedIndex = 0;
        focusableElements[0]?.focus();
      }
    }
  }
  
  function closeDropdown() {
    isOpen = false;
    addingWorkspace = false;
    resetNewWorkspaceForm();
    focusedIndex = -1;
    // Return focus to the trigger button
    workspaceButtonElement?.focus();
  }
  
  async function switchToWorkspace(workspace: Workspace) {
    if (workspace.id === currentWorkspace?.id) {
      closeDropdown();
      return;
    }
    
    switchingWorkspace = true;
    
    try {
      const success = await workspaceStore.switchWorkspace(workspace.id);
      if (success) {
        dispatch('workspaceSwitched', workspace);
        closeDropdown();
      } else {
        alert('Failed to switch workspace. Please check the token.');
      }
    } catch (error) {
      console.error('Error switching workspace:', error);
      alert('Error switching workspace: ' + error.message);
    } finally {
      switchingWorkspace = false;
    }
  }
  
  async function showAddWorkspaceForm() {
    addingWorkspace = true;
    await tick();
    updateFocusableElements();
    // Focus first input in the form
    const firstInput = dropdownElement?.querySelector('input');
    if (firstInput) {
      (firstInput as HTMLElement).focus();
    }
  }
  
  function resetNewWorkspaceForm() {
    newWorkspaceName = '';
    newWorkspaceDomain = '';
    newWorkspaceToken = '';
    newWorkspaceColor = defaultColors[workspaceList.length % defaultColors.length];
  }
  
  async function addWorkspace() {
    if (!newWorkspaceName || !newWorkspaceDomain || !newWorkspaceToken) {
      alert('Please fill in all fields');
      return;
    }
    
    try {
      const workspace = await workspaceStore.addWorkspace({
        name: newWorkspaceName,
        domain: newWorkspaceDomain,
        token: newWorkspaceToken,
        color: newWorkspaceColor
      });
      
      resetNewWorkspaceForm();
      addingWorkspace = false;
      
      // Automatically switch to the new workspace
      // This will trigger the workspaceSwitched event
      await switchToWorkspace(workspace);
      
      // Also dispatch the workspaceAdded event
      dispatch('workspaceAdded', workspace);
    } catch (error) {
      console.error('Error adding workspace:', error);
      alert('Failed to add workspace: ' + error.message);
    }
  }
  
  async function deleteWorkspace(e: Event, workspace: Workspace) {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${workspace.name}"?`)) {
      return;
    }
    
    try {
      await workspaceStore.deleteWorkspace(workspace.id);
      
      // If we deleted the active workspace, switch to another one
      if (workspace.id === currentWorkspace?.id && workspaceList.length > 1) {
        const otherWorkspace = workspaceList.find(ws => ws.id !== workspace.id);
        if (otherWorkspace) {
          await switchToWorkspace(otherWorkspace);
        }
      }
      
      dispatch('workspaceDeleted', workspace);
    } catch (error) {
      console.error('Error deleting workspace:', error);
      alert('Failed to delete workspace: ' + error.message);
    }
  }
  
  async function startEditingWorkspace(e: Event, workspace: Workspace) {
    e.stopPropagation();
    editingWorkspaceId = workspace.id;
    editWorkspaceName = workspace.name;
    editWorkspaceColor = workspace.color || '#4A90E2';
    
    // Wait for the input to render and then focus it
    await tick();
    const editInput = dropdownElement?.querySelector('.edit-name-input') as HTMLInputElement;
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }
  
  async function saveWorkspaceEdit(workspace: Workspace) {
    if (!editWorkspaceName.trim()) {
      alert('Workspace name cannot be empty');
      return;
    }
    
    try {
      await workspaceStore.updateWorkspace(workspace.id, {
        name: editWorkspaceName.trim(),
        color: editWorkspaceColor
      });
      
      editingWorkspaceId = null;
      dispatch('workspaceUpdated', { ...workspace, name: editWorkspaceName, color: editWorkspaceColor });
    } catch (error) {
      console.error('Error updating workspace:', error);
      alert('Failed to update workspace: ' + error.message);
    }
  }
  
  function cancelEditingWorkspace() {
    editingWorkspaceId = null;
    editWorkspaceName = '';
    editWorkspaceColor = '';
  }
  
  function getWorkspaceInitials(workspace: Workspace): string {
    return workspace.name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  
  // Update focusable elements list
  function updateFocusableElements() {
    if (!dropdownElement) return;
    
    const selector = 'button:not([disabled]):not(.delete-button):not(.edit-button), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    focusableElements = Array.from(dropdownElement.querySelectorAll(selector));
  }
  
  // Handle keyboard navigation
  async function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) {
      // Handle Space key to open dropdown
      if (event.key === ' ' && event.target === workspaceButtonElement) {
        event.preventDefault();
        toggleDropdown();
        return;
      }
      return;
    }
    
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeDropdown();
        break;
        
      case 'Tab':
        // Trap focus within dropdown
        event.preventDefault();
        if (event.shiftKey) {
          navigateFocus('prev');
        } else {
          navigateFocus('next');
        }
        break;
        
      case 'ArrowDown':
        event.preventDefault();
        navigateFocus('next');
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        navigateFocus('prev');
        break;
        
      case 'Home':
        event.preventDefault();
        if (focusableElements.length > 0) {
          focusedIndex = 0;
          focusableElements[0].focus();
        }
        break;
        
      case 'End':
        event.preventDefault();
        if (focusableElements.length > 0) {
          focusedIndex = focusableElements.length - 1;
          focusableElements[focusedIndex].focus();
        }
        break;
        
      case 'Enter':
      case ' ':
        // Allow default behavior for buttons and inputs
        if (event.target instanceof HTMLButtonElement && event.key === ' ') {
          event.preventDefault();
          (event.target as HTMLButtonElement).click();
        }
        break;
    }
  }
  
  function navigateFocus(direction: 'next' | 'prev') {
    if (focusableElements.length === 0) return;
    
    if (direction === 'next') {
      focusedIndex = (focusedIndex + 1) % focusableElements.length;
    } else {
      focusedIndex = focusedIndex <= 0 ? focusableElements.length - 1 : focusedIndex - 1;
    }
    
    focusableElements[focusedIndex]?.focus();
  }
  
  // Handle focus changes to track focused index
  function handleFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement;
    const index = focusableElements.indexOf(target);
    if (index !== -1) {
      focusedIndex = index;
    }
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.workspace-switcher')) {
      closeDropdown();
    }
  }
  
  // Add event listener when dropdown opens, remove when closes
  $: if (typeof window !== 'undefined') {
    if (isOpen) {
      // Add a small delay to prevent immediate closure
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }
  
  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="workspace-switcher" on:keydown={handleKeydown}>
  <button 
    class="workspace-button"
    class:active={isOpen}
    on:click={toggleDropdown}
    disabled={switchingWorkspace}
    bind:this={workspaceButtonElement}
    aria-expanded={isOpen}
    aria-haspopup="true"
    aria-label="Switch workspace"
  >
    {#if currentWorkspace}
      <div 
        class="workspace-avatar"
        style="background-color: {currentWorkspace.color || '#4A90E2'}"
      >
        {getWorkspaceInitials(currentWorkspace)}
      </div>
      <div class="workspace-info">
        <span class="workspace-name">{currentWorkspace.name}</span>
        <span class="workspace-domain">{currentWorkspace.domain}.slack.com</span>
      </div>
    {:else}
      <div class="workspace-avatar empty">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <span class="workspace-name">Add Workspace</span>
    {/if}
    
    <svg 
      class="dropdown-arrow"
      class:open={isOpen}
      width="12" 
      height="12" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor"
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>
  
  {#if isOpen}
    <div 
      class="workspace-dropdown" 
      bind:this={dropdownElement}
      on:focusin={handleFocusIn}
      role="menu"
      aria-label="Workspace menu"
    >
      {#if !addingWorkspace}
        <div class="workspace-list">
          {#each workspaceList as workspace, index}
            {#if editingWorkspaceId === workspace.id}
              <div class="workspace-edit-item">
                <div class="color-picker-inline">
                  {#each defaultColors.slice(0, 4) as color}
                    <button
                      class="color-option-small"
                      class:selected={editWorkspaceColor === color}
                      style="background-color: {color}"
                      on:click={() => editWorkspaceColor = color}
                      tabindex="-1"
                    />
                  {/each}
                </div>
                <input
                  type="text"
                  class="edit-name-input"
                  bind:value={editWorkspaceName}
                  placeholder="Workspace name"
                  on:keydown={(e) => {
                    if (e.key === 'Enter') {
                      saveWorkspaceEdit(workspace);
                    } else if (e.key === 'Escape') {
                      cancelEditingWorkspace();
                    }
                  }}
                  maxlength="50"
                />
                <div class="edit-actions">
                  <button 
                    class="save-edit-btn"
                    on:click={() => saveWorkspaceEdit(workspace)}
                    title="Save"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </button>
                  <button 
                    class="cancel-edit-btn"
                    on:click={cancelEditingWorkspace}
                    title="Cancel"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            {:else}
              <button
                class="workspace-item"
                class:active={workspace.id === currentWorkspace?.id}
                on:click={() => switchToWorkspace(workspace)}
                role="menuitem"
                aria-label="Switch to {workspace.name}"
                tabindex={focusedIndex === index ? 0 : -1}
              >
                <div 
                  class="workspace-avatar small"
                  style="background-color: {workspace.color || '#4A90E2'}"
                >
                  {getWorkspaceInitials(workspace)}
                </div>
                <div class="workspace-details">
                  <span class="workspace-name">{workspace.name}</span>
                  <span class="workspace-domain">{workspace.domain}.slack.com</span>
                </div>
                {#if workspace.id === currentWorkspace?.id}
                  <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                {/if}
                <button
                  class="edit-button"
                  on:click={e => startEditingWorkspace(e, workspace)}
                  title="Edit workspace"
                  tabindex="-1"
                  aria-label="Edit {workspace.name}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                {#if workspaceList.length > 1}
                  <button
                    class="delete-button"
                    on:click={e => deleteWorkspace(e, workspace)}
                    title="Delete workspace"
                    tabindex="-1"
                    aria-label="Delete {workspace.name}"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
        
        <div class="dropdown-divider" role="separator"></div>
        
        <button 
          class="add-workspace-button" 
          on:click|stopPropagation={showAddWorkspaceForm}
          role="menuitem"
          aria-label="Add new workspace"
          tabindex={focusedIndex === workspaceList.length ? 0 : -1}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Add Workspace
        </button>
      {:else}
        <div class="add-workspace-form">
          <h3>Add New Workspace</h3>
          
          <div class="form-group">
            <label>
              Workspace Name
              <input
                type="text"
                bind:value={newWorkspaceName}
                placeholder="e.g., Work, Personal"
                maxlength="50"
              />
            </label>
          </div>
          
          <div class="form-group">
            <label>
              Workspace Domain
              <div class="domain-input">
                <input
                  type="text"
                  bind:value={newWorkspaceDomain}
                  placeholder="mycompany"
                  maxlength="50"
                />
                <span class="domain-suffix">.slack.com</span>
              </div>
            </label>
          </div>
          
          <div class="form-group">
            <label>
              User Token (Required: xoxp-)
              <input
                type="password"
                bind:value={newWorkspaceToken}
                placeholder="xoxp-..."
                on:input={(e) => {
                  const value = e.target.value.trim();
                  if (value && !value.startsWith('xoxp-')) {
                    if (value.startsWith('xoxb-')) {
                      alert('⚠️ Bot tokens (xoxb-) are not supported. Please use a User Token (xoxp-) instead. See SLACK_TOKEN_GUIDE.md for details.');
                    } else if (value.length > 10) {
                      alert('⚠️ Invalid token format. User tokens must start with "xoxp-". See SLACK_TOKEN_GUIDE.md for details.');
                    }
                  }
                }}
              />
            </label>
            <p class="help-text" style="color: var(--warning, orange);">
              ⚠️ Must be a User Token (xoxp-), NOT a Bot Token (xoxb-)
            </p>
          </div>
          
          <div class="form-group">
            <label>
              Color
              <div class="color-picker">
                {#each defaultColors as color}
                  <button
                    class="color-option"
                    class:selected={newWorkspaceColor === color}
                    style="background-color: {color}"
                    on:click={() => newWorkspaceColor = color}
                  />
                {/each}
              </div>
            </label>
          </div>
          
          <div class="form-actions">
            <button class="btn-cancel" on:click={() => {addingWorkspace = false; updateFocusableElements();}}>
              Cancel
            </button>
            <button class="btn-add" on:click={addWorkspace}>
              Add Workspace
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .workspace-switcher {
    position: relative;
  }
  
  .workspace-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 200px;
  }
  
  .workspace-button:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
  }
  
  .workspace-button.active {
    background: var(--bg-hover);
    border-color: var(--primary);
  }
  
  .workspace-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .workspace-avatar {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.875rem;
    color: white;
    flex-shrink: 0;
  }
  
  .workspace-avatar.small {
    width: 28px;
    height: 28px;
    font-size: 0.75rem;
  }
  
  .workspace-avatar.empty {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }
  
  .workspace-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1;
  }
  
  .workspace-name {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .workspace-domain {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  .dropdown-arrow {
    transition: transform 0.2s;
    color: var(--text-secondary);
  }
  
  .dropdown-arrow.open {
    transform: rotate(180deg);
  }
  
  .workspace-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    overflow: hidden;
  }
  
  .workspace-list {
    max-height: 300px;
    overflow-y: auto;
  }
  
  .workspace-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
    position: relative;
  }
  
  .workspace-item:hover,
  .workspace-item:focus {
    background: var(--bg-hover);
    outline: none;
  }
  
  .workspace-item:focus {
    box-shadow: inset 0 0 0 2px var(--primary);
  }
  
  .workspace-item.active {
    background: var(--primary-bg);
  }
  
  .workspace-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1;
  }
  
  .check-icon {
    color: var(--primary);
    flex-shrink: 0;
  }
  
  .edit-button,
  .delete-button {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    opacity: 0;
    transition: all 0.2s;
  }
  
  .workspace-item:hover .edit-button,
  .workspace-item:hover .delete-button,
  .workspace-item:focus .edit-button,
  .workspace-item:focus .delete-button {
    opacity: 1;
  }
  
  .edit-button:hover {
    background: var(--bg-hover);
    color: var(--primary);
  }
  
  .delete-button:hover {
    background: var(--bg-hover);
    color: var(--danger);
  }
  
  /* Edit mode styles */
  .workspace-edit-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-hover);
    border-left: 2px solid var(--primary);
  }
  
  .color-picker-inline {
    display: flex;
    gap: 0.25rem;
  }
  
  .color-option-small {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .color-option-small:hover {
    transform: scale(1.1);
  }
  
  .color-option-small.selected {
    border-color: var(--text-primary);
  }
  
  .edit-name-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--primary);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .edit-name-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  
  .edit-actions {
    display: flex;
    gap: 0.25rem;
  }
  
  .save-edit-btn,
  .cancel-edit-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .save-edit-btn {
    color: var(--success, #10B981);
  }
  
  .save-edit-btn:hover {
    background: var(--bg-hover);
  }
  
  .cancel-edit-btn {
    color: var(--text-secondary);
  }
  
  .cancel-edit-btn:hover {
    background: var(--bg-hover);
    color: var(--danger);
  }
  
  .dropdown-divider {
    height: 1px;
    background: var(--border);
    margin: 0.25rem 0;
  }
  
  .add-workspace-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--primary);
    cursor: pointer;
    transition: background 0.2s;
    font-size: 0.875rem;
  }
  
  .add-workspace-button:hover,
  .add-workspace-button:focus {
    background: var(--bg-hover);
    outline: none;
  }
  
  .add-workspace-button:focus {
    box-shadow: inset 0 0 0 2px var(--primary);
  }
  
  .add-workspace-form {
    padding: 1rem;
  }
  
  .add-workspace-form h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group label {
    display: block;
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }
  
  .form-group input {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .form-group input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  
  .domain-input {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .domain-input input {
    flex: 1;
  }
  
  .domain-suffix {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .color-picker {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .color-option {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .color-option:hover {
    transform: scale(1.1);
  }
  
  .color-option.selected {
    border-color: var(--text-primary);
  }
  
  .color-option:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary);
  }
  
  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  
  .btn-cancel,
  .btn-add {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-cancel {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  
  .btn-cancel:hover {
    background: var(--bg-hover);
  }
  
  .btn-cancel:focus,
  .btn-add:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary);
  }
  
  .btn-add {
    background: var(--primary);
    border: none;
    color: white;
  }
  
  .btn-add:hover {
    opacity: 0.9;
  }
  
  /* Ensure help text is visible */
  .help-text {
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }
</style>