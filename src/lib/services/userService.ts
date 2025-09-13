import { invoke } from '@tauri-apps/api/core';
import type { SlackUser, UserFavorite } from '../types/slack';
import { settings } from '../stores/settings';
import { get } from 'svelte/store';

export class UserService {
  private static instance: UserService;
  private userCache: Map<string, SlackUser> = new Map();
  private userFavorites: UserFavorite[] = [];
  private recentUsers: SlackUser[] = [];
  private recentUserIds: string[] = [];
  private searchCache: Map<string, SlackUser[]> = new Map();
  private unsubscribe: (() => void) | null = null;
  private favoriteOrder: string[] = []; // Track order of favorite user IDs

  private constructor() {
    // Don't subscribe to settings immediately - wait for initialization
    // This prevents circular dependency issues during app startup
  }

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // Subscribe to settings changes to keep favorites in sync
  private subscribeToSettings(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    this.unsubscribe = settings.subscribe(currentSettings => {
      // Update favorites from settings whenever they change
      this.userFavorites = currentSettings.userFavorites || [];
      this.favoriteOrder = currentSettings.userFavoriteOrder || this.userFavorites.map(f => f.id);
      this.recentUserIds = currentSettings.recentUsers || [];
      console.log('[UserService] Favorites updated from settings:', this.userFavorites.length, 'favorites');
      this.updateRecentUsersFromIds();
    });
  }

  // Initialize the service after settings are ready
  public initialize(): void {
    console.log('[UserService] Initializing UserService...');
    try {
      this.subscribeToSettings();
      // Load initial favorites from settings
      this.reloadFavorites();
      console.log('[UserService] UserService initialized successfully');
    } catch (error) {
      console.error('[UserService] Error during initialization:', error);
      // Don't throw - allow app to continue with default state
      this.userFavorites = [];
      this.favoriteOrder = [];
    }
  }

  // Method to explicitly reload favorites from settings
  public reloadFavorites(): void {
    try {
      const currentSettings = get(settings);
      this.userFavorites = currentSettings.userFavorites || [];
      this.favoriteOrder = currentSettings.userFavoriteOrder || this.userFavorites.map(f => f.id);
      this.recentUserIds = currentSettings.recentUsers || [];
      console.log('[UserService] Favorites reloaded:', this.userFavorites.length, 'favorites');
      this.updateRecentUsersFromIds();
    } catch (error) {
      console.error('[UserService] Error reloading favorites:', error);
      this.userFavorites = [];
      this.favoriteOrder = [];
      this.recentUserIds = [];
    }
  }

  // Update recent users from IDs
  private async updateRecentUsersFromIds(): Promise<void> {
    const users: SlackUser[] = [];
    for (const userId of this.recentUserIds) {
      const user = await this.getUserById(userId);
      if (user) {
        users.push(user);
      }
    }
    this.recentUsers = users;
  }

  // Get all users from Slack (with caching)
  async getAllUsers(): Promise<SlackUser[]> {
    try {
      const users = await invoke<SlackUser[]>('get_all_users', {});
      
      // Cache users
      users.forEach(user => {
        this.userCache.set(user.id, user);
      });
      
      return users;
    } catch (error) {
      // Failed to fetch users
      return [];
    }
  }

  // Search users by name, display name, or real name
  async searchUsers(query: string): Promise<SlackUser[]> {
    const lowerQuery = query.toLowerCase();
    
    // Check cache first
    if (this.searchCache.has(lowerQuery)) {
      return this.searchCache.get(lowerQuery)!;
    }

    // If we don't have users cached, fetch them
    if (this.userCache.size === 0) {
      await this.getAllUsers();
    }

    // Search through cached users
    const results = Array.from(this.userCache.values()).filter(user => {
      const searchableFields = [
        user.name,
        user.displayName,
        user.realName,
        // Check if user is in favorites with an alias
        this.getUserAlias(user.id)
      ].filter(Boolean).map(field => field!.toLowerCase());

      return searchableFields.some(field => field.includes(lowerQuery));
    });

    // Cache search results
    this.searchCache.set(lowerQuery, results);
    
    return results;
  }

  // Get user by ID
  async getUserById(userId: string): Promise<SlackUser | null> {
    // Check cache first
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    try {
      const user = await invoke<SlackUser>('get_user_info', { userId });
      this.userCache.set(userId, user);
      return user;
    } catch (error) {
      // Failed to fetch user
      return null;
    }
  }

  // Resolve user input to user ID (supports display names, usernames, and aliases)
  async resolveUserToId(userInput: string): Promise<string | null> {
    if (!userInput) return null;

    const cleanInput = userInput.trim().replace('@', '');
    
    // Check if it's already a user ID (starts with U and is uppercase)
    if (/^U[A-Z0-9]+$/.test(cleanInput)) {
      return cleanInput;
    }

    // Check favorites first (by alias)
    const favoriteByAlias = this.userFavorites.find(
      fav => fav.alias?.toLowerCase() === cleanInput.toLowerCase()
    );
    if (favoriteByAlias) {
      return favoriteByAlias.id;
    }

    // Search for user by name
    const users = await this.searchUsers(cleanInput);
    if (users.length > 0) {
      // Return the first exact match or the first result
      const exactMatch = users.find(
        user => 
          user.name?.toLowerCase() === cleanInput.toLowerCase() ||
          user.displayName?.toLowerCase() === cleanInput.toLowerCase() ||
          user.realName?.toLowerCase() === cleanInput.toLowerCase()
      );
      return exactMatch ? exactMatch.id : users[0].id;
    }

    return null;
  }

  // Get user favorites (ordered)
  getUserFavorites(): UserFavorite[] {
    // Return favorites in the specified order
    const ordered: UserFavorite[] = [];
    for (const id of this.favoriteOrder) {
      const favorite = this.userFavorites.find(f => f.id === id);
      if (favorite) ordered.push(favorite);
    }
    // Add any favorites not in the order list (shouldn't happen but safety check)
    for (const favorite of this.userFavorites) {
      if (!this.favoriteOrder.includes(favorite.id)) {
        ordered.push(favorite);
      }
    }
    return ordered;
  }

  // Get recent users
  getRecentUsers(): SlackUser[] {
    return this.recentUsers;
  }

  // Add user to recent users
  async addToRecentUsers(userId: string): Promise<void> {
    // Don't add if it's already a favorite
    if (this.isUserFavorite(userId)) {
      return;
    }

    // Remove from current position if exists
    this.recentUserIds = this.recentUserIds.filter(id => id !== userId);

    // Add to beginning
    this.recentUserIds.unshift(userId);

    // Keep only last 10 recent users
    this.recentUserIds = this.recentUserIds.slice(0, 10);

    // Update the actual user objects
    await this.updateRecentUsersFromIds();

    // Save to settings
    this.saveRecentUsers();
  }

  // Get favorite user by index (for keyboard shortcuts)
  getUserFavoriteByIndex(index: number): UserFavorite | null {
    const favorites = this.getUserFavorites();
    return favorites[index] || null;
  }

  // Add user to favorites
  async addUserFavorite(userId: string, alias?: string): Promise<UserFavorite> {
    // Check if already in favorites
    const existing = this.userFavorites.find(fav => fav.id === userId);
    if (existing) {
      // Update alias if provided
      if (alias !== undefined) {
        existing.alias = alias;
        this.saveFavorites();
      }
      return existing;
    }

    // Get user info
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const favorite: UserFavorite = {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      realName: user.realName,
      alias: alias,
      avatar: user.avatar
    };

    this.userFavorites.push(favorite);
    this.favoriteOrder.push(favorite.id);
    this.saveFavorites();
    
    return favorite;
  }

  // Remove user from favorites
  removeUserFavorite(userId: string): void {
    const index = this.userFavorites.findIndex(fav => fav.id === userId);
    if (index !== -1) {
      this.userFavorites.splice(index, 1);
      this.favoriteOrder = this.favoriteOrder.filter(id => id !== userId);
      this.saveFavorites();
    }
  }

  // Reorder favorites (for drag-and-drop or manual ordering)
  reorderFavorites(newOrder: string[]): void {
    this.favoriteOrder = newOrder;
    this.saveFavorites();
  }

  // Update user alias
  updateUserAlias(userId: string, alias: string): void {
    const favorite = this.userFavorites.find(fav => fav.id === userId);
    if (favorite) {
      favorite.alias = alias;
      this.saveFavorites();
    }
  }

  // Get user alias
  getUserAlias(userId: string): string | undefined {
    const favorite = this.userFavorites.find(fav => fav.id === userId);
    return favorite?.alias;
  }

  // Check if user is in favorites
  isUserFavorite(userId: string): boolean {
    return this.userFavorites.some(fav => fav.id === userId);
  }

  // Save favorites to settings
  private saveFavorites(): void {
    settings.update(s => ({
      ...s,
      userFavorites: this.userFavorites,
      userFavoriteOrder: this.favoriteOrder
    }));
  }

  // Save recent users to settings
  private saveRecentUsers(): void {
    settings.update(s => ({
      ...s,
      recentUsers: this.recentUserIds
    }));
  }

  // Clear all caches
  clearCache(): void {
    this.userCache.clear();
    this.searchCache.clear();
  }

  // Clean up subscriptions
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

// Export singleton instance
export const userService = UserService.getInstance();