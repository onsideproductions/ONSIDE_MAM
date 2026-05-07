<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';

  let projects = $state([]);
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newName = $state('');
  let newDescription = $state('');
  let creating = $state(false);

  let canEdit = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );

  onMount(load);

  async function load() {
    loading = true;
    try {
      // We still call /api/collections under the hood - it's just relabelled in the UI
      projects = await api.get('/collections');
    } catch {
      projects = [];
    } finally {
      loading = false;
    }
  }

  async function create(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    creating = true;
    try {
      const created = await api.post('/collections', {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      newName = '';
      newDescription = '';
      showCreateForm = false;
      toast.success(`Created project "${created.name}"`);
      await load();
    } finally {
      creating = false;
    }
  }
</script>

<svelte:head>
  <title>Projects - ONSIDE</title>
</svelte:head>

<div class="p-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold">Projects</h1>
      <p class="text-sm text-gray-500 mt-1">
        {#if loading}
          &nbsp;
        {:else}
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        {/if}
      </p>
    </div>
    {#if canEdit}
      <button
        onclick={() => showCreateForm = !showCreateForm}
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New project
      </button>
    {/if}
  </div>

  {#if showCreateForm}
    <form onsubmit={create} class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-3">
      <input
        bind:value={newName}
        placeholder="Project name"
        class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        autofocus
        required
      />
      <input
        bind:value={newDescription}
        placeholder="Description (optional)"
        class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div class="flex gap-2">
        <button type="submit" disabled={creating} class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
          {creating ? 'Creating…' : 'Create project'}
        </button>
        <button type="button" onclick={() => showCreateForm = false} class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
          Cancel
        </button>
      </div>
    </form>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if projects.length === 0}
    <div class="text-center py-20 text-gray-500">
      <svg class="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <p class="font-medium">No projects yet</p>
      <p class="text-sm mt-1">
        {canEdit ? 'Create your first project to organise content for a shoot, edit, or client.' : 'Ask an editor or admin to create one.'}
      </p>
      {#if canEdit && !showCreateForm}
        <button
          onclick={() => showCreateForm = true}
          class="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create project
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each projects as project}
        <a
          href="/projects/{project.id}"
          class="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-blue-700 transition-all"
        >
          <div class="aspect-video bg-gray-950 flex items-center justify-center overflow-hidden">
            {#if project.coverUrl}
              <img
                src={project.coverUrl}
                alt={project.name}
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            {:else}
              <svg class="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            {/if}
          </div>
          <div class="p-4">
            <h3 class="font-medium truncate group-hover:text-blue-400 transition-colors">{project.name}</h3>
            {#if project.description}
              <p class="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
            {/if}
            <p class="text-xs text-gray-500 mt-2">
              {project.assetCount} {project.assetCount === 1 ? 'asset' : 'assets'}
            </p>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
