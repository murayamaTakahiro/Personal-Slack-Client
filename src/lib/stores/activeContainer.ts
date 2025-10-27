import { writable } from 'svelte/store';

/**
 * Tracks which container (ResultList or ThreadView) was last interacted with by the user.
 * This is used to determine which container should handle global keyboard shortcuts
 * when both containers have selected messages simultaneously.
 */
type ActiveContainer = 'result-list' | 'thread-view' | null;

export const activeContainer = writable<ActiveContainer>('result-list');
