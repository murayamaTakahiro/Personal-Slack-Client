/**
 * Focus trap utility for modal dialogs
 * Ensures keyboard navigation stays within the dialog
 */

export interface FocusTrapOptions {
  element: HTMLElement;
  returnFocusTo?: HTMLElement | null;
  onEscape?: () => void;
  initialFocus?: HTMLElement | null;
}

export class FocusTrap {
  private element: HTMLElement;
  private returnFocusTo: HTMLElement | null;
  private onEscape?: () => void;
  private previouslyFocusedElement: HTMLElement | null = null;
  private firstFocusableElement: HTMLElement | null = null;
  private lastFocusableElement: HTMLElement | null = null;
  private focusableElements: HTMLElement[] = [];

  constructor(options: FocusTrapOptions) {
    this.element = options.element;
    this.returnFocusTo = options.returnFocusTo || null;
    this.onEscape = options.onEscape;

    // Store the currently focused element
    this.previouslyFocusedElement = document.activeElement as HTMLElement;

    // Find all focusable elements within the trap
    this.updateFocusableElements();

    // Set initial focus
    if (options.initialFocus) {
      options.initialFocus.focus();
    } else if (this.firstFocusableElement) {
      this.firstFocusableElement.focus();
    }

    // Bind event handlers
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);

    // Add event listeners
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('focusin', this.handleFocusIn, true);
  }

  private updateFocusableElements(): void {
    // Query for all focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(',');

    const elements = this.element.querySelectorAll<HTMLElement>(focusableSelectors);
    this.focusableElements = Array.from(elements).filter(el => {
      // Filter out invisible elements
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    this.firstFocusableElement = this.focusableElements[0] || null;
    this.lastFocusableElement = this.focusableElements[this.focusableElements.length - 1] || null;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Handle Escape key
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (this.onEscape) {
        this.onEscape();
      }
      return;
    }

    // Handle Tab key for focus trap
    if (event.key === 'Tab') {
      // Update focusable elements in case DOM changed
      this.updateFocusableElements();

      if (this.focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      const currentIndex = this.focusableElements.indexOf(activeElement);

      if (event.shiftKey) {
        // Shift+Tab - move focus backwards
        if (currentIndex <= 0) {
          // We're at the first element or outside the trap, wrap to last
          event.preventDefault();
          this.lastFocusableElement?.focus();
        }
      } else {
        // Tab - move focus forwards
        if (currentIndex === this.focusableElements.length - 1 || currentIndex === -1) {
          // We're at the last element or outside the trap, wrap to first
          event.preventDefault();
          this.firstFocusableElement?.focus();
        }
      }
    }
  }

  private handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;

    // If focus moves outside the trap element, bring it back
    if (!this.element.contains(target)) {
      event.preventDefault();
      event.stopPropagation();

      // Try to focus the first focusable element
      if (this.firstFocusableElement) {
        this.firstFocusableElement.focus();
      } else {
        // If no focusable elements, focus the trap element itself
        this.element.focus();
      }
    }
  }

  public destroy(): void {
    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('focusin', this.handleFocusIn, true);

    // Return focus to the previously focused element
    const elementToFocus = this.returnFocusTo || this.previouslyFocusedElement;
    if (elementToFocus && document.body.contains(elementToFocus)) {
      // Use setTimeout to ensure focus happens after any other cleanup
      setTimeout(() => {
        elementToFocus.focus();
      }, 0);
    }
  }

  public updateFocus(): void {
    // Public method to update focusable elements if DOM changes
    this.updateFocusableElements();
  }
}

/**
 * Create a focus trap for a modal dialog
 * Returns a destroy function to clean up the trap
 */
export function createFocusTrap(options: FocusTrapOptions): () => void {
  const trap = new FocusTrap(options);
  return () => trap.destroy();
}