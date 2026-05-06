<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import { confirm } from '$lib/stores/confirm';

  let shares = $state([]);
  let loading = $state(true);

  let isAdmin = $derived($auth.user?.role === 'admin');

  onMount(load);

  async function load() {
    loading = true;
    try {
      shares = await api.get('/shares');
    } finally {
      loading = false;
    }
  }

  async function copyLink(share) {
    const url = `${window.location.origin}/share/${share.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy');
    }
  }

  async function revoke(share) {
    const ok = await confirm.ask({
      title: 'Revoke share?',
      message: 'The link will stop working immediately for anyone you sent it to.',
      confirmText: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    await api.patch(`/shares/${share.id}`, { revoke: true });
    toast.success('Share revoked');
    await load();
  }

  async function remove(share) {
    const ok = await confirm.ask({
      title: 'Delete share?',
      message: 'The link will stop working and the share will be removed from this list.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/shares/${share.id}`);
    toast.success('Share deleted');
    await load();
  }

  function formatDate(s) {
    if (!s) return '';
    return new Date(s).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function statusOf(s) {
    if (s.revokedAt) return { label: 'Revoked', cls: 'bg-gray-800 text-gray-400' };
    if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
      return { label: 'Expired', cls: 'bg-amber-950 text-amber-400' };
    }
    return { label: 'Active', cls: 'bg-green-950 text-green-400' };
  }
</script>

<svelte:head>
  <title>Shares - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-xl font-semibold">Shares</h2>
    <p class="text-sm text-gray-400 mt-1">
      Manage public share links you've created. {isAdmin ? "As an admin you can also see and manage everyone else's shares." : ''}
    </p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if shares.length === 0}
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
      <div class="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-800 flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <p class="font-medium">No shares yet</p>
      <p class="text-sm text-gray-500 mt-1">Open any asset and click <span class="font-medium text-gray-300">Share</span> to create your first link.</p>
    </div>
  {:else}
    <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-950 border-b border-gray-800">
          <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
            <th class="px-4 py-3 font-medium">Asset</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Views</th>
            <th class="px-4 py-3 font-medium">Created</th>
            <th class="px-4 py-3 font-medium">Expires</th>
            {#if isAdmin}
              <th class="px-4 py-3 font-medium">By</th>
            {/if}
            <th class="px-4 py-3 w-32"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          {#each shares as s}
            {@const status = statusOf(s)}
            <tr>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-7 rounded bg-gray-950 overflow-hidden shrink-0">
                    {#if s.asset?.thumbnailUrl}
                      <img src={s.asset.thumbnailUrl} alt="" class="w-full h-full object-cover" />
                    {/if}
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium truncate">{s.title || s.asset?.title || '(asset deleted)'}</p>
                    {#if s.title && s.asset?.title}
                      <p class="text-xs text-gray-500 truncate">{s.asset.title}</p>
                    {/if}
                    <p class="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                      {#if s.hasPassword}
                        <span class="inline-flex items-center gap-1">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Password
                        </span>
                      {/if}
                      {#if s.allowDownload}
                        <span class="inline-flex items-center gap-1">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3" />
                          </svg>
                          Downloads
                        </span>
                      {/if}
                    </p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="inline-block px-2 py-0.5 text-xs font-medium rounded {status.cls}">
                  {status.label}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-300">
                {s.viewCount}
                {#if s.lastViewedAt}
                  <span class="text-xs text-gray-500 block">last {formatDate(s.lastViewedAt)}</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-gray-400">{formatDate(s.createdAt)}</td>
              <td class="px-4 py-3 text-gray-400">{s.expiresAt ? formatDate(s.expiresAt) : '—'}</td>
              {#if isAdmin}
                <td class="px-4 py-3 text-gray-400">{s.creatorName ?? '—'}</td>
              {/if}
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-1">
                  <button
                    onclick={() => copyLink(s)}
                    class="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800 rounded"
                    title="Copy link"
                    aria-label="Copy link"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  {#if !s.revokedAt}
                    <button
                      onclick={() => revoke(s)}
                      class="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-amber-950/40 rounded"
                      title="Revoke"
                      aria-label="Revoke"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                  {/if}
                  <button
                    onclick={() => remove(s)}
                    class="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-950/40 rounded"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
