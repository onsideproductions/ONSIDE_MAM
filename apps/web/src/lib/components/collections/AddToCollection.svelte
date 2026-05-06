<script>
  import { api } from '$api/client';

  let { assetId, currentCollections = [], onAdded = () => {} } = $props();

  let isOpen = $state(false);
  let allCollections = $state([]);
  let loading = $state(false);
  let search = $state('');

  // New collection form
  let creatingNew = $state(false);
  let newName = $state('');

  let inIds = $derived(new Set(currentCollections.map((c) => c.id)));

  let filtered = $derived(
    allCollections
      .filter((c) => !inIds.has(c.id))
      .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
  );

  async function open() {
    isOpen = true;
    if (!allCollections.length) {
      loading = true;
      try {
        allCollections = await api.get('/collections/all');
      } finally {
        loading = false;
      }
    }
  }

  function close() {
    isOpen = false;
    creatingNew = false;
    newName = '';
    search = '';
  }

  async function add(collectionId) {
    await api.post(`/collections/${collectionId}/assets`, { assetId });
    onAdded();
    close();
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    const created = await api.post('/collections', { name: newName.trim() });
    await api.post(`/collections/${created.id}/assets`, { assetId });
    // Refresh list so the new collection shows up
    allCollections = await api.get('/collections/all');
    onAdded();
    close();
  }
</script>

<div class="relative">
  <button
    onclick={open}
    class="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
    Add to collection
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-30" onclick={close}></div>
    <div class="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-40 overflow-hidden">
      {#if creatingNew}
        <form onsubmit={(e) => { e.preventDefault(); createAndAdd(); }} class="p-3 space-y-2">
          <input
            bind:value={newName}
            placeholder="Collection name"
            class="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autofocus
          />
          <div class="flex gap-2">
            <button type="submit" class="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Create &amp; add
            </button>
            <button type="button" onclick={() => creatingNew = false} class="px-3 py-1.5 text-sm text-gray-500">
              Back
            </button>
          </div>
        </form>
      {:else}
        <div class="p-2 border-b border-gray-200 dark:border-gray-800">
          <input
            bind:value={search}
            placeholder="Search collections..."
            class="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="max-h-64 overflow-y-auto">
          {#if loading}
            <div class="p-4 text-center text-sm text-gray-500">Loading…</div>
          {:else if !filtered.length}
            <div class="p-4 text-center text-sm text-gray-500">
              {search ? 'No matches' : 'No other collections'}
            </div>
          {:else}
            {#each filtered as col}
              <button
                onclick={() => add(col.id)}
                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span class="truncate">{col.name}</span>
              </button>
            {/each}
          {/if}
        </div>

        <button
          onclick={() => creatingNew = true}
          class="w-full px-3 py-2 text-sm font-medium text-blue-600 border-t border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-left flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New collection…
        </button>
      {/if}
    </div>
  {/if}
</div>
