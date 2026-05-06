import { toast } from '$lib/stores/toast';

const API_BASE = '/api';

interface ApiOptions extends RequestInit {
  /** Suppress automatic error toast on failure */
  silent?: boolean;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { silent, ...rest } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...rest.headers,
    },
    credentials: 'include',
    ...rest,
  });

  if (
    res.status === 401 &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login'
  ) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    const message = data.message || data.error || `Request failed: ${res.status}`;
    if (!silent) toast.error(message);
    throw new Error(message);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) => request<T>(path, opts),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, {
      ...opts,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
