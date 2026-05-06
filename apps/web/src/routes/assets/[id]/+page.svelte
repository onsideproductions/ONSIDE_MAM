<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import VideoPlayer from '$components/player/VideoPlayer.svelte';
  import AddToCollection from '$components/collections/AddToCollection.svelte';
  import CreateShareDialog from '$components/share/CreateShareDialog.svelte';
  import CommentsPanel from '$components/comments/CommentsPanel.svelte';

  let asset = $state(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let newTitle = $state('');
  let newTag = $state('');
  let allTags = $state([]);
  let shareDialogOpen = $state(false);
  let showSuggestions = $state(false);

  let currentTime = $state(0);
  let playerControls = $state(null);
  let commentMarkers = $state([]);
  let activeTab = $state('comments'); // 'comments' | 'info'

  const assetId = $page.params.id;

  let canEdit = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );

  // Suggest tags that match what the user is typing and aren't already on the asset
  let tagSuggestions = $derived.by(() => {
    const q = newTag.trim().toLowerCase();
    if (!q) return [];
    const existing = new Set((asset?.tags ?? []).map((t) => t.name.toLowerCase()));
    return allTags
      .filter((t) => t.name.toLowerCase().includes(q) && !existing.has(t.name.toLowerCase()))
      .slice(0, 8);
  });

  onMount(async () => {
    await Promise.all([loadAsset(), loadAllTags()]);
  });

  async function loadAllTags() {
    try {
      allTags = await api.get('/search/tags', { silent: true });
    } catch {
      allTags = [];
    }
  }

  async function loadAsset() {
    loading = true;
    try {
      asset = await api.get(`/assets/${assetId}`);
      newTitle = asset.title;
    } finally {
      loading = false;
    }
  }

  async function updateTitle() {
    if (!newTitle.trim() || newTitle === asset.title) {
      editingTitle = false;
      return;
    }
    await api.patch(`/assets/${assetId}`, { title: newTitle });
    asset.title = newTitle;
    editingTitle = false;
  }

  async function addTag(name = newTag) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    await api.post(`/assets/${assetId}/tags`, { tagNames: [trimmed] });
    newTag = '';
    showSuggestions = false;
    toast.success(`Tagged "${trimmed}"`);
    await Promise.all([loadAsset(), loadAllTags()]);
  }

  async function removeTag(tagId) {
    await api.delete(`/assets/${assetId}/tags/${tagId}`);
    asset.tags = asset.tags.filter((t) => t.id !== tagId);
  }

  async function downloadAsset(type = 'original') {
    const result = await api.get(`/assets/${assetId}/download?type=${type}`);
    window.open(result.url, '_blank');
  }

  async function reanalyze() {
    await api.post(`/assets/${assetId}/analyze`);
    toast.success('AI analysis queued');
    await loadAsset();
  }

  function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
</script>

<svelte:head>
  <title>{asset?.title || 'Loading...'} - ONSIDE MAM</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center h-96">
    <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else if asset}
  <div class="flex flex-col lg:flex-row h-full">
    <!-- Video player area -->
    <div class="flex-1 bg-black flex items-center justify-center min-h-[400px] p-4">
      {#if asset.streamUrl}
        <div class="w-full max-w-5xl">
          <VideoPlayer
            src={asset.streamUrl}
            poster={asset.thumbnailUrl}
            type={asset.streamType === 'hls' ? 'application/x-mpegURL' : 'video/mp4'}
            bind:currentTime
            markers={commentMarkers}
            onReady={(p) => playerControls = p}
          />
        </div>
      {:else}
        <div class="text-white text-center">
          <svg class="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="opacity-60">{asset.status === 'processing' ? 'Processing...' : 'No preview available'}</p>
        </div>
      {/if}
    </div>

    <!-- Sidebar -->
    <div class="w-full lg:w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col">
      <!-- Tab switcher -->
      <div class="flex border-b border-gray-200 dark:border-gray-800 shrink-0">
        <button
          onclick={() => activeTab = 'comments'}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors
            {activeTab === 'comments' ? 'text-gray-100 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}"
        >
          Comments
        </button>
        <button
          onclick={() => activeTab = 'info'}
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors
            {activeTab === 'info' ? 'text-gray-100 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}"
        >
          Details
        </button>
      </div>

      {#if activeTab === 'comments'}
        <div class="flex-1 min-h-0">
          <CommentsPanel
            {assetId}
            {currentTime}
            seek={(t) => playerControls?.seek(t)}
            onCommentsChange={(list) => {
              commentMarkers = list
                .filter((c) => c.timecode != null && !c.parentId)
                .map((c) => ({ id: c.id, timecode: c.timecode, color: c.resolved ? '#6B7385' : undefined }));
            }}
          />
        </div>
      {:else}
      <div class="overflow-y-auto p-5 space-y-6 flex-1">
        <!-- Title -->
        <div>
          {#if editingTitle && canEdit}
            <form onsubmit={(e) => { e.preventDefault(); updateTitle(); }}>
              <input
                bind:value={newTitle}
                class="w-full text-lg font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none pb-1"
                autofocus
              />
              <div class="flex gap-2 mt-2">
                <button type="submit" class="text-xs text-blue-600">Save</button>
                <button type="button" onclick={() => editingTitle = false} class="text-xs text-gray-500">Cancel</button>
              </div>
            </form>
          {:else}
            <h1
              class="text-lg font-bold {canEdit ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}"
              onclick={() => canEdit && (editingTitle = true)}
              title={canEdit ? 'Click to edit' : ''}
            >
              {asset.title}
            </h1>
          {/if}
          <p class="text-sm text-gray-500 mt-1">{asset.originalFilename}</p>
        </div>

        <!-- Status -->
        <div>
          <span class="px-2.5 py-1 text-xs font-medium rounded-full
            {asset.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
             asset.status === 'processing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
             asset.status === 'error' ? 'bg-red-100 text-red-700' :
             'bg-gray-100 text-gray-700'}">
            {asset.status}
          </span>
        </div>

        <!-- AI Analysis -->
        {#if asset.aiAnalysis}
          <div>
            <h3 class="text-sm font-semibold mb-2 flex items-center gap-2">
              AI Analysis
              <span class="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                {asset.aiAnalysis.modelUsed || 'Gemini'}
              </span>
            </h3>
            {#if asset.aiAnalysis.summary}
              <p class="text-sm text-gray-600 dark:text-gray-400">{asset.aiAnalysis.summary}</p>
            {/if}
            {#if asset.aiAnalysis.detectedObjects?.length}
              <div class="mt-2">
                <p class="text-xs font-medium text-gray-500 mb-1">Detected Objects</p>
                <div class="flex flex-wrap gap-1">
                  {#each asset.aiAnalysis.detectedObjects as obj}
                    <span class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded">{obj}</span>
                  {/each}
                </div>
              </div>
            {/if}
            {#if asset.aiAnalysis.detectedText?.length}
              <div class="mt-2">
                <p class="text-xs font-medium text-gray-500 mb-1">Detected Text</p>
                <div class="flex flex-wrap gap-1">
                  {#each asset.aiAnalysis.detectedText as text}
                    <span class="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 rounded">{text}</span>
                  {/each}
                </div>
              </div>
            {/if}
            <button onclick={reanalyze} class="mt-2 text-xs text-blue-600 hover:text-blue-700">
              Re-analyze with AI
            </button>
          </div>
        {:else if asset.status === 'ready'}
          <button onclick={reanalyze} class="text-sm text-blue-600 hover:text-blue-700">
            Run AI Analysis
          </button>
        {/if}

        <!-- Tags -->
        <div>
          <h3 class="text-sm font-semibold mb-2">Tags</h3>
          <div class="flex flex-wrap gap-1.5 mb-2">
            {#each asset.tags || [] as tag}
              <span class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full">
                {tag.name}
                {#if canEdit}
                  <button onclick={() => removeTag(tag.id)} class="hover:text-red-500 ml-0.5" aria-label="Remove tag">&times;</button>
                {/if}
              </span>
            {/each}
            {#if !asset.tags?.length}
              <p class="text-xs text-gray-500">No tags yet</p>
            {/if}
          </div>
          {#if canEdit}
            <form onsubmit={(e) => { e.preventDefault(); addTag(); }} class="relative flex gap-2">
              <input
                bind:value={newTag}
                onfocus={() => showSuggestions = true}
                onblur={() => setTimeout(() => showSuggestions = false, 150)}
                placeholder="Add tag..."
                class="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                autocomplete="off"
              />
              <button type="submit" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add
              </button>

              {#if showSuggestions && tagSuggestions.length > 0}
                <div class="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {#each tagSuggestions as s}
                    <button
                      type="button"
                      onmousedown={(e) => { e.preventDefault(); addTag(s.name); }}
                      class="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between"
                    >
                      <span>{s.name}</span>
                      <span class="text-xs text-gray-400">{s.assetCount}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </form>
          {/if}
        </div>

        <!-- Collections -->
        <div>
          <h3 class="text-sm font-semibold mb-2">Collections</h3>
          {#if asset.collections?.length}
            <div class="flex flex-wrap gap-1.5 mb-2">
              {#each asset.collections as col}
                <a
                  href="/collections/{col.id}"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-400 rounded-full transition-colors"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  {col.name}
                </a>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-gray-500 mb-2">Not in any collection</p>
          {/if}
          {#if $auth.user?.role === 'admin' || $auth.user?.role === 'editor'}
            <AddToCollection
              assetId={asset.id}
              currentCollections={asset.collections || []}
              onAdded={loadAsset}
            />
          {/if}
        </div>

        <!-- Technical metadata -->
        <div>
          <h3 class="text-sm font-semibold mb-2">Technical Details</h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-gray-500">Duration</dt>
            <dd class="font-medium">{formatDuration(asset.duration)}</dd>
            <dt class="text-gray-500">Resolution</dt>
            <dd class="font-medium">{asset.width || '?'}x{asset.height || '?'}</dd>
            <dt class="text-gray-500">Framerate</dt>
            <dd class="font-medium">{asset.framerate || '?'} fps</dd>
            <dt class="text-gray-500">Codec</dt>
            <dd class="font-medium">{asset.codec || '?'}</dd>
            <dt class="text-gray-500">File Size</dt>
            <dd class="font-medium">{formatBytes(asset.fileSize)}</dd>
            <dt class="text-gray-500">Format</dt>
            <dd class="font-medium">{asset.mimeType}</dd>
          </dl>
        </div>

        <!-- Description -->
        <div>
          <h3 class="text-sm font-semibold mb-2">Description</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {asset.description || 'No description'}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2">
          {#if canEdit}
            <button
              onclick={() => shareDialogOpen = true}
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          {/if}
          <button
            onclick={() => downloadAsset('original')}
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium {canEdit ? 'border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-blue-600 text-white hover:bg-blue-700'} rounded-lg"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Original
          </button>
          {#if asset.proxyKey}
            <button
              onclick={() => downloadAsset('proxy')}
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Download Proxy
            </button>
          {/if}
        </div>
      </div>
      {/if}
    </div>
  </div>

  <CreateShareDialog
    assetId={asset.id}
    bind:open={shareDialogOpen}
  />
{/if}
