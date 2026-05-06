<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import AssetCard from '$components/assets/AssetCard.svelte';

  let stats = $state({ total: 0, ready: 0, processing: 0, error: 0 });
  let recentAssets = $state([]);
  let loading = $state(true);

  let canUpload = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );

  onMount(async () => {
    try {
      const [recent, facets] = await Promise.all([
        api.get('/search?sort=newest&limit=8', { silent: true }),
        api.get('/search/facets', { silent: true }),
      ]);

      recentAssets = recent.data || [];

      const byStatus = Object.fromEntries(
        (facets.status || []).map((s) => [s.value, s.count])
      );
      stats = {
        total: recent.total || 0,
        ready: byStatus.ready || 0,
        processing: (byStatus.processing || 0) + (byStatus.uploading || 0) + (byStatus.analyzing || 0),
        error: byStatus.error || 0,
      };
    } catch {
      // best-effort
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Dashboard - ONSIDE MAM</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold">
        {#if $auth.user?.name}
          Welcome back, {$auth.user.name.split(' ')[0]}
        {:else}
          Dashboard
        {/if}
      </h1>
      <p class="text-sm text-gray-500 mt-1">
        {#if stats.total === 0 && !loading}
          Your media library is empty
        {:else}
          {stats.total} {stats.total === 1 ? 'asset' : 'assets'} in the library
        {/if}
      </p>
    </div>
    {#if canUpload}
      <a
        href="/upload"
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Upload
      </a>
    {/if}
  </div>

  <!-- Stats cards -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Total</p>
      <p class="text-3xl font-bold mt-1">{stats.total}</p>
    </div>
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Ready</p>
      <p class="text-3xl font-bold mt-1 text-green-600 dark:text-green-400">{stats.ready}</p>
    </div>
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">In progress</p>
      <p class="text-3xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.processing}</p>
    </div>
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Errors</p>
      <p class="text-3xl font-bold mt-1 {stats.error > 0 ? 'text-red-600 dark:text-red-400' : ''}">{stats.error}</p>
    </div>
  </div>

  <!-- Recent assets -->
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
    <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
      <h2 class="font-semibold">Recently uploaded</h2>
      <a href="/assets" class="text-sm text-blue-600 hover:text-blue-700">View all →</a>
    </div>

    {#if loading}
      <div class="p-12 text-center">
        <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    {:else if recentAssets.length === 0}
      <div class="p-12 text-center text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p class="font-medium">No assets yet</p>
        {#if canUpload}
          <p class="text-sm mt-1">Upload your first video to get started</p>
          <a href="/upload" class="inline-block mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            Upload Video
          </a>
        {:else}
          <p class="text-sm mt-1">Ask an editor or admin to upload some content</p>
        {/if}
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
        {#each recentAssets as asset}
          <AssetCard {asset} />
        {/each}
      </div>
    {/if}
  </div>
</div>
