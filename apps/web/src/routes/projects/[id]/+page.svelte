<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import { confirm } from '$lib/stores/confirm';
  import AssetCard from '$components/assets/AssetCard.svelte';
  import { uploadFile } from '$lib/upload/multipart';

  let project = $state(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let editingDescription = $state(false);
  let newName = $state('');
  let newDescription = $state('');

  let showCreateChild = $state(false);
  let newChildName = $state('');
  let newChildDescription = $state('');

  let projectId = $derived($page.params.id);

  let canEdit = $derived($auth.user?.role === 'admin' || $auth.user?.role === 'editor');
  let canDelete = $derived($auth.user?.role === 'admin');

  // Inline uploader state
  let uploads = $state([]);
  let fileInput;

  $effect(() => {
    if (!projectId) return;
    // Cross-project navigation: clear state so we get the loading spinner
    if (project && project.id !== projectId) {
      project = null;
    }
    loadProject();
  });

  async function loadProject() {
    // Only show the full-page spinner on the first load. On refresh, keep
    // the current view rendered so we don't flash an empty state while the
    // new data is fetched.
    const isFirstLoad = !project;
    if (isFirstLoad) loading = true;
    try {
      const next = await api.get(`/collections/${projectId}`);
      project = next;
      newName = next.name;
      newDescription = next.description || '';
    } catch {
      if (isFirstLoad) project = null;
    } finally {
      if (isFirstLoad) loading = false;
    }
  }

  async function saveTitle() {
    if (!newName.trim() || newName === project.name) {
      editingTitle = false;
      return;
    }
    await api.patch(`/collections/${projectId}`, { name: newName.trim() });
    project.name = newName.trim();
    editingTitle = false;
  }

  async function saveDescription() {
    if (newDescription.trim() === (project.description || '')) {
      editingDescription = false;
      return;
    }
    await api.patch(`/collections/${projectId}`, {
      description: newDescription.trim() || null,
    });
    project.description = newDescription.trim() || null;
    editingDescription = false;
  }

  async function createChild() {
    if (!newChildName.trim()) return;
    await api.post('/collections', {
      name: newChildName.trim(),
      description: newChildDescription.trim() || undefined,
      parentId: projectId,
    });
    newChildName = '';
    newChildDescription = '';
    showCreateChild = false;
    await loadProject();
  }

  async function deleteProject() {
    const ok = await confirm.ask({
      title: `Delete "${project.name}"?`,
      message: 'Subfolders will be moved to the root. Assets in this project will not be deleted.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/collections/${projectId}`);
    toast.success(`Deleted "${project.name}"`);
    if (project.breadcrumb && project.breadcrumb.length > 1) {
      const parent = project.breadcrumb[project.breadcrumb.length - 2];
      await goto(`/projects/${parent.id}`);
    } else {
      await goto('/');
    }
  }

  async function removeAsset(assetId, assetTitle) {
    const ok = await confirm.ask({
      message: `Remove "${assetTitle}" from this project?`,
      confirmText: 'Remove',
    });
    if (!ok) return;
    // Optimistically remove from the local list - no full reload, no spinner flash
    const previous = project.assets;
    project.assets = project.assets.filter((a) => a.id !== assetId);
    try {
      await api.delete(`/collections/${projectId}/assets/${assetId}`);
      toast.success(`Removed "${assetTitle}"`);
    } catch (err) {
      // Roll back on failure
      project.assets = previous;
    }
  }

  // Upload handlers - upload directly into this project
  function pickFiles() {
    fileInput?.click();
  }

  function onFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    addFiles(files);
  }

  function onDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    addFiles(files);
  }

  function addFiles(files) {
    const videos = files.filter((f) => f.type.startsWith('video/'));
    if (videos.length < files.length) toast.error('Skipped non-video files');
    for (const file of videos) {
      const controller = new AbortController();
      const upload = $state({
        file,
        progress: 0,
        status: 'uploading',
        error: null,
        controller,
      });
      uploads.push(upload);
      runUpload(upload);
    }
  }

  async function runUpload(upload) {
    try {
      const result = await uploadFile({
        file: upload.file,
        signal: upload.controller.signal,
        onProgress: (p) => {
          upload.progress = p.percent;
        },
      });
      // Add to this project
      await api.post(`/collections/${projectId}/assets`, { assetId: result.assetId });
      upload.status = 'complete';
      upload.progress = 100;
      await loadProject();
    } catch (err) {
      if (err.name === 'AbortError') {
        upload.status = 'aborted';
      } else {
        upload.status = 'error';
        upload.error = err.message;
      }
    }
  }

  function cancelUpload(u) {
    u.controller.abort();
  }

  function dismissUpload(i) {
    uploads.splice(i, 1);
  }
</script>

<svelte:head>
  <title>{project?.name || 'Project'} - ONSIDE</title>
</svelte:head>

<input
  type="file"
  accept="video/*"
  multiple
  bind:this={fileInput}
  onchange={onFileChange}
  class="hidden"
/>

{#if loading}
  <div class="flex items-center justify-center h-96">
    <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else if !project}
  <div class="p-6 max-w-7xl mx-auto text-center text-gray-500 py-20">
    <p class="font-medium">Project not found</p>
    <a href="/" class="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block">
      Back to projects
    </a>
  </div>
{:else}
  <div
    ondragover={(e) => canEdit && e.preventDefault()}
    ondrop={canEdit ? onDrop : null}
    role="region"
    class="p-6 max-w-7xl mx-auto"
  >
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
      <a href="/" class="hover:text-blue-400">Projects</a>
      {#each project.breadcrumb as crumb, i}
        <span class="text-gray-700">/</span>
        {#if i === project.breadcrumb.length - 1}
          <span class="text-gray-100 font-medium">{crumb.name}</span>
        {:else}
          <a href="/projects/{crumb.id}" class="hover:text-blue-400">{crumb.name}</a>
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
              <button type="submit" class="text-xs text-blue-400">Save</button>
              <button type="button" onclick={() => editingTitle = false} class="text-xs text-gray-500">Cancel</button>
            </div>
          </form>
        {:else}
          <h1
            class="text-2xl font-bold truncate {canEdit ? 'cursor-pointer hover:text-blue-400 transition-colors' : ''}"
            onclick={() => canEdit && (editingTitle = true)}
            title={canEdit ? 'Click to edit' : ''}
          >
            {project.name}
          </h1>
        {/if}

        {#if editingDescription && canEdit}
          <form onsubmit={(e) => { e.preventDefault(); saveDescription(); }} class="mt-2">
            <textarea
              bind:value={newDescription}
              rows="2"
              class="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Description..."
            ></textarea>
            <div class="flex gap-2 mt-1">
              <button type="submit" class="text-xs text-blue-400">Save</button>
              <button type="button" onclick={() => editingDescription = false} class="text-xs text-gray-500">Cancel</button>
            </div>
          </form>
        {:else}
          <p
            class="text-sm text-gray-500 mt-1 {canEdit ? 'cursor-pointer hover:text-gray-300 transition-colors' : ''}"
            onclick={() => canEdit && (editingDescription = true)}
            title={canEdit ? 'Click to edit description' : ''}
          >
            {project.description || (canEdit ? 'Add description...' : '')}
          </p>
        {/if}
      </div>

      {#if canEdit}
        <div class="flex items-center gap-2 shrink-0">
          <button
            onclick={pickFiles}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload
          </button>
          <button
            onclick={() => showCreateChild = !showCreateChild}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-700 rounded-lg hover:bg-gray-800"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New folder
          </button>
          {#if canDelete}
            <button
              onclick={deleteProject}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950/30 rounded-lg"
            >
              Delete
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if showCreateChild}
      <form onsubmit={(e) => { e.preventDefault(); createChild(); }} class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-2">
        <input
          bind:value={newChildName}
          placeholder="Folder name"
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autofocus
        />
        <input
          bind:value={newChildDescription}
          placeholder="Description (optional)"
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

    {#if uploads.length > 0}
      <section class="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <h2 class="text-sm font-semibold text-gray-300">Uploads</h2>
        {#each uploads as u, i}
          <div class="flex items-center gap-3 text-sm">
            <span class="flex-1 min-w-0 truncate">{u.file.name}</span>
            {#if u.status === 'uploading'}
              <span class="text-xs tabular-nums text-gray-400">{u.progress}%</span>
              <button onclick={() => cancelUpload(u)} class="text-xs text-gray-500 hover:text-gray-200">Cancel</button>
            {:else if u.status === 'complete'}
              <span class="text-xs text-green-400">Complete</span>
              <button onclick={() => dismissUpload(i)} class="text-xs text-gray-500 hover:text-gray-200">Dismiss</button>
            {:else if u.status === 'error'}
              <span class="text-xs text-red-400" title={u.error}>Error</span>
              <button onclick={() => dismissUpload(i)} class="text-xs text-gray-500 hover:text-gray-200">Dismiss</button>
            {:else if u.status === 'aborted'}
              <span class="text-xs text-gray-500">Cancelled</span>
              <button onclick={() => dismissUpload(i)} class="text-xs text-gray-500 hover:text-gray-200">Dismiss</button>
            {/if}
          </div>
          {#if u.status === 'uploading'}
            <div class="w-full bg-gray-800 rounded-full h-1.5">
              <div class="bg-blue-500 h-1.5 rounded-full transition-all" style="width: {u.progress}%"></div>
            </div>
          {/if}
        {/each}
      </section>
    {/if}

    <!-- Folders -->
    {#if project.children?.length}
      <section class="mb-8">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Folders ({project.children.length})
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each project.children as child}
            <a href="/projects/{child.id}" class="group bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-blue-700 transition-all">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-950 flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm truncate group-hover:text-blue-400">{child.name}</p>
                  <p class="text-xs text-gray-500 mt-0.5">{child.assetCount} {child.assetCount === 1 ? 'asset' : 'assets'}</p>
                </div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Assets -->
    <section>
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Assets ({project.assets?.length || 0})
      </h2>
      {#if !project.assets?.length}
        <div class="text-center py-12 text-gray-500 bg-gray-900 rounded-xl border border-dashed border-gray-800">
          <p class="text-sm">No assets in this project yet</p>
          {#if canEdit}
            <p class="text-xs mt-1">Drop a video file anywhere on this page, or click <span class="font-medium text-gray-300">Upload</span> above.</p>
          {/if}
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {#each project.assets as asset}
            <div class="group relative">
              <AssetCard {asset} />
              {#if canEdit}
                <button
                  onclick={(e) => { e.preventDefault(); removeAsset(asset.id, asset.title); }}
                  class="absolute top-2 right-2 p-1.5 bg-gray-900 border border-gray-700 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-950/50 hover:border-red-700 transition"
                  title="Remove from project"
                >
                  <svg class="w-3.5 h-3.5 text-gray-400 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
