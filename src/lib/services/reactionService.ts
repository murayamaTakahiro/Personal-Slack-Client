import { invoke } from '@tauri-apps/api/core';
import type { EmojiReaction, ReactionMapping } from '../types/slack';
import { get, writable } from 'svelte/store';
import { loadFromStore } from '../stores/persistentStore';

// Default emoji mappings - EDIT THIS TO CUSTOMIZE YOUR EMOJIS
export const DEFAULT_REACTION_MAPPINGS: ReactionMapping[] = [
  { shortcut: 1, emoji: 'thumbsup', display: '👍' },
  { shortcut: 2, emoji: 'arigataya', display: '🙏' },
  { shortcut: 3, emoji: 'kakuninshimasu', display: 'kakunin' },
  { shortcut: 4, emoji: 'ohayougozaimasu', display: '☀️' },
  { shortcut: 5, emoji: 'sasuga2', display: 'sasuga' },
  { shortcut: 6, emoji: 'otsukareamadesu', display: 'otsukare' },
  { shortcut: 7, emoji: 'tasikani', display: 'tasikani' },
  { shortcut: 8, emoji: 'tasukarimasu', display: 'tasukaru' },
  { shortcut: 9, emoji: 'ohayougozaimasu', display: 'oha' },
];

// Store for reaction mappings - will be synced with settings store
export const reactionMappings = writable<ReactionMapping[]>(DEFAULT_REACTION_MAPPINGS);

// Initialize reaction mappings from settings store
export async function initializeReactionMappings(mappings?: ReactionMapping[]) {
  if (mappings && Array.isArray(mappings)) {
    console.log('[ReactionService] Initializing with mappings:', mappings);
    reactionMappings.set(mappings);
    return mappings;
  }

  // Fallback to loading from store if not provided
  try {
    const storedSettings = await loadFromStore<any>('appSettings', {});
    if (storedSettings.reactionMappings && Array.isArray(storedSettings.reactionMappings)) {
      console.log('[ReactionService] Loaded mappings from store:', storedSettings.reactionMappings);
      reactionMappings.set(storedSettings.reactionMappings);
      return storedSettings.reactionMappings;
    }
  } catch (e) {
    console.error('[ReactionService] Failed to load saved reaction mappings:', e);
  }

  console.log('[ReactionService] Using default mappings');
  return DEFAULT_REACTION_MAPPINGS;
}

// Store for recent reactions
export const recentReactions = writable<string[]>([]);

// Store for loading state
export const reactionLoading = writable<boolean>(false);

export class ReactionService {
  private static instance: ReactionService;

  private constructor() { }

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
    // Normalize emoji name (remove colons)
    const emojiName = emoji.replace(/^:/, '').replace(/:$/, '');

    // Slack API quirk: Returns 'thumbsup' but accepts '+1' for operations
    // Check for both variations
    const hasReaction = currentReactions?.some(r => {
      const reactionName = r.name.replace(/^:/, '').replace(/:$/, '');
      // Check if reaction matches directly OR if it's the thumbsup/+1 case
      return reactionName === emojiName ||
        (emojiName === '+1' && reactionName === 'thumbsup') ||
        (emojiName === '-1' && reactionName === 'thumbsdown');
    }) || false;

    if (hasReaction) {
      await this.removeReaction(channel, timestamp, emojiName);
    } else {
      await this.addReaction(channel, timestamp, emojiName);
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
