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
   * Check if a keyboard event matches a shortcut
   */
  private matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
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
    console.log('🔍 DEBUG: KeyboardService registerHandler', {
      shortcutKey,
      shortcut,
      handlerCount: this.handlers.size
    });
    if (shortcut) {
      this.handlers.set(shortcutKey, handler);
      console.log('🔍 DEBUG: Handler registered', { 
        shortcutKey, 
        newHandlerCount: this.handlers.size,
        registeredKeys: Array.from(this.handlers.keys())
      });
    } else {
      console.warn('🔍 DEBUG: No shortcut found for key:', shortcutKey);
    }
  }

  /**
   * Unregister a keyboard shortcut handler
   */
  unregisterHandler(shortcutKey: keyof KeyboardShortcuts): void {
    const deleted = this.handlers.delete(shortcutKey);
    console.log('🔍 DEBUG: KeyboardService unregisterHandler', {
      shortcutKey,
      deleted,
      remainingHandlerCount: this.handlers.size,
      remainingKeys: Array.from(this.handlers.keys())
    });
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
    if (['r', 'p', 't'].includes(event.key.toLowerCase()) || (event.key === 'Enter' && event.altKey)) {
      console.log('🔍 DEBUG: KeyboardService handling key event', {
        key: event.key,
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

    // Check if emoji/reaction picker is open - if so, don't handle navigation
    const reactionPicker = document.querySelector('.reaction-picker');
    if (reactionPicker) {
      // Don't handle any navigation keys when reaction picker is open
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key) ||
          (event.key >= '1' && event.key <= '9')) {
        console.log('🔍 DEBUG: Reaction picker is open, skipping keyboard event handling');
        return false;
      }
    }

    // Check if thread view has focus - if so, let it handle its own navigation
    const threadViewElement = document.querySelector('.thread-view');
    if (threadViewElement && threadViewElement.contains(target)) {
      // Don't handle arrow keys when thread view has focus
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        return false;
      }
    }

    // Check each registered handler
    for (const [shortcutKey, handler] of this.handlers.entries()) {
      const shortcut = this.shortcuts[shortcutKey as keyof KeyboardShortcuts];
      
      if (shortcut && this.matchesShortcut(event, shortcut)) {
        // Only log for relevant keys to reduce noise
        if (['r', 'p', 't'].includes(event.key.toLowerCase()) || (event.key === 'Enter' && event.altKey) || ['openReactionPicker', 'postMessage', 'replyInThread', 'openUrls'].includes(shortcutKey)) {
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
        
        if (['r', 'p', 't'].includes(event.key.toLowerCase())) {
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
   * Get formatted shortcut display string
   */
  getShortcutDisplay(shortcutKey: keyof KeyboardShortcuts): string {
    const shortcut = this.shortcuts[shortcutKey];
    if (!shortcut) return '';

    const isMac = navigator.platform.toLowerCase().includes('mac');
    
    // Replace Ctrl with Cmd on Mac
    let display = shortcut;
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
    
    return display;
  }

  /**
   * Get all registered shortcuts for display
   */
  getAllShortcuts(): Array<{ key: keyof KeyboardShortcuts; display: string; shortcut: string }> {
    const shortcuts: Array<{ key: keyof KeyboardShortcuts; display: string; shortcut: string }> = [];
    
    for (const key in this.shortcuts) {
      const shortcutKey = key as keyof KeyboardShortcuts;
      shortcuts.push({
        key: shortcutKey,
        display: this.getShortcutDisplay(shortcutKey),
        shortcut: this.shortcuts[shortcutKey]
      });
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