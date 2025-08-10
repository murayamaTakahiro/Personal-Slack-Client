import { writable, get } from 'svelte/store';
import type { AppSettings } from '../types/slack';
import { 
  saveTokenSecure, 
  getTokenSecure, 
  saveWorkspaceSecure, 
  getWorkspaceSecure,
  deleteTokenSecure 
} from '../api/secure';

// Default settings (non-sensitive)
const defaultSettings: AppSettings = {
  maxResults: 100,
  theme: 'auto'
};

// Load non-sensitive settings from localStorage
const storedSettings = typeof window !== 'undefined' 
  ? localStorage.getItem('appSettings')
  : null;
  
const initialSettings: AppSettings = storedSettings 
  ? { ...defaultSettings, ...JSON.parse(storedSettings) }
  : defaultSettings;

// Remove token from localStorage if it exists (migration)
if (typeof window !== 'undefined' && storedSettings) {
  const parsed = JSON.parse(storedSettings);
  if (parsed.token) {
    delete parsed.token;
    delete parsed.workspace;
    localStorage.setItem('appSettings', JSON.stringify(parsed));
  }
}

// Settings store
export const secureSettings = writable<AppSettings>(initialSettings);

// Subscribe to non-sensitive settings changes
secureSettings.subscribe(value => {
  if (typeof window !== 'undefined') {
    // Only save non-sensitive settings to localStorage
    const { token, workspace, ...nonSensitive } = value;
    localStorage.setItem('appSettings', JSON.stringify(nonSensitive));
  }
});

// Helper functions for secure operations
export async function updateTokenSecure(token: string) {
  await saveTokenSecure(token);
  secureSettings.update(s => ({ ...s, token }));
}

export async function updateWorkspaceSecure(workspace: string) {
  await saveWorkspaceSecure(workspace);
  secureSettings.update(s => ({ ...s, workspace }));
}

export async function loadSecureSettings() {
  try {
    const [token, workspace] = await Promise.all([
      getTokenSecure(),
      getWorkspaceSecure()
    ]);
    
    secureSettings.update(s => ({
      ...s,
      ...(token && { token }),
      ...(workspace && { workspace })
    }));
    
    return { token, workspace };
  } catch (error) {
    console.error('Failed to load secure settings:', error);
    return { token: null, workspace: null };
  }
}

export async function clearSecureData() {
  await deleteTokenSecure();
  secureSettings.update(s => {
    const { token, workspace, ...rest } = s;
    return rest;
  });
}

// Non-secure helper functions (unchanged)
export function updateMaxResults(maxResults: number) {
  secureSettings.update(s => ({ ...s, maxResults }));
}

export function updateTheme(theme: 'light' | 'dark' | 'auto') {
  secureSettings.update(s => ({ ...s, theme }));
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