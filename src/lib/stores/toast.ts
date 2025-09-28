import { writable } from 'svelte/store';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number; // in milliseconds, 0 means persistent
  timestamp: Date;
}

export interface ToastStore {
  messages: ToastMessage[];
}

const initialStore: ToastStore = {
  messages: []
};

export const toastStore = writable<ToastStore>(initialStore);

// Helper function to generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Toast management functions
export function showToast(
  type: ToastMessage['type'],
  title: string,
  message?: string,
  duration = 1000
) {
  const toast: ToastMessage = {
    id: generateId(),
    type,
    title,
    message,
    duration,
    timestamp: new Date()
  };

  toastStore.update(store => ({
    ...store,
    messages: [...store.messages, toast]
  }));

  // Auto-remove toast after duration (unless duration is 0)
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast.id);
    }, duration);
  }

  return toast.id;
}

export function removeToast(id: string) {
  toastStore.update(store => ({
    ...store,
    messages: store.messages.filter(toast => toast.id !== id)
  }));
}

export function clearAllToasts() {
  toastStore.update(store => ({
    ...store,
    messages: []
  }));
}

// Convenience functions
export function showSuccess(title: string, message?: string, duration?: number) {
  return showToast('success', title, message, duration);
}

export function showError(title: string, message?: string, duration?: number) {
  return showToast('error', title, message, duration);
}

export function showWarning(title: string, message?: string, duration?: number) {
  return showToast('warning', title, message, duration);
}

export function showInfo(title: string, message?: string, duration?: number) {
  return showToast('info', title, message, duration);
}