import type { KeyboardShortcuts } from '../types/slack';

export interface KeyboardHandler {
  action: () => void | Promise<void>;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  allowInInput?: boolean;
}

export class KeyboardService {
  private handlers: Map<string, KeyboardHandler> = new Map();
  private shortcuts: KeyboardShortcuts;
  private enabled: boolean = true;

  constructor(shortcuts: KeyboardShortcuts) {
    this.shortcuts = shortcuts;
  }

  /**
   * Parse a shortcut string into key components
   */
  private parseShortcut(shortcut: string): {
    key: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  } {
    const parts = shortcut.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    
    return {
      key: key === 'escape' ? 'escape' : 
           key === 'enter' ? 'enter' :
           key === 'arrowup' ? 'arrowup' :
           key === 'arrowdown' ? 'arrowdown' :
           key === 'arrowleft' ? 'arrowleft' :
           key === 'arrowright' ? 'arrowright' :
           key === 'tab' ? 'tab' :
           key === 'delete' ? 'delete' :
           key === 'backspace' ? 'backspace' :
           key === 'space' ? ' ' :
           key === 'home' ? 'home' :
           key === 'end' ? 'end' :
           key === ',' ? ',' : key,
      ctrl: parts.includes('ctrl') || parts.includes('control'),
      alt: parts.includes('alt'),
      shift: parts.includes('shift'),
      meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command')
    };
  }

  /**
   * Check if a keyboard event matches a shortcut (supports multiple shortcuts)
   */
  private matchesShortcut(event: KeyboardEvent, shortcut: string | string[]): boolean {
    // Handle multiple shortcuts
    const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
    return shortcuts.some(s => this.matchesSingleShortcut(event, s));
  }

  /**
   * Check if a keyboard event matches a single shortcut string
   */
  private matchesSingleShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const parsed = this.parseShortcut(shortcut);
    const eventKey = event.key.toLowerCase();
    
    // Handle special keys
    const keyMatch = eventKey === parsed.key || 
                    (eventKey === 'escape' && parsed.key === 'escape') ||
                    (eventKey === 'enter' && parsed.key === 'enter') ||
                    (eventKey === 'arrowup' && parsed.key === 'arrowup') ||
                    (eventKey === 'arrowdown' && parsed.key === 'arrowdown') ||
                    (eventKey === 'arrowleft' && parsed.key === 'arrowleft') ||
                    (eventKey === 'arrowright' && parsed.key === 'arrowright') ||
                    (eventKey === 'tab' && parsed.key === 'tab') ||
                    (eventKey === 'delete' && parsed.key === 'delete') ||
                    (eventKey === 'backspace' && parsed.key === 'backspace') ||
                    (eventKey === 'home' && parsed.key === 'home') ||
                    (eventKey === 'end' && parsed.key === 'end');

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;
    
    return keyMatch &&
           ((parsed.ctrl && ctrlOrCmd) || (!parsed.ctrl && !ctrlOrCmd)) &&
           ((parsed.alt && event.altKey) || (!parsed.alt && !event.altKey)) &&
           ((parsed.shift && event.shiftKey) || (!parsed.shift && !event.shiftKey)) &&
           ((parsed.meta && event.metaKey) || (!parsed.meta && !event.metaKey && !isMac));
  }

  /**
   * Register a keyboard shortcut handler
   */
  registerHandler(shortcutKey: keyof KeyboardShortcuts, handler: KeyboardHandler): void {
    const shortcut = this.shortcuts[shortcutKey];
    if (shortcut) {
      this.handlers.set(shortcutKey, handler);
    } else {
      console.warn('No shortcut found for key:', shortcutKey);
    }
  }

  /**
   * Unregister a keyboard shortcut handler
   */
  unregisterHandler(shortcutKey: keyof KeyboardShortcuts): void {
    this.handlers.delete(shortcutKey);
  }

  /**
   * Update shortcuts configuration
   */
  updateShortcuts(shortcuts: KeyboardShortcuts): void {
    this.shortcuts = shortcuts;
  }

  /**
   * Handle keyboard events
   */
  handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (!this.enabled) return false;

    // Only log for specific keys to reduce noise
    if (['r', 'p', 't', '1', '2', '3', '/'].includes(event.key.toLowerCase()) || (event.key === 'Enter' && event.altKey) || (event.key === '/' && event.ctrlKey)) {
      console.log('🔍 DEBUG: KeyboardService handling key event', {
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        enabled: this.enabled,
        handlerCount: this.handlers.size,
        registeredKeys: Array.from(this.handlers.keys())
      });
    }

    // Check if the event target is an input element
    const target = event.target as HTMLElement;
    const isInInput = target.tagName === 'INPUT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.contentEditable === 'true';

    // Check if emoji/reaction picker is open - if so, block most keyboard shortcuts
    const reactionPicker = document.querySelector('.reaction-picker');
    if (reactionPicker) {
      // Allow only specific keys that the picker handles
      const allowedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'];
      const isNumberKey = event.key >= '1' && event.key <= '9';
      const isAllowed = allowedKeys.includes(event.key) || isNumberKey;

      // Block all other shortcuts (including 't', 'p', 'r', etc.)
      if (!isAllowed) {
        console.log('🔍 DEBUG: Reaction picker is open, blocking keyboard shortcut:', event.key);
        return false;
      }

      // Let the picker handle its own keys
      console.log('🔍 DEBUG: Reaction picker is open, allowing key for picker:', event.key);
      return false;
    }

    // Check if saved search dropdown is open - if so, let it handle navigation keys
    const savedSearchDropdown = document.querySelector('.saved-search-dropdown');
    if (savedSearchDropdown) {
      // These keys are handled by the SavedSearchManager component
      const dropdownHandledKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab'];
      if (dropdownHandledKeys.includes(event.key)) {
        console.log('🔍 DEBUG: Saved search dropdown is open, letting it handle key:', event.key);
        return false;
      }

      // Also block j/k navigation when saved search is open
      if (event.key === 'j' || event.key === 'k') {
        console.log('🔍 DEBUG: Saved search dropdown is open, blocking j/k navigation');
        return false;
      }
    }

    // Check if thread view has focus - if so, let it handle its own navigation
    const threadViewElement = document.querySelector('.thread-view');
    if (threadViewElement && threadViewElement.contains(target)) {
      // Thread view handles these keys internally
      const navigationKeys = ['ArrowUp', 'ArrowDown', 'j', 'k', 'J', 'K', 'h', 'H', 'e', 'E', 'Home', 'End'];
      if (navigationKeys.includes(event.key)) {
        return false;
      }
    }

    // Check each registered handler
    for (const [shortcutKey, handler] of this.handlers.entries()) {
      const shortcut = this.shortcuts[shortcutKey as keyof KeyboardShortcuts];
      
      if (shortcut && this.matchesShortcut(event, shortcut)) {
        // Only log for relevant keys to reduce noise
        if (['r', 'p', 't', '1', '2', '3', '/'].includes(event.key.toLowerCase()) || (event.key === 'Enter' && event.altKey) || (event.key === '/' && event.ctrlKey) || ['openReactionPicker', 'postMessage', 'replyInThread', 'openUrls', 'focusThread', 'focusResults', 'focusSearchBar', 'toggleSavedSearches'].includes(shortcutKey)) {
          console.log('🔍 DEBUG: Handler matched', {
            shortcutKey,
            shortcut,
            isInInput,
            allowInInput: handler.allowInInput
          });
        }
        
        // Skip if in input field and handler doesn't allow it
        if (isInInput && !handler.allowInInput) {
          if (['r', 'p', 't'].includes(event.key.toLowerCase())) {
            console.log('🔍 DEBUG: Skipping handler - in input and not allowed');
          }
          continue;
        }

        // Execute handler
        if (handler.preventDefault !== false) {
          event.preventDefault();
        }
        if (handler.stopPropagation !== false) {
          event.stopPropagation();
        }
        
        if (['r', 'p', 't', '1', '2', '3'].includes(event.key.toLowerCase()) || ['focusThread', 'focusResults', 'focusSearchBar'].includes(shortcutKey)) {
          console.log('🔍 DEBUG: Executing handler action for', shortcutKey);
        }
        
        // Execute the action
        Promise.resolve(handler.action()).catch(console.error);
        return true;
      }
    }

    if (['r', 'p', 't'].includes(event.key.toLowerCase())) {
      console.log('🔍 DEBUG: No handler matched for key event');
    }

    return false;
  }

  /**
   * Enable/disable keyboard service
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get formatted shortcut display string (supports multiple shortcuts)
   */
  getShortcutDisplay(shortcutKey: keyof KeyboardShortcuts): string {
    const shortcut = this.shortcuts[shortcutKey];
    if (!shortcut) return '';

    const isMac = navigator.platform.toLowerCase().includes('mac');
    
    // Handle multiple shortcuts
    const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
    
    return shortcuts.map(s => {
      // Replace Ctrl with Cmd on Mac
      let display = s;
      if (isMac) {
        display = display.replace(/Ctrl/gi, '⌘');
        display = display.replace(/Alt/gi, '⌥');
        display = display.replace(/Shift/gi, '⇧');
      }
      
      // Format special keys
      display = display.replace(/ArrowUp/gi, '↑');
      display = display.replace(/ArrowDown/gi, '↓');
      display = display.replace(/ArrowLeft/gi, '←');
      display = display.replace(/ArrowRight/gi, '→');
      display = display.replace(/Enter/gi, '⏎');
      display = display.replace(/Escape/gi, 'Esc');
      display = display.replace(/Space/gi, '␣');
      display = display.replace(/Tab/gi, '⇥');
      display = display.replace(/Delete/gi, 'Del');
      display = display.replace(/Backspace/gi, '⌫');
      display = display.replace(/Home/gi, 'Home');
      display = display.replace(/End/gi, 'End');
      
      // Format single letters (J, K) to uppercase for display
      if (display.length === 1) {
        display = display.toUpperCase();
      }
      
      return display;
    }).join(' / ');
  }

  /**
   * Get all registered shortcuts for display
   */
  getAllShortcuts(): Array<{ key: keyof KeyboardShortcuts; display: string; shortcut: string }> {
    const shortcuts: Array<{ key: keyof KeyboardShortcuts; display: string; shortcut: string }> = [];
    
    for (const key in this.shortcuts) {
      const shortcutKey = key as keyof KeyboardShortcuts;
      const shortcutValue = this.shortcuts[shortcutKey];
      if (shortcutValue) {
        shortcuts.push({
          key: shortcutKey,
          display: this.getShortcutDisplay(shortcutKey),
          shortcut: Array.isArray(shortcutValue) ? shortcutValue.join(' / ') : shortcutValue
        });
      }
    }
    
    return shortcuts;
  }
}

// Create a singleton instance
let keyboardServiceInstance: KeyboardService | null = null;

export function initKeyboardService(shortcuts: KeyboardShortcuts): KeyboardService {
  if (!keyboardServiceInstance) {
    keyboardServiceInstance = new KeyboardService(shortcuts);
  } else {
    keyboardServiceInstance.updateShortcuts(shortcuts);
  }
  return keyboardServiceInstance;
}

export function getKeyboardService(): KeyboardService | null {
  return keyboardServiceInstance;
}