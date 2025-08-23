import { invoke } from '@tauri-apps/api/core';
import type { EmojiReaction, ReactionMapping } from '../types/slack';
import { get, writable } from 'svelte/store';

// Default emoji mappings
export const DEFAULT_REACTION_MAPPINGS: ReactionMapping[] = [
  { shortcut: 1, emoji: 'thumbsup', display: '👍' },
  { shortcut: 2, emoji: 'heart', display: '❤️' },
  { shortcut: 3, emoji: 'smile', display: '😄' },
  { shortcut: 4, emoji: 'tada', display: '🎉' },
  { shortcut: 5, emoji: 'eyes', display: '👀' },
  { shortcut: 6, emoji: 'rocket', display: '🚀' },
  { shortcut: 7, emoji: 'white_check_mark', display: '✅' },
  { shortcut: 8, emoji: 'thinking_face', display: '🤔' },
  { shortcut: 9, emoji: 'thumbsdown', display: '👎' },
];

// Store for reaction mappings
export const reactionMappings = writable<ReactionMapping[]>(DEFAULT_REACTION_MAPPINGS);

// Store for recent reactions
export const recentReactions = writable<string[]>([]);

// Store for loading state
export const reactionLoading = writable<boolean>(false);

export class ReactionService {
  private static instance: ReactionService;
  
  private constructor() {}
  
  static getInstance(): ReactionService {
    if (!ReactionService.instance) {
      ReactionService.instance = new ReactionService();
    }
    return ReactionService.instance;
  }
  
  /**
   * Add a reaction to a message
   */
  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    reactionLoading.set(true);
    try {
      await invoke('add_reaction', {
        channel,
        timestamp,
        emoji
      });
      
      // Add to recent reactions
      this.updateRecentReactions(emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
      throw error;
    } finally {
      reactionLoading.set(false);
    }
  }
  
  /**
   * Remove a reaction from a message
   */
  async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    reactionLoading.set(true);
    try {
      await invoke('remove_reaction', {
        channel,
        timestamp,
        emoji
      });
    } catch (error) {
      console.error('Failed to remove reaction:', error);
      throw error;
    } finally {
      reactionLoading.set(false);
    }
  }
  
  /**
   * Get reactions for a message
   */
  async getReactions(channel: string, timestamp: string): Promise<EmojiReaction[]> {
    try {
      const reactions = await invoke<EmojiReaction[]>('get_reactions', {
        channel,
        timestamp
      });
      return reactions;
    } catch (error) {
      console.error('Failed to get reactions:', error);
      return [];
    }
  }
  
  /**
   * Toggle a reaction (add if not present, remove if present)
   */
  async toggleReaction(
    channel: string, 
    timestamp: string, 
    emoji: string,
    currentReactions?: EmojiReaction[]
  ): Promise<void> {
    // Check if reaction already exists
    const hasReaction = currentReactions?.some(r => r.name === emoji) || false;
    
    if (hasReaction) {
      await this.removeReaction(channel, timestamp, emoji);
    } else {
      await this.addReaction(channel, timestamp, emoji);
    }
  }
  
  /**
   * Add reaction by shortcut number (1-9)
   */
  async addReactionByShortcut(
    channel: string, 
    timestamp: string, 
    shortcut: number,
    currentReactions?: EmojiReaction[]
  ): Promise<void> {
    const mappings = get(reactionMappings);
    const mapping = mappings.find(m => m.shortcut === shortcut);
    
    if (!mapping) {
      console.warn(`No reaction mapping found for shortcut ${shortcut}`);
      return;
    }
    
    await this.toggleReaction(channel, timestamp, mapping.emoji, currentReactions);
  }
  
  /**
   * Update recent reactions list
   */
  private updateRecentReactions(emoji: string): void {
    recentReactions.update(recent => {
      // Remove if already exists
      const filtered = recent.filter(e => e !== emoji);
      // Add to beginning
      const updated = [emoji, ...filtered];
      // Keep only last 20
      return updated.slice(0, 20);
    });
  }
  
  /**
   * Load reaction mappings from settings
   */
  loadMappings(mappings?: ReactionMapping[]): void {
    if (mappings && mappings.length > 0) {
      reactionMappings.set(mappings);
    }
  }
  
  /**
   * Update reaction mappings
   */
  updateMappings(mappings: ReactionMapping[]): void {
    reactionMappings.set(mappings);
  }
  
  /**
   * Get emoji by shortcut
   */
  getEmojiByShortcut(shortcut: number): ReactionMapping | undefined {
    const mappings = get(reactionMappings);
    return mappings.find(m => m.shortcut === shortcut);
  }
  
  /**
   * Reset to default mappings
   */
  resetToDefaults(): void {
    reactionMappings.set(DEFAULT_REACTION_MAPPINGS);
  }
}

// Export singleton instance
export const reactionService = ReactionService.getInstance();