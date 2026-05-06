<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import VideoPlayer from '$components/player/VideoPlayer.svelte';
  import { toast } from '$lib/stores/toast';

  let share = $state(null);
  let loading = $state(true);
  let needsPassword = $state(false);
  let error = $state(null);
  let password = $state('');
  let submitting = $state(false);
  let downloading = $state(false);

  let shareId = $derived($page.params.id);

  onMount(load);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/public/shares/${shareId}`);
      if (res.status === 404) {
        error = 'This share link does not exist or has been revoked.';
        return;
      }
      if (res.status === 410) {
        error = 'This share link has expired.';
        return;
      }
      if (!res.ok) {
        error = 'Could not load this share.';
        return;
      }
      const data = await res.json();
      if (data.needsPassword) {
        needsPassword = true;
        share = { id: data.id, title: data.title };
      } else {
        share = data;
      }
    } finally {
      loading = false;
    }
  }

  async function submitPassword(e) {
    e.preventDefault();
    submitting = true;
    try {
      const res = await fetch(`/api/public/shares/${shareId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) {
        toast.error('Wrong password');
        return;
      }
      if (!res.ok) {
        toast.error('Could not unlock');
        return;
      }
      const data = await res.json();
      // Stash password for download endpoint
      sessionStorage.setItem(`share-pw:${shareId}`, password);
      share = data;
      needsPassword = false;
    } finally {
      submitting = false;
    }
  }

  async function download() {
    downloading = true;
    try {
      const cached = sessionStorage.getItem(`share-pw:${shareId}`);
      const res = await fetch(`/api/public/shares/${shareId}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cached ?? undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Download not allowed');
        return;
      }
      const data = await res.json();
      window.open(data.url, '_blank');
    } finally {
      downloading = false;
    }
  }

  function formatBytes(b) {
    if (!b) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  function formatDuration(s) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
</script>

<svelte:head>
  <title>{share?.title || share?.asset?.title || 'Shared video'}</title>
</svelte:head>

<div class="min-h-screen bg-gray-950 flex flex-col">
  <!-- Header -->
  <header class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
    <div class="flex items-center gap-2 text-base font-semibold text-gray-100">
      <span class="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
      ONSIDE
    </div>
    <a href="/login" class="text-xs text-gray-500 hover:text-gray-300">Sign in</a>
  </header>

  <main class="flex-1 flex items-center justify-center p-6">
    {#if loading}
      <div class="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    {:else if error}
      <div class="text-center max-w-sm">
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-red-950 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p class="font-medium">Unavailable</p>
        <p class="text-sm text-gray-400 mt-1">{error}</p>
      </div>
    {:else if needsPassword}
      <form onsubmit={submitPassword} class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800 flex items-center justify-center">
            <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          {#if share?.title}
            <h1 class="font-semibold">{share.title}</h1>
          {/if}
          <p class="text-sm text-gray-400 mt-0.5">
            This share is protected. Enter the password to continue.
          </p>
        </div>
        <input
          type="password"
          bind:value={password}
          placeholder="Password"
          required
          autofocus
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={submitting || !password}
          class="w-full px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
        >
          {submitting ? 'Unlocking...' : 'View'}
        </button>
      </form>
    {:else if share}
      <!-- Share view -->
      <div class="w-full max-w-5xl space-y-4">
        {#if share.title}
          <h1 class="text-xl font-semibold">{share.title}</h1>
        {/if}

        <div class="bg-black rounded-xl overflow-hidden">
          {#if share.streamUrl}
            <VideoPlayer
              src={share.streamUrl}
              poster={share.thumbnailUrl}
              type={share.streamType === 'hls' ? 'application/x-mpegURL' : 'video/mp4'}
            />
          {:else}
            <div class="aspect-video flex items-center justify-center text-gray-500 text-sm">
              Video not available
            </div>
          {/if}
        </div>

        <div class="flex items-end justify-between gap-4">
          <div class="text-sm text-gray-400 space-x-3">
            <span class="font-medium text-gray-200">{share.asset.title}</span>
            {#if share.asset.duration}
              <span>·</span>
              <span>{formatDuration(share.asset.duration)}</span>
            {/if}
            {#if share.asset.width}
              <span>·</span>
              <span>{share.asset.width}×{share.asset.height}</span>
            {/if}
            {#if share.asset.fileSize}
              <span>·</span>
              <span>{formatBytes(share.asset.fileSize)}</span>
            {/if}
          </div>

          {#if share.allowDownload}
            <button
              onclick={download}
              disabled={downloading}
              class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? 'Preparing...' : 'Download original'}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </main>

  <footer class="px-6 py-3 border-t border-gray-800 text-center text-xs text-gray-500">
    Shared via ONSIDE MAM
  </footer>
</div>
