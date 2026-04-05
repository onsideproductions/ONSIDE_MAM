<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';

  let collections = $state([]);
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  onMount(async () => {
    await loadCollections();
  });

  async function loadCollections() {
    loading = true;
    try {
      collections = await api.get('/collections');
    } catch {
      collections = [];
    } finally {
      loading = false;
    }
  }

  async function createCollection() {
    if (!newName.trim()) return;
    await api.post('/collections', {
      name: newName.trim(),
      description: newDescription.trim() || undefined,
    });
    newName = '';
    newDescription = '';
    showCreateForm = false;
    await loadCollections();
  }

  async function deleteCollection(id) {
    if (!confirm('Delete this collection? Assets will not be deleted.')) return;
    await api.delete(`/collections/${id}`);
    await loadCollections();
  }
</script>

<svelte:head>
  <title>Collections - ONSIDE MAM</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Collections</h1>
    <button
      onclick={() => showCreateForm = !showCreateForm}
      class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      New Collection
    </button>
  </div>

  <!-- Create form -->
  {#if showCreateForm}
    <form onsubmit={(e) => { e.preventDefault(); createCollection(); }} class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
      <div class="space-y-3">
        <input
          bind:value={newName}
          placeholder="Collection name"
          class="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autofocus
        />
        <input
          bind:value={newDescription}
          placeholder="Description (optional)"
          class="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div class="flex gap-2">
          <button type="submit" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create
          </button>
          <button type="button" onclick={() => showCreateForm = false} class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
        </div>
      </div>
    </form>
  {/if}

  <!-- Collections grid -->
  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if collections.length === 0}
    <div class="text-center py-20 text-gray-500">
      <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <p class="font-medium">No collections yet</p>
      <p class="text-sm mt-1">Create a collection to organize your assets</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each collections as collection}
        <a href="/collections/{collection.id}" class="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
          <div class="aspect-video bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <div class="p-4">
            <h3 class="font-medium group-hover:text-blue-600 transition-colors">{collection.name}</h3>
            {#if collection.description}
              <p class="text-sm text-gray-500 mt-1 line-clamp-2">{collection.description}</p>
            {/if}
            <p class="text-xs text-gray-400 mt-2">{collection.assetCount} assets</p>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
