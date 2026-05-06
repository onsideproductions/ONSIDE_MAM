<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import { confirm } from '$lib/stores/confirm';
  import AssetCard from '$components/assets/AssetCard.svelte';

  let collection = $state(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let editingDescription = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  let showCreateChild = $state(false);
  let newChildName = $state('');
  let newChildDescription = $state('');

  let collectionId = $derived($page.params.id);

  let canEdit = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );
  let canDelete = $derived($auth.user?.role === 'admin');

  $effect(() => {
    if (collectionId) {
      loadCollection();
    }
  });

  async function loadCollection() {
    loading = true;
    try {
      collection = await api.get(`/collections/${collectionId}`);
      newName = collection.name;
      newDescription = collection.description || '';
    } catch (err) {
      collection = null;
    } finally {
      loading = false;
    }
  }

  async function saveTitle() {
    if (!newName.trim() || newName === collection.name) {
      editingTitle = false;
      return;
    }
    await api.patch(`/collections/${collectionId}`, { name: newName.trim() });
    collection.name = newName.trim();
    editingTitle = false;
  }

  async function saveDescription() {
    if (newDescription.trim() === (collection.description || '')) {
      editingDescription = false;
      return;
    }
    await api.patch(`/collections/${collectionId}`, {
      description: newDescription.trim() || null,
    });
    collection.description = newDescription.trim() || null;
    editingDescription = false;
  }

  async function createChild() {
    if (!newChildName.trim()) return;
    await api.post('/collections', {
      name: newChildName.trim(),
      description: newChildDescription.trim() || undefined,
      parentId: collectionId,
    });
    newChildName = '';
    newChildDescription = '';
    showCreateChild = false;
    await loadCollection();
  }

  async function deleteCollection() {
    const ok = await confirm.ask({
      title: `Delete "${collection.name}"?`,
      message: 'Subfolders will be moved to the root. Assets in this collection will not be deleted.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/collections/${collectionId}`);
    toast.success(`Deleted "${collection.name}"`);
    if (collection.breadcrumb && collection.breadcrumb.length > 1) {
      const parent = collection.breadcrumb[collection.breadcrumb.length - 2];
      await goto(`/collections/${parent.id}`);
    } else {
      await goto('/collections');
    }
  }

  async function removeAsset(assetId, assetTitle) {
    const ok = await confirm.ask({
      message: `Remove "${assetTitle}" from this collection?`,
      confirmText: 'Remove',
    });
    if (!ok) return;
    await api.delete(`/collections/${collectionId}/assets/${assetId}`);
    toast.success(`Removed "${assetTitle}"`);
    await loadCollection();
  }
</script>

<svelte:head>
  <title>{collection?.name || 'Collection'} - ONSIDE MAM</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center h-96">
    <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else if !collection}
  <div class="p-6 max-w-7xl mx-auto text-center text-gray-500 py-20">
    <p class="font-medium">Collection not found</p>
    <a href="/collections" class="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block">
      Back to collections
    </a>
  </div>
{:else}
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
      <a href="/collections" class="hover:text-blue-600">Collections</a>
      {#each collection.breadcrumb as crumb, i}
        <span class="text-gray-300">/</span>
        {#if i === collection.breadcrumb.length - 1}
          <span class="text-gray-900 dark:text-gray-100 font-medium">{crumb.name}</span>
        {:else}
          <a href="/collections/{crumb.id}" class="hover:text-blue-600">{crumb.name}</a>
        {/if}
      {/each}
    </nav>

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-6">
      <div class="flex-1 min-w-0">
        {#if editingTitle && canEdit}
          <form onsubmit={(e) => { e.preventDefault(); saveTitle(); }}>
            <input
              bind:value={newName}
              class="w-full text-2xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none pb-1"
              autofocus
            />
            <div class="flex gap-2 mt-2">
              <button type="submit" class="text-xs text-blue-600">Save</button>
              <button type="button" onclick={() => editingTitle = false} class="text-xs text-gray-500">Cancel</button>
            </div>
          </form>
        {:else}
          <h1
            class="text-2xl font-bold truncate {canEdit ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}"
            onclick={() => canEdit && (editingTitle = true)}
            title={canEdit ? 'Click to edit' : ''}
          >
            {collection.name}
          </h1>
        {/if}

        {#if editingDescription && canEdit}
          <form onsubmit={(e) => { e.preventDefault(); saveDescription(); }} class="mt-2">
            <textarea
              bind:value={newDescription}
              rows="2"
              class="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Description..."
            ></textarea>
            <div class="flex gap-2 mt-1">
              <button type="submit" class="text-xs text-blue-600">Save</button>
              <button type="button" onclick={() => editingDescription = false} class="text-xs text-gray-500">Cancel</button>
            </div>
          </form>
        {:else}
          <p
            class="text-sm text-gray-500 mt-1 {canEdit ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors' : ''}"
            onclick={() => canEdit && (editingDescription = true)}
            title={canEdit ? 'Click to edit description' : ''}
          >
            {collection.description || (canEdit ? 'Add description...' : '')}
          </p>
        {/if}
      </div>

      {#if canEdit}
        <div class="flex items-center gap-2 shrink-0">
          <button
            onclick={() => showCreateChild = !showCreateChild}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New folder
          </button>
          {#if canDelete}
            <button
              onclick={deleteCollection}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
            >
              Delete
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if showCreateChild}
      <form onsubmit={(e) => { e.preventDefault(); createChild(); }} class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6 space-y-2">
        <input
          bind:value={newChildName}
          placeholder="Folder name"
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autofocus
        />
        <input
          bind:value={newChildDescription}
          placeholder="Description (optional)"
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div class="flex gap-2">
          <button type="submit" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create
          </button>
          <button type="button" onclick={() => showCreateChild = false} class="px-3 py-1.5 text-sm text-gray-500">
            Cancel
          </button>
        </div>
      </form>
    {/if}

    <!-- Child collections -->
    {#if collection.children?.length}
      <section class="mb-8">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Folders ({collection.children.length})
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each collection.children as child}
            <a href="/collections/{child.id}" class="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm truncate group-hover:text-blue-600">{child.name}</p>
                  <p class="text-xs text-gray-500 mt-0.5">{child.assetCount} {child.assetCount === 1 ? 'asset' : 'assets'}</p>
                </div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Assets in collection -->
    <section>
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Assets ({collection.assets?.length || 0})
      </h2>
      {#if !collection.assets?.length}
        <div class="text-center py-12 text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
          <p class="text-sm">No assets in this folder yet</p>
          {#if canEdit}
            <p class="text-xs mt-1">Open an asset and use "Add to collection" to put it here</p>
          {/if}
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {#each collection.assets as asset}
            <div class="group relative">
              <AssetCard {asset} />
              {#if canEdit}
                <button
                  onclick={(e) => { e.preventDefault(); removeAsset(asset.id, asset.title); }}
                  class="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 transition"
                  title="Remove from this collection"
                >
                  <svg class="w-3.5 h-3.5 text-gray-500 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}
