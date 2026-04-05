<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$api/client';
  import VideoPlayer from '$components/player/VideoPlayer.svelte';

  let asset = $state(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let newTitle = $state('');
  let newTag = $state('');

  const assetId = $page.params.id;

  onMount(async () => {
    await loadAsset();
  });

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

  async function addTag() {
    if (!newTag.trim()) return;
    await api.post(`/assets/${assetId}/tags`, { tagNames: [newTag.trim()] });
    newTag = '';
    await loadAsset();
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
    <div class="flex-1 bg-black flex items-center justify-center min-h-[400px]">
      {#if asset.streamUrl}
        <VideoPlayer src={asset.streamUrl} poster={asset.thumbnailUrl} />
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
    <div class="w-full lg:w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-y-auto">
      <div class="p-5 space-y-6">
        <!-- Title -->
        <div>
          {#if editingTitle}
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
              class="text-lg font-bold cursor-pointer hover:text-blue-600 transition-colors"
              onclick={() => editingTitle = true}
              title="Click to edit"
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
                <button onclick={() => removeTag(tag.id)} class="hover:text-red-500 ml-0.5">&times;</button>
              </span>
            {/each}
          </div>
          <form onsubmit={(e) => { e.preventDefault(); addTag(); }} class="flex gap-2">
            <input
              bind:value={newTag}
              placeholder="Add tag..."
              class="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="submit" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Add
            </button>
          </form>
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
          <button
            onclick={() => downloadAsset('original')}
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
    </div>
  </div>
{/if}
