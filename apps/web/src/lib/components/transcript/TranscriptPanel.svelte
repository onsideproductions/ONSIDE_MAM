<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';

  let {
    assetId,
    currentTime = 0,
    seek = (_t) => {},
  } = $props();

  let transcript = $state(null);
  let loading = $state(true);
  let triggering = $state(false);
  let search = $state('');
  let pollHandle;

  let canTrigger = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );

  onMount(load);

  $effect(() => {
    if (assetId) load();
  });

  onDestroy(() => {
    if (pollHandle) clearInterval(pollHandle);
  });

  async function load() {
    loading = true;
    try {
      transcript = await api.get(`/transcripts/asset/${assetId}`, { silent: true });
    } catch {
      transcript = null;
    } finally {
      loading = false;
    }

    // Poll while processing/pending
    if (transcript && (transcript.status === 'processing' || transcript.status === 'pending')) {
      if (!pollHandle) {
        pollHandle = setInterval(async () => {
          try {
            transcript = await api.get(`/transcripts/asset/${assetId}`, { silent: true });
            if (transcript?.status === 'completed' || transcript?.status === 'failed') {
              clearInterval(pollHandle);
              pollHandle = null;
            }
          } catch {
            /* keep polling */
          }
        }, 5000);
      }
    } else if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  async function trigger() {
    triggering = true;
    try {
      await api.post(`/transcripts/asset/${assetId}`);
      toast.success('Transcription queued');
      await load();
    } finally {
      triggering = false;
    }
  }

  // Highlight active segment based on currentTime
  let activeIndex = $derived.by(() => {
    if (!transcript?.segments) return -1;
    for (let i = 0; i < transcript.segments.length; i++) {
      const s = transcript.segments[i];
      if (currentTime >= s.start && currentTime < s.end) return i;
    }
    return -1;
  });

  let filtered = $derived.by(() => {
    if (!transcript?.segments) return [];
    if (!search.trim()) return transcript.segments.map((s, i) => ({ ...s, _i: i }));
    const q = search.toLowerCase();
    return transcript.segments
      .map((s, i) => ({ ...s, _i: i }))
      .filter((s) => s.text.toLowerCase().includes(q));
  });

  function formatTimecode(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function highlight(text, q) {
    if (!q.trim()) return [{ kind: 'text', value: text }];
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const parts = [];
    let i = 0;
    while (i < text.length) {
      const j = lower.indexOf(ql, i);
      if (j === -1) {
        parts.push({ kind: 'text', value: text.slice(i) });
        break;
      }
      if (j > i) parts.push({ kind: 'text', value: text.slice(i, j) });
      parts.push({ kind: 'hit', value: text.slice(j, j + ql.length) });
      i = j + ql.length;
    }
    return parts;
  }
</script>

<div class="flex flex-col h-full">
  <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
    <h3 class="text-sm font-semibold">Transcript</h3>
    {#if transcript?.status === 'completed' && canTrigger}
      <button
        onclick={trigger}
        disabled={triggering}
        class="text-xs text-gray-500 hover:text-gray-300"
      >
        Re-run
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="p-6 flex items-center justify-center">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if !transcript || transcript.status === 'pending'}
    <div class="p-6 text-center text-sm text-gray-500 space-y-3">
      <p>{transcript?.status === 'pending' ? 'Queued for transcription...' : 'No transcript yet.'}</p>
      {#if canTrigger && transcript?.status !== 'pending'}
        <button
          onclick={trigger}
          disabled={triggering}
          class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-60"
        >
          {triggering ? 'Queuing...' : 'Generate transcript'}
        </button>
      {/if}
    </div>
  {:else if transcript.status === 'processing'}
    <div class="p-6 text-center text-sm text-gray-500">
      <div class="w-5 h-5 mx-auto mb-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p>Transcribing audio...</p>
      <p class="text-xs text-gray-600 mt-1">This usually takes a minute or two.</p>
    </div>
  {:else if transcript.status === 'failed'}
    <div class="p-6 text-center text-sm text-gray-400 space-y-3">
      <p class="text-red-400 font-medium">Transcription failed</p>
      {#if transcript.errorMessage}
        <p class="text-xs text-gray-500">{transcript.errorMessage}</p>
      {/if}
      {#if canTrigger}
        <button
          onclick={trigger}
          disabled={triggering}
          class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-60"
        >
          {triggering ? 'Queuing...' : 'Try again'}
        </button>
      {/if}
    </div>
  {:else if !transcript.segments?.length}
    <div class="p-6 text-center text-sm text-gray-500">
      <p>No speech detected.</p>
      {#if canTrigger}
        <button onclick={trigger} class="mt-3 text-xs text-blue-400 hover:text-blue-300">Re-run</button>
      {/if}
    </div>
  {:else}
    <div class="p-3 border-b border-gray-800 shrink-0">
      <input
        type="search"
        bind:value={search}
        placeholder="Find in transcript..."
        class="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-2">
      {#each filtered as s (s._i)}
        <button
          onclick={() => seek(s.start)}
          class="w-full text-left px-3 py-2 rounded text-sm transition-colors flex gap-3
            {activeIndex === s._i ? 'bg-blue-950/40' : 'hover:bg-gray-800/60'}"
        >
          <span class="font-mono text-xs text-gray-500 shrink-0 pt-0.5">
            {formatTimecode(s.start)}
          </span>
          <span class="flex-1 {activeIndex === s._i ? 'text-gray-100' : 'text-gray-300'}">
            {#each highlight(s.text, search) as p}
              {#if p.kind === 'hit'}
                <span class="bg-yellow-500/30 text-yellow-100">{p.value}</span>
              {:else}
                {p.value}
              {/if}
            {/each}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>
