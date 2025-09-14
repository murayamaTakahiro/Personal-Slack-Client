import { writable, derived, get } from 'svelte/store';
import { userService } from '../services/userService';
import type { SlackUser, UserFavorite } from '../types/slack';

interface UserSelectionState {
  selectionMode: 'single' | 'multi';
  selectedUsers: string[]; // User IDs
  selectedUserDetails: Map<string, SlackUser | UserFavorite>; // User ID -> User details
}

function createUserSelectionStore() {
  const { subscribe, update, set } = writable<UserSelectionState>({
    selectionMode: 'single',
    selectedUsers: [],
    selectedUserDetails: new Map()
  });

  return {
    subscribe,

    // Toggle between single and multi selection mode
    toggleSelectionMode() {
      update(state => ({
        ...state,
        selectionMode: state.selectionMode === 'single' ? 'multi' : 'single',
        // Clear selection when switching to single mode
        selectedUsers: state.selectionMode === 'multi' ? [] : state.selectedUsers,
        selectedUserDetails: state.selectionMode === 'multi' ? new Map() : state.selectedUserDetails
      }));
    },

    // Set selection mode explicitly
    setSelectionMode(mode: 'single' | 'multi') {
      update(state => ({
        ...state,
        selectionMode: mode,
        // Clear selection when switching to single mode
        selectedUsers: mode === 'single' ? [] : state.selectedUsers,
        selectedUserDetails: mode === 'single' ? new Map() : state.selectedUserDetails
      }));
    },

    // Toggle user selection (for multi-select)
    toggleUserSelection(userId: string, userDetails?: SlackUser | UserFavorite) {
      update(state => {
        const newSelectedUsers = [...state.selectedUsers];
        const newSelectedUserDetails = new Map(state.selectedUserDetails);

        const index = newSelectedUsers.indexOf(userId);
        if (index > -1) {
          // Remove user
          newSelectedUsers.splice(index, 1);
          newSelectedUserDetails.delete(userId);
        } else {
          // Add user
          if (state.selectionMode === 'single') {
            // In single mode, replace the selection
            newSelectedUsers.length = 0;
            newSelectedUsers.push(userId);
            newSelectedUserDetails.clear();
            if (userDetails) {
              newSelectedUserDetails.set(userId, userDetails);
            }
          } else {
            // In multi mode, add to selection
            newSelectedUsers.push(userId);
            if (userDetails) {
              newSelectedUserDetails.set(userId, userDetails);
            }
          }
        }

        return {
          ...state,
          selectedUsers: newSelectedUsers,
          selectedUserDetails: newSelectedUserDetails
        };
      });
    },

    // Select a single user (replaces current selection)
    selectUser(userId: string, userDetails?: SlackUser | UserFavorite) {
      set({
        selectionMode: 'single',
        selectedUsers: [userId],
        selectedUserDetails: userDetails ? new Map([[userId, userDetails]]) : new Map()
      });
    },

    // Select multiple users at once
    selectMultipleUsers(userIds: string[], userDetailsMap?: Map<string, SlackUser | UserFavorite>) {
      update(state => ({
        ...state,
        selectionMode: 'multi',
        selectedUsers: userIds,
        selectedUserDetails: userDetailsMap || new Map()
      }));
    },

    // Clear all selected users
    clearSelection() {
      update(state => ({
        ...state,
        selectedUsers: [],
        selectedUserDetails: new Map()
      }));
    },

    // Select all favorite users
    async selectAllFavorites() {
      const favorites = userService.getUserFavorites();
      const userIds = favorites.map(f => f.id);
      const detailsMap = new Map(favorites.map(f => [f.id, f]));

      update(state => ({
        ...state,
        selectionMode: 'multi',
        selectedUsers: userIds,
        selectedUserDetails: detailsMap
      }));
    },

    // Select recent users
    selectRecentUsers(limit: number = 5) {
      const recentUsers = userService.getRecentUsers().slice(0, limit);
      const userIds = recentUsers.map(u => u.id);
      const detailsMap = new Map(recentUsers.map(u => [u.id, u]));

      update(state => ({
        ...state,
        selectionMode: 'multi',
        selectedUsers: userIds,
        selectedUserDetails: detailsMap
      }));
    },

    // Check if a user is selected
    isUserSelected(userId: string): boolean {
      const state = get({ subscribe });
      return state.selectedUsers.includes(userId);
    },

    // Get formatted user string for search
    getFormattedUserString(): string {
      const state = get({ subscribe });
      if (state.selectedUsers.length === 0) return '';
      if (state.selectedUsers.length === 1) return state.selectedUsers[0];
      // For multiple users, return comma-separated list
      return state.selectedUsers.join(',');
    },

    // Get display names for selected users
    getSelectedUserDisplayNames(): string[] {
      const state = get({ subscribe });
      return state.selectedUsers.map(userId => {
        const details = state.selectedUserDetails.get(userId);
        if (details) {
          if ('alias' in details && details.alias) {
            return details.alias;
          }
          return details.displayName || details.realName || details.name;
        }
        return userId;
      });
    },

    // Reset the store to initial state
    reset() {
      set({
        selectionMode: 'single',
        selectedUsers: [],
        selectedUserDetails: new Map()
      });
    }
  };
}

export const userSelectionStore = createUserSelectionStore();

// Derived stores for easy access
export const selectedUserCount = derived(
  userSelectionStore,
  $store => $store.selectedUsers.length
);

export const isMultiSelectMode = derived(
  userSelectionStore,
  $store => $store.selectionMode === 'multi'
);

export const selectedUserIds = derived(
  userSelectionStore,
  $store => $store.selectedUsers
);

export const selectedUserDisplayNames = derived(
  userSelectionStore,
  $store => {
    return $store.selectedUsers.map(userId => {
      const details = $store.selectedUserDetails.get(userId);
      if (details) {
        if ('alias' in details && details.alias) {
          return details.alias;
        }
        return details.displayName || details.realName || details.name;
      }
      return userId;
    });
  }
);