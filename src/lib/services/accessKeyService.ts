import { get } from 'svelte/store';
import { accessKeyMode, type AccessKeyMapping } from '../stores/accessKeyMode';

class AccessKeyService {
  private registrationId = 0;

  /**
   * Register an access key
   * @param key - Access key (A-Z, 0-9)
   * @param element - Target DOM element
   * @param action - Action to execute
   * @param priority - Priority (default: 10)
   * @returns Registration ID (used for unregistration)
   */
  register(
    key: string,
    element: HTMLElement,
    action: () => void,
    priority: number = 10
  ): string {
    // Normalize key to uppercase
    const normalizedKey = key.toUpperCase();

    // Validation
    if (!/^[A-Z0-9]$/.test(normalizedKey)) {
      console.error(`[AccessKey] Invalid key: "${key}". Must be A-Z or 0-9.`);
      return '';
    }

    if (!element) {
      console.error(`[AccessKey] Invalid element provided for key "${key}"`);
      return '';
    }

    // Generate unique ID
    const id = `access-key-${this.registrationId++}`;

    // Create mapping
    const mapping: AccessKeyMapping = {
      id,
      key: normalizedKey,
      element,
      label: normalizedKey,
      action,
      priority
    };

    // Register to store
    accessKeyMode.registerMapping(mapping);

    console.log(`[AccessKey] Registered: ${id} (key: ${normalizedKey}, priority: ${priority})`);

    return id;
  }

  /**
   * Unregister an access key
   * @param id - Registration ID returned by register()
   */
  unregister(id: string): void {
    if (!id) return;

    accessKeyMode.unregisterMapping(id);
    console.log(`[AccessKey] Unregistered: ${id}`);
  }

  /**
   * Execute an access key action
   * @param key - Pressed key
   * @returns Whether the action was executed
   */
  executeKey(key: string): boolean {
    const normalizedKey = key.toUpperCase();
    const state = get(accessKeyMode);

    if (!state.isActive) {
      return false;
    }

    const mapping = state.mappings.get(normalizedKey);

    if (!mapping) {
      console.log(`[AccessKey] No mapping found for key: ${normalizedKey}`);
      return false;
    }

    console.log(`[AccessKey] Executing action for key: ${normalizedKey}`);

    try {
      mapping.action();
      // Automatically deactivate after executing action
      accessKeyMode.deactivate();
      return true;
    } catch (error) {
      console.error(`[AccessKey] Error executing action for key ${normalizedKey}:`, error);
      return false;
    }
  }

  /**
   * Clear all registrations
   */
  clearAll(): void {
    accessKeyMode.clear();
    console.log('[AccessKey] All registrations cleared');
  }

  /**
   * Debug output for registration status
   */
  debug(): void {
    const state = get(accessKeyMode);
    console.group('[AccessKey] Current State');
    console.log('Active:', state.isActive);
    console.log('Total Mappings:', state.mappings.size);
    console.log('Visible Mappings:', state.visibleMappings.length);
    console.table(
      Array.from(state.mappings.values()).map(m => ({
        ID: m.id,
        Key: m.key,
        Priority: m.priority,
        Element: m.element.tagName
      }))
    );
    console.groupEnd();
  }
}

// Singleton instance
export const accessKeyService = new AccessKeyService();
