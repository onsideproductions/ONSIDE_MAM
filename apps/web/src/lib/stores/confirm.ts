import { writable } from 'svelte/store';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

const initial: ConfirmState = { open: false, message: '' };

function createConfirmStore() {
  const { subscribe, set } = writable<ConfirmState>(initial);

  function ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      set({ ...options, open: true, resolve });
    });
  }

  function answer(value: boolean) {
    let current: ConfirmState = initial;
    subscribe((s) => (current = s))();
    current.resolve?.(value);
    set(initial);
  }

  return { subscribe, ask, answer };
}

export const confirm = createConfirmStore();
