<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';

  let { assetId } = $props();

  let entries = $state([]);
  let loading = $state(true);

  onMount(load);

  $effect(() => {
    if (assetId) load();
  });

  async function load() {
    loading = true;
    try {
      entries = await api.get(`/activity/asset/${assetId}`, { silent: true });
    } catch {
      entries = [];
    } finally {
      loading = false;
    }
  }

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  function describe(e) {
    const who = e.actor?.name ?? 'Someone';
    switch (e.action) {
      case 'upload':
        return { who, what: 'uploaded this asset', icon: 'upload' };
      case 'comment': {
        const tc = e.details?.timecode;
        return {
          who,
          what: tc != null ? `commented at ${formatTimecode(tc)}` : 'commented',
          icon: 'comment',
        };
      }
      case 'update':
        return { who, what: 'updated metadata', icon: 'edit' };
      case 'download':
        return { who, what: 'downloaded the asset', icon: 'download' };
      case 'delete':
        return { who, what: 'deleted the asset', icon: 'delete' };
      case 'bulk-delete':
        return { who, what: 'bulk-deleted assets', icon: 'delete' };
      default:
        return { who, what: e.action, icon: 'dot' };
    }
  }

  function formatTimecode(s) {
    if (s == null) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function initials(name) {
    return (name || '?')
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
</script>

<div class="flex flex-col h-full">
  <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
    <h3 class="text-sm font-semibold">
      Activity
      <span class="text-gray-500 font-normal">{entries.length}</span>
    </h3>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="p-6 flex items-center justify-center">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if entries.length === 0}
      <div class="p-6 text-center text-sm text-gray-500">
        <p>No activity yet</p>
      </div>
    {:else}
      <ol class="px-4 py-3">
        {#each entries as e, i}
          {@const d = describe(e)}
          <li class="relative flex gap-3 pb-4">
            {#if i < entries.length - 1}
              <span class="absolute left-[14px] top-7 bottom-0 w-px bg-gray-800"></span>
            {/if}
            <div class="relative z-10 w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
              {#if d.icon === 'upload'}
                <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {:else if d.icon === 'comment'}
                <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              {:else if d.icon === 'edit'}
                <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              {:else if d.icon === 'download'}
                <svg class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              {:else if d.icon === 'delete'}
                <svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
              {:else}
                <span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
              {/if}
            </div>
            <div class="flex-1 min-w-0 pt-0.5">
              <p class="text-sm">
                <span class="font-medium text-gray-200">{d.who}</span>
                <span class="text-gray-400">{d.what}</span>
              </p>
              <p class="text-xs text-gray-500 mt-0.5">{timeAgo(e.createdAt)}</p>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>
