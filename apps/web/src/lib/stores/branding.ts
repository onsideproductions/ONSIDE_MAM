import { writable } from 'svelte/store';

export interface Branding {
  teamName?: string;
  accentColor?: string; // hex
  logoKey?: string;
  logoUrl?: string | null;
}

interface BrandingState {
  branding: Branding;
  loaded: boolean;
}

const initial: BrandingState = { branding: {}, loaded: false };

function darken(hex: string, amount = 0.15): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function lighten(hex: string, amount = 0.15): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  r = Math.min(255, Math.round(r + (255 - r) * amount));
  g = Math.min(255, Math.round(g + (255 - g) * amount));
  b = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Apply the accent color to CSS variables so all bg-blue-* utilities pick it up. */
function applyAccent(hex: string | undefined) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) {
    // Reset to defaults from app.css
    root.style.removeProperty('--color-blue-500');
    root.style.removeProperty('--color-blue-600');
    root.style.removeProperty('--color-blue-700');
    root.style.removeProperty('--color-blue-400');
    root.style.removeProperty('--color-blue-300');
    return;
  }
  root.style.setProperty('--color-blue-500', hex);
  root.style.setProperty('--color-blue-600', darken(hex, 0.10));
  root.style.setProperty('--color-blue-700', darken(hex, 0.20));
  root.style.setProperty('--color-blue-400', lighten(hex, 0.15));
  root.style.setProperty('--color-blue-300', lighten(hex, 0.30));
}

function createBrandingStore() {
  const { subscribe, set, update } = writable<BrandingState>(initial);

  let cachedDocumentTitle = '';
  if (typeof document !== 'undefined') cachedDocumentTitle = document.title;

  function applyAll(branding: Branding) {
    applyAccent(branding.accentColor);
  }

  return {
    subscribe,

    async load() {
      try {
        const res = await fetch('/api/settings/account', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const branding: Branding = data.branding ?? {};
        applyAll(branding);
        set({ branding, loaded: true });
      } catch {
        set({ branding: {}, loaded: true });
      }
    },

    setBranding(branding: Branding) {
      applyAll(branding);
      update((s) => ({ ...s, branding }));
    },
  };
}

export const branding = createBrandingStore();
