import { writable } from 'svelte/store';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  expiresAt: number;
}

let nextId = 1;

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function show(kind: ToastKind, message: string, durationMs = 4000): number {
    const id = nextId++;
    const expiresAt = Date.now() + durationMs;
    update((list) => [...list, { id, kind, message, expiresAt }]);
    if (typeof window !== 'undefined') {
      setTimeout(() => dismiss(id), durationMs);
    }
    return id;
  }

  function dismiss(id: number) {
    update((list) => list.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    success: (message: string, durationMs?: number) => show('success', message, durationMs),
    error: (message: string, durationMs?: number) => show('error', message, durationMs ?? 6000),
    info: (message: string, durationMs?: number) => show('info', message, durationMs),
    dismiss,
  };
}

export const toast = createToastStore();
