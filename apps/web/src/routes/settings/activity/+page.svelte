<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';

  let entries = $state([]);
  let loading = $state(true);
  let offset = $state(0);
  const limit = 100;
  let canLoadMore = $state(false);

  onMount(load);

  async function load(reset = true) {
    loading = true;
    try {
      const newOffset = reset ? 0 : offset + limit;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(newOffset));
      const data = await api.get(`/activity?${params.toString()}`);
      entries = reset ? data : [...entries, ...data];
      offset = newOffset;
      canLoadMore = data.length === limit;
    } finally {
      loading = false;
    }
  }

  function describe(e) {
    const who = e.actor?.name ?? 'system';
    const target = e.entityType
      ? e.entityId
        ? `${e.entityType}/${e.entityId.slice(0, 8)}`
        : e.entityType
      : '';
    switch (e.action) {
      case 'upload':
        return `${who} uploaded ${target}`;
      case 'comment':
        return `${who} commented on ${target}`;
      case 'update':
        return `${who} updated ${target}`;
      case 'download':
        return `${who} downloaded ${target}`;
      case 'delete':
        return `${who} deleted ${target}`;
      case 'bulk-delete':
        return `${who} bulk-deleted ${e.details?.count ?? '?'} ${e.entityType}s`;
      case 'create':
        return `${who} created ${target}`;
      default:
        return `${who} ${e.action} ${target}`;
    }
  }

  function fmt(iso) {
    return new Date(iso).toLocaleString();
  }
</script>

<svelte:head>
  <title>Activity log - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-xl font-semibold">Activity log</h2>
    <p class="text-sm text-gray-400 mt-1">
      Audit trail of every action across the library.
    </p>
  </div>

  <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
    {#if loading && entries.length === 0}
      <div class="flex items-center justify-center py-20">
        <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if entries.length === 0}
      <div class="p-10 text-center text-sm text-gray-500">No activity yet.</div>
    {:else}
      <table class="w-full text-sm">
        <thead class="bg-gray-950 border-b border-gray-800">
          <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
            <th class="px-4 py-3 font-medium">When</th>
            <th class="px-4 py-3 font-medium">Action</th>
            <th class="px-4 py-3 font-medium">IP</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          {#each entries as e}
            <tr class="hover:bg-gray-800/40">
              <td class="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{fmt(e.createdAt)}</td>
              <td class="px-4 py-2">
                <p>{describe(e)}</p>
                {#if e.actor?.email}
                  <p class="text-xs text-gray-500">{e.actor.email}</p>
                {/if}
              </td>
              <td class="px-4 py-2 text-xs text-gray-500 font-mono">{e.ipAddress ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if canLoadMore}
    <div class="flex justify-center">
      <button
        onclick={() => load(false)}
        disabled={loading}
        class="px-4 py-2 text-sm border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-60"
      >
        {loading ? 'Loading...' : 'Load more'}
      </button>
    </div>
  {/if}
</div>
