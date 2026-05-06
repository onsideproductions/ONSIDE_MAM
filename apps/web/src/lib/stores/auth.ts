import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { toast } from './toast';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: 'admin' | 'editor' | 'viewer';
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

const initial: AuthState = { user: null, loading: true };

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initial);

  return {
    subscribe,

    async refresh() {
      try {
        const res = await fetch('/api/auth/get-session', { credentials: 'include' });
        if (!res.ok) {
          set({ user: null, loading: false });
          return;
        }
        const data = await res.json().catch(() => null);
        set({ user: data?.user ?? null, loading: false });
      } catch {
        set({ user: null, loading: false });
      }
    },

    async signIn(email: string, password: string) {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Sign in failed');
      }
      const data = await res.json();
      set({ user: data.user ?? null, loading: false });
      return data.user;
    },

    async signUp(email: string, password: string, name: string) {
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Sign up failed');
      }
      const data = await res.json();
      set({ user: data.user ?? null, loading: false });
      return data.user;
    },

    async signOut() {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
      });
      set({ user: null, loading: false });
      toast.success('Signed out');
      await goto('/login');
    },

    setUser(user: AuthUser | null) {
      update((s) => ({ ...s, user }));
    },
  };
}

export const auth = createAuthStore();
