import { writable } from 'svelte/store';

export interface ConfirmationOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  dangerous?: boolean;
}

interface ConfirmationState {
  isOpen: boolean;
  options: ConfirmationOptions | null;
  resolve: ((value: boolean) => void) | null;
}

function createConfirmationStore() {
  const { subscribe, set, update } = writable<ConfirmationState>({
    isOpen: false,
    options: null,
    resolve: null
  });

  return {
    subscribe,

    /**
     * Show a confirmation dialog and return a promise that resolves to true/false
     */
    confirm(options: ConfirmationOptions | string): Promise<boolean> {
      return new Promise((resolve) => {
        const confirmOptions: ConfirmationOptions = typeof options === 'string'
          ? { message: options }
          : options;

        set({
          isOpen: true,
          options: {
            title: confirmOptions.title || 'Confirm',
            message: confirmOptions.message,
            confirmText: confirmOptions.confirmText || 'OK',
            cancelText: confirmOptions.cancelText || 'Cancel',
            dangerous: confirmOptions.dangerous || false
          },
          resolve
        });
      });
    },

    /**
     * Handle user's response to the confirmation dialog
     */
    respond(confirmed: boolean) {
      update(state => {
        if (state.resolve) {
          state.resolve(confirmed);
        }
        return {
          isOpen: false,
          options: null,
          resolve: null
        };
      });
    },

    /**
     * Close the dialog without responding (same as cancel)
     */
    close() {
      this.respond(false);
    }
  };
}

export const confirmationStore = createConfirmationStore();

/**
 * Convenience function for showing confirmations
 */
export async function confirm(options: ConfirmationOptions | string): Promise<boolean> {
  return confirmationStore.confirm(options);
}