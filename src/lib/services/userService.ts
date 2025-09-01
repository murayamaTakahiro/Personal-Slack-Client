import { invoke } from '@tauri-apps/api/core';
import type { SlackUser, UserFavorite } from '../types/slack';
import { settings } from '../stores/settings';
import { get } from 'svelte/store';

export class UserService {
  private static instance: UserService;
  private userCache: Map<string, SlackUser> = new Map();
  private userFavorites: UserFavorite[] = [];
  private searchCache: Map<string, SlackUser[]> = new Map();

  private constructor() {
    // Load favorites from settings
    const currentSettings = get(settings);
    this.userFavorites = currentSettings.userFavorites || [];
  }

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
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

  // Get user favorites
  getUserFavorites(): UserFavorite[] {
    return this.userFavorites;
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
    this.saveFavorites();
    
    return favorite;
  }

  // Remove user from favorites
  removeUserFavorite(userId: string): void {
    const index = this.userFavorites.findIndex(fav => fav.id === userId);
    if (index !== -1) {
      this.userFavorites.splice(index, 1);
      this.saveFavorites();
    }
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
      userFavorites: this.userFavorites
    }));
  }

  // Clear all caches
  clearCache(): void {
    this.userCache.clear();
    this.searchCache.clear();
  }
}

// Export singleton instance
export const userService = UserService.getInstance();