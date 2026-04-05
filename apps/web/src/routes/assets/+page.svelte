<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$api/client';
  import AssetCard from '$components/assets/AssetCard.svelte';

  let assets = $state([]);
  let loading = $state(true);
  let pagination = $state({ page: 1, totalPages: 1, total: 0 });
  let viewMode = $state('grid');
  let searchQuery = $state('');
  let allTags = $state([]);
  let selectedTags = $state([]);

  onMount(async () => {
    const q = $page.url.searchParams.get('q') || '';
    searchQuery = q;
    await loadAssets();
    await loadTags();
  });

  async function loadAssets(pageNum = 1) {
    loading = true;
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', '24');

      let result;
      if (searchQuery || selectedTags.length) {
        if (searchQuery) params.set('q', searchQuery);
        if (selectedTags.length) params.set('tags', selectedTags.join(','));
        result = await api.get(`/search?${params.toString()}`);
      } else {
        result = await api.get(`/assets?${params.toString()}`);
      }

      assets = result.data || [];
      pagination = {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
      };
    } catch {
      assets = [];
    } finally {
      loading = false;
    }
  }

  async function loadTags() {
    try {
      allTags = await api.get('/search/tags');
    } catch {
      allTags = [];
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    loadAssets(1);
  }

  function toggleTag(tagName) {
    if (selectedTags.includes(tagName)) {
      selectedTags = selectedTags.filter((t) => t !== tagName);
    } else {
      selectedTags = [...selectedTags, tagName];
    }
    loadAssets(1);
  }

  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
</script>

<svelte:head>
  <title>Assets - ONSIDE MAM</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold">Assets</h1>
      <p class="text-sm text-gray-500 mt-1">{pagination.total} assets</p>
    </div>

    <div class="flex items-center gap-3">
      <!-- View toggle -->
      <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onclick={() => viewMode = 'grid'}
          class="p-1.5 rounded {viewMode === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          onclick={() => viewMode = 'list'}
          class="p-1.5 rounded {viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Search and filters -->
  <div class="mb-6">
    <form onsubmit={handleSearch} class="flex gap-3 mb-4">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Search by title, description, AI tags..."
        class="flex-1 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Search
      </button>
    </form>

    <!-- Tag filters -->
    {#if allTags.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each allTags.slice(0, 20) as tag}
          <button
            onclick={() => toggleTag(tag.name)}
            class="px-3 py-1 text-xs font-medium rounded-full border transition-colors
              {selectedTags.includes(tag.name)
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'}"
          >
            {tag.name}
            <span class="ml-1 opacity-60">{tag.assetCount}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Asset grid/list -->
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if assets.length === 0}
    <div class="text-center py-20 text-gray-500">
      <p class="font-medium">No assets found</p>
      <p class="text-sm mt-1">Try adjusting your search or filters</p>
    </div>
  {:else if viewMode === 'grid'}
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {#each assets as asset}
        <AssetCard {asset} />
      {/each}
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800">
      {#each assets as asset}
        <a href="/assets/{asset.id}" class="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <div class="w-32 aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden shrink-0">
            {#if asset.thumbnailUrl}
              <img src={asset.thumbnailUrl} alt="" class="w-full h-full object-cover" />
            {/if}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">{asset.title}</p>
            <p class="text-sm text-gray-500 truncate">{asset.originalFilename}</p>
          </div>
          <div class="text-sm text-gray-500 text-right shrink-0">
            <p>{formatDuration(asset.duration)}</p>
            <p>{asset.width}x{asset.height}</p>
          </div>
          <span class="px-2 py-1 text-xs rounded-full shrink-0
            {asset.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
             asset.status === 'processing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
             'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}">
            {asset.status}
          </span>
        </a>
      {/each}
    </div>
  {/if}

  <!-- Pagination -->
  {#if pagination.totalPages > 1}
    <div class="flex items-center justify-center gap-2 mt-8">
      <button
        onclick={() => loadAssets(pagination.page - 1)}
        disabled={pagination.page <= 1}
        class="px-3 py-2 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        Previous
      </button>
      <span class="text-sm text-gray-500">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      <button
        onclick={() => loadAssets(pagination.page + 1)}
        disabled={pagination.page >= pagination.totalPages}
        class="px-3 py-2 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        Next
      </button>
    </div>
  {/if}
</div>
