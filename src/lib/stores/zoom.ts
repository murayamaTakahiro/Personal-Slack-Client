import { writable, get } from 'svelte/store';
import { saveToStore, loadFromStore } from './persistentStore';

// Default zoom settings
const MIN_ZOOM = 50;  // 50%
const MAX_ZOOM = 200; // 200%
const DEFAULT_ZOOM = 100; // 100%
const ZOOM_STEP = 10; // 10% increments

interface ZoomState {
  level: number;
}

// Initialize zoom store
const createZoomStore = () => {
  const { subscribe, set, update } = writable<ZoomState>({ level: DEFAULT_ZOOM });

  return {
    subscribe,
    
    async initialize() {
      try {
        const savedZoom = await loadFromStore<ZoomState>('zoomSettings', { level: DEFAULT_ZOOM });
        const validatedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, savedZoom.level));
        set({ level: validatedZoom });
        applyZoom(validatedZoom);
      } catch (error) {
        console.error('[Zoom] Failed to load zoom settings:', error);
        set({ level: DEFAULT_ZOOM });
        applyZoom(DEFAULT_ZOOM);
      }
    },

    async zoomIn() {
      update(state => {
        const newLevel = Math.min(MAX_ZOOM, state.level + ZOOM_STEP);
        applyZoom(newLevel);
        saveZoomLevel(newLevel);
        return { level: newLevel };
      });
    },

    async zoomOut() {
      update(state => {
        const newLevel = Math.max(MIN_ZOOM, state.level - ZOOM_STEP);
        applyZoom(newLevel);
        saveZoomLevel(newLevel);
        return { level: newLevel };
      });
    },

    async resetZoom() {
      set({ level: DEFAULT_ZOOM });
      applyZoom(DEFAULT_ZOOM);
      await saveZoomLevel(DEFAULT_ZOOM);
    },

    async setZoom(level: number) {
      const validatedLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
      set({ level: validatedLevel });
      applyZoom(validatedLevel);
      await saveZoomLevel(validatedLevel);
    }
  };
};

// Apply zoom to the document
function applyZoom(zoomLevel: number) {
  const scale = zoomLevel / 100;
  const root = document.documentElement;
  
  // Apply font-size scaling instead of viewport zoom
  if (root) {
    // Set CSS variables for reference
    root.style.setProperty('--app-zoom', scale.toString());
    root.style.setProperty('--app-zoom-percent', `${zoomLevel}%`);
    
    // Calculate base font size (default is usually 16px)
    const baseFontSize = 16;
    const scaledFontSize = baseFontSize * scale;
    
    // Apply scaled font size to root element
    root.style.fontSize = `${scaledFontSize}px`;
    
    // Remove any zoom property to prevent viewport scaling
    root.style.zoom = '';
  }
}

// Save zoom level to persistent storage
async function saveZoomLevel(level: number) {
  try {
    await saveToStore('zoomSettings', { level });
    console.log(`[Zoom] Saved zoom level: ${level}%`);
  } catch (error) {
    console.error('[Zoom] Failed to save zoom settings:', error);
  }
}

// Export zoom store instance
export const zoomStore = createZoomStore();

// Export utility functions
export function getZoomLevel(): number {
  let level = DEFAULT_ZOOM;
  const unsubscribe = zoomStore.subscribe(state => {
    level = state.level;
  });
  unsubscribe();
  return level;
}

export function formatZoomLevel(level: number): string {
  return `${level}%`;
}