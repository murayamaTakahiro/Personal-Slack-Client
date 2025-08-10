import { writable } from 'svelte/store';
import type { AppSettings } from '../types/slack';

// Default settings
const defaultSettings: AppSettings = {
  maxResults: 100,
  theme: 'auto'
};

// Load settings from localStorage
const storedSettings = localStorage.getItem('appSettings');
const initialSettings: AppSettings = storedSettings 
  ? { ...defaultSettings, ...JSON.parse(storedSettings) }
  : defaultSettings;

// Settings store
export const settings = writable<AppSettings>(initialSettings);

// Subscribe to settings changes and save to localStorage
settings.subscribe(value => {
  localStorage.setItem('appSettings', JSON.stringify(value));
});

// Helper functions
export function updateToken(token: string) {
  settings.update(s => ({ ...s, token }));
}

export function updateWorkspace(workspace: string) {
  settings.update(s => ({ ...s, workspace }));
}

export function updateMaxResults(maxResults: number) {
  settings.update(s => ({ ...s, maxResults }));
}

export function updateTheme(theme: 'light' | 'dark' | 'auto') {
  settings.update(s => ({ ...s, theme }));
  applyTheme(theme);
}

// Apply theme to document
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const root = document.documentElement;
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  applyTheme(initialSettings.theme);
}