<script lang="ts">
  import { onDestroy, createEventDispatcher, tick } from 'svelte';
  import { workspaceStore, activeWorkspace, sortedWorkspaces } from '../stores/workspaces';
  import type { Workspace } from '../types/workspace';
  import { maskTokenClient } from '../api/secure';
  import { logger } from '../services/logger';
  
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
  let editingWorkspace: Workspace | null = null;
  let editWorkspaceName = '';
  let editWorkspaceColor = '';
  let editWorkspaceDomain = '';
  let showEditModal = false;
  
  // Focus management
  let dropdownElement: HTMLElement;
  let workspaceButtonElement: HTMLButtonElement;
  let focusedIndex = -1;
  let focusableElements: HTMLElement[] = [];
  let selectedWorkspaceForAction: Workspace | null = null;

  // Dropdown positioning
  let dropdownTop = 0;
  let dropdownLeft = 0;
  
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
      // Calculate dropdown position based on button position
      if (workspaceButtonElement) {
        const rect = workspaceButtonElement.getBoundingClientRect();
        dropdownTop = rect.bottom + 8; // 8px gap (0.5rem)
        dropdownLeft = rect.left;
      }

      // Wait for dropdown to render
      await tick();
      updateFocusableElements();
      // Focus first focusable element in the dropdown
      if (focusableElements.length > 0) {
        // Find first workspace item or add button
        const firstItem = dropdownElement?.querySelector('.workspace-item, .add-workspace-button') as HTMLElement;
        if (firstItem) {
          firstItem.focus();
        } else if (focusableElements[0]) {
          focusableElements[0].focus();
        }
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
    editingWorkspace = workspace;
    editWorkspaceName = workspace.name;
    editWorkspaceColor = workspace.color || '#4A90E2';
    editWorkspaceDomain = workspace.domain;
    showEditModal = true;
    
    // Wait for the modal to render and then focus the input
    await tick();
    const editInput = document.querySelector('.workspace-edit-modal input[type="text"]') as HTMLInputElement;
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }
  
  async function saveWorkspaceEdit() {
    if (!editingWorkspace) return;
    
    if (!editWorkspaceName.trim()) {
      alert('Workspace name cannot be empty');
      return;
    }
    
    if (!editWorkspaceDomain.trim()) {
      alert('Workspace domain cannot be empty');
      return;
    }
    
    try {
      await workspaceStore.updateWorkspace(editingWorkspace.id, {
        name: editWorkspaceName.trim(),
        domain: editWorkspaceDomain.trim(),
        color: editWorkspaceColor
      });
      
      closeEditModal();
      dispatch('workspaceUpdated', { 
        ...editingWorkspace, 
        name: editWorkspaceName.trim(), 
        domain: editWorkspaceDomain.trim(),
        color: editWorkspaceColor 
      });
    } catch (error) {
      console.error('Error updating workspace:', error);
      alert('Failed to update workspace: ' + error.message);
    }
  }
  
  function closeEditModal() {
    showEditModal = false;
    editingWorkspace = null;
    editWorkspaceName = '';
    editWorkspaceColor = '';
    editWorkspaceDomain = '';
  }
  
  function handleEditModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeEditModal();
    } else if (event.key === 'Tab') {
      // Trap focus within the modal
      const modal = document.querySelector('.workspace-edit-modal');
      if (!modal) return;
      
      const focusableSelectors = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(modal.querySelectorAll(focusableSelectors)) as HTMLElement[];
      
      if (focusableElements.length === 0) return;
      
      const currentFocus = document.activeElement;
      const currentIndex = focusableElements.indexOf(currentFocus as HTMLElement);
      
      let nextIndex;
      if (event.shiftKey) {
        // Shift+Tab: go backwards
        nextIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
      } else {
        // Tab: go forwards
        nextIndex = currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1;
      }
      
      event.preventDefault();
      focusableElements[nextIndex]?.focus();
    }
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
    
    // Include all interactive elements for better keyboard navigation
    const selector = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
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
    
    // Get the currently focused workspace item
    const focusedElement = document.activeElement;
    const workspaceItem = focusedElement?.closest('.workspace-item');
    if (workspaceItem) {
      const workspaceId = workspaceItem.getAttribute('data-workspace-id');
      const workspace = workspaceList.find(w => w.id === workspaceId);
      
      // Handle keyboard shortcuts for workspace actions
      if (workspace && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        startEditingWorkspace(event, workspace);
        return;
      }
      
      if (workspace && event.key === 'Delete' && workspaceList.length > 1) {
        event.preventDefault();
        deleteWorkspace(event, workspace);
        return;
      }
    }
    
    // Handle "A" key for Add Workspace (works from anywhere in the dropdown)
    if ((event.key === 'a' || event.key === 'A') && !addingWorkspace) {
      event.preventDefault();
      showAddWorkspaceForm();
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
        event.stopPropagation();
        
        // Update focusable elements list
        updateFocusableElements();
        
        if (focusableElements.length === 0) return;
        
        // Get current focused element
        const currentFocus = document.activeElement;
        const currentIndex = focusableElements.indexOf(currentFocus as HTMLElement);
        
        let nextIndex;
        if (event.shiftKey) {
          // Shift+Tab: go backwards
          nextIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        } else {
          // Tab: go forwards
          nextIndex = currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1;
        }
        
        focusableElements[nextIndex]?.focus();
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
    if (!target.closest('.workspace-switcher') && !target.closest('.workspace-dropdown')) {
      closeDropdown();
    }
  }

  // Close dropdown when pressing Escape key
  function handleGlobalKeydown(event: KeyboardEvent) {
    console.log('[WorkspaceSwitcher] Global keydown:', event.key, 'isOpen:', isOpen);
    if (event.key === 'Escape') {
      console.log('[WorkspaceSwitcher] Escape key detected, closing dropdown');
      event.preventDefault();
      event.stopPropagation();
      closeDropdown();
    }
  }

  // Add event listener when dropdown opens, remove when closes
  $: if (typeof window !== 'undefined') {
    if (isOpen) {
      console.log('[WorkspaceSwitcher] Dropdown opened, adding event listeners');
      // Add a small delay to prevent immediate closure
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        // Use capture phase (true) to handle Escape before other handlers
        document.addEventListener('keydown', handleGlobalKeydown, true);
        console.log('[WorkspaceSwitcher] Event listeners added (keydown in capture phase)');
      }, 10);
    } else {
      console.log('[WorkspaceSwitcher] Dropdown closed, removing event listeners');
      document.removeEventListener('click', handleClickOutside);
      // Must match the capture flag used in addEventListener
      document.removeEventListener('keydown', handleGlobalKeydown, true);
    }
  }

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleClickOutside);
      // Must match the capture flag used in addEventListener
      document.removeEventListener('keydown', handleGlobalKeydown, true);
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
      on:keydown={handleKeydown}
      role="menu"
      aria-label="Workspace menu"
      style="top: {dropdownTop}px; left: {dropdownLeft}px;"
    >
      {#if !addingWorkspace}
        <div class="workspace-list">
          <div class="workspace-hint">
            <span>Press <kbd>A</kbd> to add, <kbd>E</kbd> to edit, <kbd>Del</kbd> to delete</span>
          </div>
          {#each workspaceList as workspace, index}
            <div
              class="workspace-item"
              class:active={workspace.id === currentWorkspace?.id}
              data-workspace-id={workspace.id}
              role="menuitem"
              tabindex={0}
              on:click={() => switchToWorkspace(workspace)}
              on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  switchToWorkspace(workspace);
                }
              }}
              on:contextmenu={(e) => {
                e.preventDefault();
                selectedWorkspaceForAction = workspace;
                startEditingWorkspace(e, workspace);
              }}
            >
              <div class="workspace-content" on:click={() => switchToWorkspace(workspace)}>
                <div 
                  class="workspace-avatar"
                  style="background-color: {workspace.color || '#4A90E2'}"
                >
                  {getWorkspaceInitials(workspace)}
                </div>
                <div class="workspace-details">
                  <span class="workspace-name">{workspace.name}</span>
                  <span class="workspace-domain">{workspace.domain}.slack.com</span>
                </div>
                {#if workspace.id === currentWorkspace?.id}
                  <svg class="check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                {/if}
              </div>
              <div class="workspace-actions">
                <button
                  class="action-button edit-button"
                  on:click={e => startEditingWorkspace(e, workspace)}
                  title="Edit workspace (E)"
                  aria-label="Edit {workspace.name}"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                {#if workspaceList.length > 1}
                  <button
                    class="action-button delete-button"
                    on:click={e => deleteWorkspace(e, workspace)}
                    title="Delete workspace (Del)"
                    aria-label="Delete {workspace.name}"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
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

{#if showEditModal && editingWorkspace}
  <div class="modal-backdrop" on:click={closeEditModal} on:keydown={handleEditModalKeydown} role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
    <div class="workspace-edit-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2 id="edit-modal-title">Edit Workspace</h2>
        <button class="modal-close" on:click={closeEditModal}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="modal-body">
        <div class="edit-preview">
          <div 
            class="preview-avatar"
            style="background-color: {editWorkspaceColor}"
          >
            {editWorkspaceName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || getWorkspaceInitials(editingWorkspace)}
          </div>
          <div class="preview-info">
            <div class="preview-name">{editWorkspaceName || editingWorkspace.name}</div>
            <div class="preview-domain">{editWorkspaceDomain || editingWorkspace.domain}.slack.com</div>
          </div>
        </div>
        
        <div class="edit-form">
          <div class="form-field">
            <label for="edit-name">Workspace Name</label>
            <input
              id="edit-name"
              type="text"
              bind:value={editWorkspaceName}
              placeholder="Enter workspace name"
              maxlength="50"
              on:keydown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveWorkspaceEdit();
                }
              }}
            />
          </div>
          
          <div class="form-field">
            <label for="edit-domain">Workspace Domain</label>
            <div class="domain-input-group">
              <input
                id="edit-domain"
                type="text"
                bind:value={editWorkspaceDomain}
                placeholder="workspace"
                maxlength="50"
              />
              <span class="domain-suffix">.slack.com</span>
            </div>
          </div>
          
          <div class="form-field">
            <label>Workspace Color</label>
            <div class="color-picker-grid">
              {#each defaultColors as color}
                <button
                  class="color-option-large"
                  class:selected={editWorkspaceColor === color}
                  style="background-color: {color}"
                  on:click={() => editWorkspaceColor = color}
                  title={color}
                >
                  {#if editWorkspaceColor === color}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeEditModal}>
          Cancel
        </button>
        <button class="btn-primary" on:click={saveWorkspaceEdit}>
          Save Changes
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .workspace-switcher {
    position: relative;
  }
  
  .workspace-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 240px;
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
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.9rem;
    color: white;
    flex-shrink: 0;
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
    font-size: 0.925rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .workspace-domain {
    font-size: 0.8rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .dropdown-arrow {
    transition: transform 0.2s;
    color: var(--text-secondary);
  }
  
  .dropdown-arrow.open {
    transform: rotate(180deg);
  }
  
  .workspace-dropdown {
    position: fixed;
    min-width: 320px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    overflow: hidden;
  }
  
  .workspace-list {
    max-height: 400px;
    overflow-y: auto;
  }
  
  .workspace-hint {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  
  .workspace-hint kbd {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 0.7rem;
    font-family: monospace;
    margin: 0 0.125rem;
  }
  
  .workspace-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    width: 100%;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    border: 2px solid transparent;
    margin: 0.25rem 0;
  }
  
  .workspace-item:hover {
    background: var(--bg-hover);
  }
  
  .workspace-item:focus {
    outline: none;
    border-color: var(--primary);
    background: var(--bg-hover);
  }
  
  .workspace-item.active {
    background: var(--primary-bg);
  }
  
  .workspace-content {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    flex: 1;
    min-width: 0;
  }
  
  .workspace-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1;
    min-width: 0;
  }
  
  .workspace-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-left: 0.5rem;
  }
  
  .check-icon {
    color: var(--primary);
    flex-shrink: 0;
  }
  
  .action-button {
    padding: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
  }
  
  .workspace-item:hover .action-button,
  .workspace-item:focus .action-button {
    opacity: 1;
  }
  
  .action-button:hover {
    transform: scale(1.05);
  }
  
  .action-button:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary);
  }
  
  .edit-button:hover {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }
  
  .delete-button:hover {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }
  
  /* Modal styles */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease-out;
  }
  
  .workspace-edit-modal {
    background: var(--bg-primary);
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease-out;
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }
  
  .modal-close {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .modal-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }
  
  .edit-preview {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }
  
  .preview-avatar {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    color: white;
    font-size: 1.125rem;
    transition: background-color 0.2s;
  }
  
  .preview-info {
    flex: 1;
  }
  
  .preview-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }
  
  .preview-domain {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
  
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .form-field label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }
  
  .form-field input {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 1rem;
    transition: all 0.2s;
  }
  
  .form-field input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-bg);
  }
  
  .domain-input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .domain-input-group input {
    flex: 1;
  }
  
  .domain-suffix {
    color: var(--text-secondary);
    font-size: 1rem;
  }
  
  .color-picker-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }
  
  .color-option-large {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 8px;
    border: 3px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .color-option-large:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .color-option-large.selected {
    border-color: var(--bg-primary);
    box-shadow: 0 0 0 3px var(--text-primary);
  }
  
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  
  .btn-primary,
  .btn-secondary {
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .btn-primary {
    background: var(--primary);
    color: white;
  }
  
  .btn-primary:hover {
    opacity: 0.9;
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
  }
  
  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  
  .btn-secondary:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  /* Responsive design for smaller screens */
  @media (max-width: 480px) {
    .workspace-edit-modal {
      width: 95%;
      max-height: 90vh;
      border-radius: 8px;
    }
    
    .modal-header {
      padding: 1rem;
    }
    
    .modal-body {
      padding: 1rem;
    }
    
    .modal-footer {
      padding: 1rem;
      flex-direction: column-reverse;
    }
    
    .btn-primary,
    .btn-secondary {
      width: 100%;
    }
    
    .color-picker-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }
  }
  
  .dropdown-divider {
    height: 1px;
    background: var(--border);
    margin: 0.25rem 0;
  }
  
  .add-workspace-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--primary);
    cursor: pointer;
    transition: background 0.2s;
    font-size: 0.925rem;
    font-weight: 500;
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