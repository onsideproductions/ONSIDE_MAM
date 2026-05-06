<script>
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';

  let {
    selectedIds = [],
    onClear = () => {},
    onChange = () => {},
  } = $props();

  let allCollections = $state([]);
  let collectionsLoaded = $state(false);

  let showCollections = $state(false);
  let showTagInput = $state(false);
  let tagInput = $state('');

  let canEdit = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );
  let canDelete = $derived($auth.user?.role === 'admin');

  async function ensureCollections() {
    if (!collectionsLoaded) {
      allCollections = await api.get('/collections/all');
      collectionsLoaded = true;
    }
  }

  async function addToCollection(collectionId) {
    const collection = allCollections.find((c) => c.id === collectionId);
    const result = await api.post(`/collections/${collectionId}/assets`, {
      assetIds: selectedIds,
    });
    showCollections = false;
    toast.success(`Added ${result.added} ${result.added === 1 ? 'asset' : 'assets'} to ${collection?.name ?? 'collection'}`);
    onChange();
  }

  async function applyTags() {
    const names = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
    if (!names.length) return;
    const result = await api.post('/assets/bulk-tag', { assetIds: selectedIds, tagNames: names });
    tagInput = '';
    showTagInput = false;
    toast.success(`Tagged ${selectedIds.length} ${selectedIds.length === 1 ? 'asset' : 'assets'} with ${names.length} tag${names.length === 1 ? '' : 's'}`);
    onChange();
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.length} asset${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const count = selectedIds.length;
    await api.post('/assets/bulk-delete', { assetIds: selectedIds });
    toast.success(`Deleted ${count} ${count === 1 ? 'asset' : 'assets'}`);
    onChange();
    onClear();
  }

  function close() {
    showCollections = false;
    showTagInput = false;
    tagInput = '';
  }
</script>

{#if selectedIds.length > 0}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 dark:bg-gray-800 text-white rounded-xl shadow-2xl px-3 py-2 flex items-center gap-1 border border-gray-700">
    <span class="px-3 text-sm font-medium">
      {selectedIds.length} selected
    </span>
    <span class="w-px h-6 bg-gray-700"></span>

    {#if canEdit}
      <!-- Add to collection -->
      <div class="relative">
        <button
          onclick={() => { showCollections = !showCollections; showTagInput = false; ensureCollections(); }}
          class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 flex items-center gap-1.5"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Add to collection
        </button>
        {#if showCollections}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={close}></div>
          <div class="absolute bottom-full mb-2 left-0 w-64 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 z-50 max-h-72 overflow-y-auto">
            {#if !allCollections.length}
              <div class="p-4 text-sm text-center text-gray-500">No collections yet</div>
            {:else}
              {#each allCollections as col}
                <button
                  onclick={() => addToCollection(col.id)}
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
        {/if}
      </div>

      <!-- Add tags -->
      <div class="relative">
        <button
          onclick={() => { showTagInput = !showTagInput; showCollections = false; }}
          class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 flex items-center gap-1.5"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
          </svg>
          Add tags
        </button>
        {#if showTagInput}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={close}></div>
          <form
            onsubmit={(e) => { e.preventDefault(); applyTags(); }}
            class="absolute bottom-full mb-2 left-0 w-72 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 z-50 p-3 space-y-2"
          >
            <input
              bind:value={tagInput}
              placeholder="tag1, tag2, tag3"
              autofocus
              class="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-gray-500">Comma-separated. Existing tags are reused.</p>
            <button type="submit" class="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Apply to {selectedIds.length} {selectedIds.length === 1 ? 'asset' : 'assets'}
            </button>
          </form>
        {/if}
      </div>
    {/if}

    {#if canDelete}
      <span class="w-px h-6 bg-gray-700"></span>
      <button
        onclick={deleteSelected}
        class="px-3 py-1.5 text-sm rounded-lg hover:bg-red-900/40 text-red-300 hover:text-red-100 flex items-center gap-1.5"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
        Delete
      </button>
    {/if}

    <span class="w-px h-6 bg-gray-700"></span>
    <button
      onclick={onClear}
      class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700"
    >
      Clear
    </button>
  </div>
{/if}
