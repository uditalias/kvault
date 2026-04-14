import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastOptions {
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (
    message: string,
    type?: 'success' | 'error' | 'info',
    options?: ToastOptions,
  ) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = 'info', options) => {
    const id = String(++nextId);
    const duration = options?.durationMs ?? 3000;
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id, message, type, action: options?.action, durationMs: duration },
      ],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
