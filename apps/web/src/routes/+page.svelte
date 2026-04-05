<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';

  let stats = $state({ totalAssets: 0, processing: 0, ready: 0, totalStorage: '0 GB' });
  let recentAssets = $state([]);

  onMount(async () => {
    try {
      const [assetsResult, processingResult] = await Promise.all([
        api.get('/assets?limit=8&sortBy=createdAt&sortOrder=desc'),
        api.get('/assets?status=processing&limit=1'),
      ]);

      recentAssets = assetsResult.data || [];
      stats = {
        totalAssets: assetsResult.total || 0,
        processing: processingResult.total || 0,
        ready: (assetsResult.total || 0) - (processingResult.total || 0),
        totalStorage: formatBytes(
          (assetsResult.data || []).reduce((sum, a) => sum + (a.fileSize || 0), 0)
        ),
      };
    } catch {
      // API not running yet - show empty state
    }
  });

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
</script>

<svelte:head>
  <title>Dashboard - ONSIDE MAM</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

  <!-- Stats cards -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Total Assets</p>
      <p class="text-3xl font-bold mt-1">{stats.totalAssets}</p>
    </div>
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Ready</p>
      <p class="text-3xl font-bold mt-1 text-green-600">{stats.ready}</p>
    </div>
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Processing</p>
      <p class="text-3xl font-bold mt-1 text-amber-600">{stats.processing}</p>
    </div>
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p class="text-sm text-gray-500 dark:text-gray-400">Storage Used</p>
      <p class="text-3xl font-bold mt-1">{stats.totalStorage}</p>
    </div>
  </div>

  <!-- Recent assets -->
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
    <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
      <h2 class="font-semibold">Recent Assets</h2>
      <a href="/assets" class="text-sm text-blue-600 hover:text-blue-700">View all</a>
    </div>

    {#if recentAssets.length === 0}
      <div class="p-12 text-center text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p class="font-medium">No assets yet</p>
        <p class="text-sm mt-1">Upload your first video to get started</p>
        <a href="/upload" class="inline-block mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          Upload Video
        </a>
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
        {#each recentAssets as asset}
          <a href="/assets/{asset.id}" class="group block">
            <div class="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
              {#if asset.thumbnailUrl}
                <img src={asset.thumbnailUrl} alt={asset.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-gray-400">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              {/if}
            </div>
            <p class="text-sm font-medium truncate">{asset.title}</p>
            <p class="text-xs text-gray-500">{asset.status}</p>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>
