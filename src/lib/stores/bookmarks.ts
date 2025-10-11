import { writable, derived, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';
import { workspaceStore, activeWorkspace } from './workspaces';
import type { MessageBookmark, Message } from '../types/slack';
import { decodeSlackText } from '../utils/htmlEntities';

// Storage key is workspace-specific
const getStorageKey = (workspaceId: string) => `bookmarks_${workspaceId}`;
const MAX_BOOKMARKS = 100;

// Create the main store
function createBookmarkStore() {
  const { subscribe, set, update } = writable<MessageBookmark[]>([]);

  // Load bookmarks on initialization
  const initialize = async () => {
    try {
      const workspace = get(activeWorkspace);
      if (!workspace) {
        console.log('[Bookmarks] No active workspace');
        set([]);
        return;
      }

      const storageKey = getStorageKey(workspace.id);
      const stored = await loadFromStore<MessageBookmark[]>(storageKey, []);

      // Convert date strings back to Date objects
      const bookmarks = stored.map(b => ({
        ...b,
        timestamp: new Date(b.timestamp),
        lastUsed: b.lastUsed ? new Date(b.lastUsed) : undefined
      }));
      set(bookmarks);
      console.log(`[Bookmarks] Initialized with ${bookmarks.length} bookmarks for workspace ${workspace.id}`);
    } catch (error) {
      console.error('[Bookmarks] Failed to initialize:', error);
      set([]);
    }
  };

  // Save to persistent storage
  const persist = async (bookmarks: MessageBookmark[]) => {
    const workspace = get(activeWorkspace);
    if (!workspace) {
      console.warn('[Bookmarks] Cannot persist - no active workspace');
      return;
    }
    const storageKey = getStorageKey(workspace.id);
    await saveToStore(storageKey, bookmarks.slice(0, MAX_BOOKMARKS));
  };

  // Generate a unique ID
  const generateId = () => {
    return `bookmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Check if a bookmark already exists for this message
  const findBookmark = (messageTs: string, channelId: string): MessageBookmark | null => {
    const bookmarks = get({ subscribe });
    return bookmarks.find(b => b.messageTs === messageTs && b.channelId === channelId) || null;
  };

  // Add or remove a bookmark for a message
  const toggleBookmark = async (message: Message) => {
    const existing = findBookmark(message.ts, message.channel);

    if (existing) {
      // Remove bookmark
      let updatedBookmarks: MessageBookmark[];
      update(bookmarks => {
        updatedBookmarks = bookmarks.filter(b => b.id !== existing.id);
        return updatedBookmarks;
      });
      await persist(updatedBookmarks!);
      return { added: false, bookmark: existing };
    } else {
      // Add new bookmark
      const messageText = decodeSlackText(message.text);
      const summary = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;

      const newBookmark: MessageBookmark = {
        id: generateId(),
        messageTs: message.ts,
        channelId: message.channel,
        channelName: message.channelName || message.channel,
        summary,
        timestamp: new Date(),
        usageCount: 0,
        isFavorite: false
      };

      let updatedBookmarks: MessageBookmark[];
      update(bookmarks => {
        updatedBookmarks = [newBookmark, ...bookmarks].slice(0, MAX_BOOKMARKS);
        return updatedBookmarks;
      });
      await persist(updatedBookmarks!);
      return { added: true, bookmark: newBookmark };
    }
  };

  // Update a bookmark
  const updateBookmark = async (id: string, updates: Partial<MessageBookmark>) => {
    let updatedBookmarks: MessageBookmark[];
    update(bookmarks => {
      updatedBookmarks = bookmarks.map(b =>
        b.id === id ? { ...b, ...updates } : b
      );
      return updatedBookmarks;
    });
    await persist(updatedBookmarks!);
  };

  // Delete a bookmark
  const deleteBookmark = async (id: string) => {
    let updatedBookmarks: MessageBookmark[];
    update(bookmarks => {
      updatedBookmarks = bookmarks.filter(b => b.id !== id);
      return updatedBookmarks;
    });
    await persist(updatedBookmarks!);
  };

  // Toggle favorite status
  const toggleFavorite = async (id: string) => {
    let updatedBookmarks: MessageBookmark[];
    update(bookmarks => {
      updatedBookmarks = bookmarks.map(b =>
        b.id === id ? { ...b, isFavorite: !b.isFavorite } : b
      );
      return updatedBookmarks;
    });
    await persist(updatedBookmarks!);
  };

  // Use a bookmark (increment usage count)
  const useBookmark = async (id: string) => {
    let updatedBookmarks: MessageBookmark[];
    update(bookmarks => {
      updatedBookmarks = bookmarks.map(b =>
        b.id === id
          ? { ...b, usageCount: b.usageCount + 1, lastUsed: new Date() }
          : b
      );
      return updatedBookmarks;
    });
    await persist(updatedBookmarks!);
  };

  // Clear all bookmarks for current workspace
  const clearAll = async () => {
    set([]);
    await persist([]);
  };

  // Reset the store when switching workspaces
  const reset = () => {
    set([]);
  };

  // Get bookmark by ID
  const getById = (id: string): MessageBookmark | undefined => {
    const bookmarks = get({ subscribe });
    return bookmarks.find(b => b.id === id);
  };

  // Update alias for a bookmark
  const updateAlias = async (id: string, alias: string) => {
    await updateBookmark(id, { alias: alias.trim() || undefined });
  };

  // Check if a message is bookmarked
  const isBookmarked = (messageTs: string, channelId: string): boolean => {
    return findBookmark(messageTs, channelId) !== null;
  };

  return {
    subscribe,
    initialize,
    toggleBookmark,
    updateBookmark,
    updateAlias,
    deleteBookmark,
    toggleFavorite,
    useBookmark,
    clearAll,
    reset,
    getById,
    isBookmarked,
    findBookmark
  };
}

// Create the store instance
export const bookmarkStore = createBookmarkStore();

// Derived stores for filtered views
export const favoriteBookmarks = derived(
  bookmarkStore,
  $bookmarks => $bookmarks.filter(b => b.isFavorite)
    .sort((a, b) => b.usageCount - a.usageCount)
);

export const recentBookmarks = derived(
  bookmarkStore,
  $bookmarks => {
    const sorted = [...$bookmarks]
      .filter(b => b.lastUsed)
      .sort((a, b) => {
        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return dateB - dateA;
      });
    return sorted.slice(0, 10);
  }
);
