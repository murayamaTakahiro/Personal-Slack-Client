import { writable } from 'svelte/store';

export interface AccessKeyMapping {
  id: string;              // Unique identifier
  key: string;             // Access key (A-Z, 0-9)
  element: HTMLElement;    // Target DOM element
  label: string;           // Display label (usually same as key)
  action: () => void;      // Action to execute
  priority: number;        // Priority when collision occurs (higher priority wins)
}

export interface AccessKeyState {
  isActive: boolean;                          // Whether Alt key is pressed
  mappings: Map<string, AccessKeyMapping>;    // key -> mapping
  visibleMappings: AccessKeyMapping[];        // Currently visible mappings
}

const initialState: AccessKeyState = {
  isActive: false,
  mappings: new Map(),
  visibleMappings: []
};

function createAccessKeyModeStore() {
  const { subscribe, set, update } = writable<AccessKeyState>(initialState);

  return {
    subscribe,

    // When Alt key is pressed
    activate: () => update(state => {
      // Add only visible elements to visibleMappings
      const visible = Array.from(state.mappings.values())
        .filter(mapping => isElementVisible(mapping.element));

      return {
        ...state,
        isActive: true,
        visibleMappings: visible
      };
    }),

    // When Alt key is released
    deactivate: () => update(state => ({
      ...state,
      isActive: false,
      visibleMappings: []
    })),

    // Register mapping
    registerMapping: (mapping: AccessKeyMapping) => update(state => {
      const mappings = new Map(state.mappings);

      // Check for key collision with existing mappings
      const existing = mappings.get(mapping.key);
      if (existing) {
        console.warn(
          `[AccessKey] Key collision detected: "${mapping.key}"`,
          `\n  Existing: ${existing.id} (priority: ${existing.priority})`,
          `\n  New: ${mapping.id} (priority: ${mapping.priority})`
        );

        // Use the one with higher priority
        if (mapping.priority <= existing.priority) {
          return state; // Keep existing
        }
      }

      mappings.set(mapping.key, mapping);
      return { ...state, mappings };
    }),

    // Unregister mapping
    unregisterMapping: (id: string) => update(state => {
      const mappings = new Map(state.mappings);

      // Search and delete by ID
      for (const [key, mapping] of mappings.entries()) {
        if (mapping.id === id) {
          mappings.delete(key);
          break;
        }
      }

      return { ...state, mappings };
    }),

    // Clear all
    clear: () => set(initialState)
  };
}

// Check if element is visible
function isElementVisible(element: HTMLElement): boolean {
  if (!element || !element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

export const accessKeyMode = createAccessKeyModeStore();
