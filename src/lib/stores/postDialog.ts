import { writable } from 'svelte/store';

// Global store to track PostDialog visibility
export const isPostDialogOpen = writable(false);