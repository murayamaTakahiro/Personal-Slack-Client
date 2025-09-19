import { writable } from 'svelte/store';

/**
 * Store to track whether the saved search dropdown is open.
 * This is used to coordinate keyboard event handling between components.
 */
export const savedSearchOpen = writable<boolean>(false);