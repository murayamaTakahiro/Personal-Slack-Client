import { invoke } from '@tauri-apps/api/core';
import type { EmojiReaction } from '../types/slack';

export async function addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
  return invoke('add_reaction', {
    channel,
    timestamp,
    emoji
  });
}

export async function removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
  return invoke('remove_reaction', {
    channel,
    timestamp,
    emoji
  });
}

export async function getReactions(channel: string, timestamp: string): Promise<EmojiReaction[]> {
  return invoke('get_reactions', {
    channel,
    timestamp
  });
}