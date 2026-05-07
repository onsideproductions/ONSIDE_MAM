<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';

  let usage = $state(null);
  let loading = $state(true);

  onMount(async () => {
    try {
      usage = await api.get('/settings/usage');
    } finally {
      loading = false;
    }
  });

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }
</script>

<svelte:head>
  <title>Usage - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h2 class="text-xl font-semibold">Usage</h2>
    <p class="text-sm text-gray-400 mt-1">An overview of your team and storage consumption.</p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if usage}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Members</p>
        <p class="text-3xl font-semibold">{usage.members.total}</p>
        <div class="mt-3 space-y-1 text-xs text-gray-400">
          <div class="flex justify-between"><span>Admins</span><span>{usage.members.admins}</span></div>
          <div class="flex justify-between"><span>Editors</span><span>{usage.members.editors}</span></div>
          <div class="flex justify-between"><span>Viewers</span><span>{usage.members.viewers}</span></div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Projects</p>
        <p class="text-3xl font-semibold">{usage.collections}</p>
        <p class="text-xs text-gray-500 mt-3">Folders &amp; sub-folders organising your assets</p>
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Assets</p>
        <p class="text-3xl font-semibold">{usage.assets}</p>
        <p class="text-xs text-gray-500 mt-3">Total uploads in the library</p>
      </div>
    </div>

    <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Storage in use</p>
      <p class="text-4xl font-semibold">{formatBytes(usage.storageBytes)}</p>
      <p class="text-sm text-gray-400 mt-2">
        Across all originals, proxies, HLS segments and thumbnails on Wasabi.
      </p>
    </div>
  {/if}
</div>
