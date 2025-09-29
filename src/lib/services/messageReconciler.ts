/**
 * Message Reconciler Service
 * Provides React-like reconciliation for seamless message updates
 */

import type { Message } from '../types/slack';

export interface ReconciliationResult {
  messages: Message[];
  changes: {
    added: Set<string>;
    updated: Set<string>;
    removed: Set<string>;
  };
}

export class MessageReconciler {
  /**
   * Reconcile old and new message lists for seamless updates
   * Similar to React's reconciliation algorithm
   */
  reconcile(
    currentMessages: Message[],
    newMessages: Message[],
    isRealtimeUpdate: boolean = false
  ): ReconciliationResult {
    const currentMap = new Map(currentMessages.map(m => [m.ts, m]));
    const newMap = new Map(newMessages.map(m => [m.ts, m]));

    const added = new Set<string>();
    const updated = new Set<string>();
    const removed = new Set<string>();

    // For realtime updates, preserve existing messages and only add new ones
    if (isRealtimeUpdate) {
      // Keep all current messages
      const reconciled: Message[] = [...currentMessages];
      const existingIds = new Set(currentMessages.map(m => m.ts));

      // Add only truly new messages
      for (const [id, msg] of newMap) {
        if (!existingIds.has(id)) {
          reconciled.unshift(msg); // Add to beginning
          added.add(id);
        } else {
          // Check if message was updated (reactions, edits, etc.)
          const current = currentMap.get(id);
          if (current) {
            const index = reconciled.findIndex(m => m.ts === id);
            if (index !== -1) {
              // Smart merge: preserve existing reactions if new message doesn't have them
              // This prevents reactions from disappearing during updates
              const mergedMessage = { ...msg };

              // If the current message has reactions but new message doesn't, preserve them
              if (current.reactions && current.reactions.length > 0 && (!msg.reactions || msg.reactions.length === 0)) {
                mergedMessage.reactions = current.reactions;
              }

              // If the current message has more reactions than the new message, use the current ones
              if (current.reactions && msg.reactions && current.reactions.length > msg.reactions.length) {
                mergedMessage.reactions = current.reactions;
              }

              reconciled[index] = mergedMessage;

              // Check if actually changed
              if (this.hasChanged(current, mergedMessage)) {
                updated.add(id);
              }
            }
          }
        }
      }

      // Sort by timestamp (newest first)
      reconciled.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));

      return {
        messages: reconciled,
        changes: { added, updated, removed }
      };
    }

    // For normal searches, replace everything
    return {
      messages: newMessages,
      changes: {
        added: new Set(newMessages.map(m => m.ts)),
        updated: new Set(),
        removed: new Set(currentMessages.map(m => m.ts))
      }
    };
  }

  /**
   * Check if a message has meaningful changes
   */
  private hasChanged(oldMsg: Message, newMsg: Message): boolean {
    // Check reactions
    if (JSON.stringify(oldMsg.reactions) !== JSON.stringify(newMsg.reactions)) {
      return true;
    }

    // Check if edited
    if (oldMsg.edited?.ts !== newMsg.edited?.ts) {
      return true;
    }

    // Check thread replies
    if (oldMsg.reply_count !== newMsg.reply_count) {
      return true;
    }

    // Check files
    if (JSON.stringify(oldMsg.files) !== JSON.stringify(newMsg.files)) {
      return true;
    }

    return false;
  }

  /**
   * Check if the new message has more data than the old message
   * This prevents overwriting messages that have reactions with messages that don't
   */
  private hasMoreData(newMsg: Message, oldMsg: Message): boolean {
    // New message has reactions but old doesn't
    if (newMsg.reactions && newMsg.reactions.length > 0 && (!oldMsg.reactions || oldMsg.reactions.length === 0)) {
      return true;
    }

    // New message has more reactions than old
    if (newMsg.reactions && oldMsg.reactions && newMsg.reactions.length > oldMsg.reactions.length) {
      return true;
    }

    // New message has thread replies but old doesn't
    if (newMsg.reply_count && newMsg.reply_count > 0 && !oldMsg.reply_count) {
      return true;
    }

    // New message has more thread replies
    if (newMsg.reply_count && oldMsg.reply_count && newMsg.reply_count > oldMsg.reply_count) {
      return true;
    }

    return false;
  }

  /**
   * Apply minimal DOM updates based on changes
   */
  getUpdateStrategy(changes: ReconciliationResult['changes']): 'full' | 'incremental' | 'none' {
    const totalChanges = changes.added.size + changes.updated.size + changes.removed.size;

    if (totalChanges === 0) {
      return 'none';
    }

    // If too many changes, do a full update
    if (totalChanges > 50 || changes.removed.size > 10) {
      return 'full';
    }

    // Otherwise, do incremental updates
    return 'incremental';
  }
}

export const messageReconciler = new MessageReconciler();