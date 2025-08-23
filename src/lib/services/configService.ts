import type { ReactionMapping } from '../types/slack';
import { reactionMappings } from './reactionService';

export interface ConfigFile {
  reactionMappings?: ReactionMapping[];
  additionalEmojis?: Array<{ name: string; display: string }>;
}

/**
 * Load configuration from external config.json file
 * Simplified version that works in both dev and production
 */
export async function loadConfigFile(): Promise<ConfigFile | null> {
  try {
    console.log('[ConfigService] Loading config.json...');
    
    // Simply try to fetch the config file
    const response = await fetch('/config.json');
    
    if (!response.ok) {
      console.warn('[ConfigService] config.json not found, using defaults');
      return null;
    }
    
    const config = await response.json();
    console.log('[ConfigService] Loaded config:', config);
    return config;
  } catch (error) {
    console.error('[ConfigService] Failed to load config.json:', error);
    return null;
  }
}

/**
 * Apply configuration to the application
 */
export async function applyConfig(config: ConfigFile): Promise<void> {
  if (config.reactionMappings) {
    console.log('[ConfigService] Applying reaction mappings from config');
    reactionMappings.set(config.reactionMappings);
  }
}

/**
 * Initialize configuration on app startup
 * Simplified - just uses DEFAULT_REACTION_MAPPINGS from reactionService
 */
export async function initializeConfig(): Promise<void> {
  // No need to do anything - reactionService already has the defaults
  console.log('[ConfigService] Using DEFAULT_REACTION_MAPPINGS from reactionService.ts');
}

/**
 * Watch for config file changes (development only)
 */
export function watchConfigFile(callback: () => void): void {
  if (import.meta.env.DEV) {
    // In development, poll for changes every 5 seconds
    setInterval(async () => {
      const config = await loadConfigFile();
      if (config) {
        await applyConfig(config);
        callback();
      }
    }, 5000);
  }
}