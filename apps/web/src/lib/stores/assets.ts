import { writable } from 'svelte/store';
import { api } from '$api/client';
import type { Asset, PaginatedResponse } from '@onside-mam/shared';

export const assets = writable<Asset[]>([]);
export const assetsLoading = writable(false);
export const assetsPagination = writable({ page: 1, totalPages: 1, total: 0 });

export async function loadAssets(params: {
  page?: number;
  limit?: number;
  query?: string;
  status?: string;
} = {}) {
  assetsLoading.set(true);
  try {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.query) searchParams.set('query', params.query);
    if (params.status) searchParams.set('status', params.status);

    const result = await api.get<PaginatedResponse<Asset>>(
      `/assets?${searchParams.toString()}`
    );

    assets.set(result.data);
    assetsPagination.set({
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });
  } finally {
    assetsLoading.set(false);
  }
}

export async function searchAssets(query: string, tags?: string[]) {
  assetsLoading.set(true);
  try {
    const searchParams = new URLSearchParams();
    if (query) searchParams.set('q', query);
    if (tags?.length) searchParams.set('tags', tags.join(','));

    const result = await api.get<PaginatedResponse<Asset & { aiSummary?: string }>>(
      `/search?${searchParams.toString()}`
    );

    assets.set(result.data);
    assetsPagination.set({
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });

    return result;
  } finally {
    assetsLoading.set(false);
  }
}
