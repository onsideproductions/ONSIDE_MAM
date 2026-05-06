<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import { confirm } from '$lib/stores/confirm';
  import MentionTextarea from './MentionTextarea.svelte';
  import CommentBody from './CommentBody.svelte';

  let {
    assetId,
    /** live currentTime from the player */
    currentTime = 0,
    /** function from VideoPlayer's onReady, lets us seek when the user clicks a timecode */
    seek = (_t) => {},
    /** called whenever comments are loaded; useful for markers */
    onCommentsChange = (_comments) => {},
  } = $props();

  let comments = $state([]);
  let loading = $state(true);
  let body = $state('');
  let attachTimecode = $state(true);
  let posting = $state(false);
  let replyingTo = $state(null);
  let replyBody = $state('');
  let editing = $state(null);
  let editBody = $state('');

  let canComment = $derived(!!$auth.user);

  onMount(load);

  // Reload when asset changes
  $effect(() => {
    if (assetId) load();
  });

  async function load() {
    loading = true;
    try {
      comments = await api.get(`/comments?assetId=${assetId}`, { silent: true });
    } catch {
      comments = [];
    } finally {
      loading = false;
      onCommentsChange(comments);
    }
  }

  // Group: build a tree (parent -> replies)
  let tree = $derived.by(() => {
    const roots = [];
    const byId = new Map();
    for (const c of comments) {
      byId.set(c.id, { ...c, replies: [] });
    }
    for (const c of comments) {
      if (c.parentId && byId.has(c.parentId)) {
        byId.get(c.parentId).replies.push(byId.get(c.id));
      } else {
        roots.push(byId.get(c.id));
      }
    }
    // Sort roots by timecode (if any) then createdAt
    roots.sort((a, b) => {
      if (a.timecode != null && b.timecode != null) return a.timecode - b.timecode;
      if (a.timecode != null) return -1;
      if (b.timecode != null) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    return roots;
  });

  async function submit() {
    if (!body.trim() || posting) return;
    posting = true;
    try {
      await api.post('/comments', {
        assetId,
        body,
        timecode: attachTimecode ? Number(currentTime.toFixed(2)) : null,
      });
      body = '';
      await load();
    } finally {
      posting = false;
    }
  }

  async function submitReply(parentId) {
    if (!replyBody.trim()) return;
    await api.post('/comments', {
      assetId,
      body: replyBody,
      parentId,
    });
    replyBody = '';
    replyingTo = null;
    await load();
  }

  async function saveEdit(id) {
    if (!editBody.trim()) return;
    await api.patch(`/comments/${id}`, { body: editBody });
    editing = null;
    editBody = '';
    await load();
  }

  async function toggleResolved(c) {
    await api.post(`/comments/${c.id}/resolve`);
    await load();
  }

  async function remove(c) {
    const ok = await confirm.ask({
      title: 'Delete comment?',
      message: 'This will permanently remove the comment and all replies.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/comments/${c.id}`);
    toast.success('Comment deleted');
    await load();
  }

  function formatTimecode(s) {
    if (s == null) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
    <h3 class="text-sm font-semibold">
      Comments
      <span class="text-gray-500 font-normal">{comments.length}</span>
    </h3>
  </div>

  <!-- List -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="p-6 flex items-center justify-center">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if tree.length === 0}
      <div class="p-6 text-center text-sm text-gray-500">
        <p>No comments yet</p>
        {#if canComment}
          <p class="text-xs mt-1">Add the first one below.</p>
        {/if}
      </div>
    {:else}
      <div class="divide-y divide-gray-800">
        {#each tree as c}
          <div class="p-4 {c.resolved ? 'opacity-60' : ''}">
            <div class="flex items-start gap-3">
              <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {initials(c.author?.name)}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-xs text-gray-400 mb-0.5">
                  <span class="font-medium text-gray-200">{c.author?.name ?? 'Unknown'}</span>
                  {#if c.timecode != null}
                    <button
                      onclick={() => seek(c.timecode)}
                      class="px-1.5 py-0.5 text-xs font-mono rounded bg-blue-950/60 text-blue-300 hover:bg-blue-900/60"
                    >
                      {formatTimecode(c.timecode)}
                    </button>
                  {/if}
                  <span class="text-gray-500">·</span>
                  <span>{timeAgo(c.createdAt)}</span>
                  {#if c.resolved}
                    <span class="text-gray-500">·</span>
                    <span class="text-green-400">resolved</span>
                  {/if}
                </div>

                {#if editing === c.id}
                  <MentionTextarea bind:value={editBody} rows={2} onSubmit={() => saveEdit(c.id)} />
                  <div class="flex gap-2 mt-2">
                    <button onclick={() => saveEdit(c.id)} class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">Save</button>
                    <button onclick={() => { editing = null; editBody = ''; }} class="px-3 py-1 text-xs text-gray-400 hover:text-gray-200">Cancel</button>
                  </div>
                {:else}
                  <p class="text-sm">
                    <CommentBody body={c.body} mentions={c.mentions} />
                  </p>
                  <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    <button onclick={() => { replyingTo = replyingTo === c.id ? null : c.id; replyBody = ''; }} class="hover:text-gray-200">
                      Reply
                    </button>
                    <button onclick={() => toggleResolved(c)} class="hover:text-gray-200">
                      {c.resolved ? 'Unresolve' : 'Resolve'}
                    </button>
                    {#if c.author?.id === $auth.user?.id}
                      <button onclick={() => { editing = c.id; editBody = c.body; }} class="hover:text-gray-200">Edit</button>
                    {/if}
                    {#if c.author?.id === $auth.user?.id || $auth.user?.role === 'admin'}
                      <button onclick={() => remove(c)} class="hover:text-red-400">Delete</button>
                    {/if}
                  </div>
                {/if}

                <!-- Replies -->
                {#if c.replies?.length}
                  <div class="mt-3 pl-3 border-l border-gray-800 space-y-3">
                    {#each c.replies as r}
                      <div class="flex items-start gap-2">
                        <div class="w-6 h-6 rounded-full bg-gray-700 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {initials(r.author?.name)}
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-xs text-gray-400 mb-0.5">
                            <span class="font-medium text-gray-200">{r.author?.name ?? 'Unknown'}</span>
                            <span class="text-gray-500">· {timeAgo(r.createdAt)}</span>
                          </div>
                          <p class="text-sm">
                            <CommentBody body={r.body} mentions={r.mentions} />
                          </p>
                          {#if r.author?.id === $auth.user?.id || $auth.user?.role === 'admin'}
                            <button onclick={() => remove(r)} class="text-xs text-gray-500 hover:text-red-400 mt-1">
                              Delete
                            </button>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}

                <!-- Reply composer -->
                {#if replyingTo === c.id}
                  <div class="mt-3">
                    <MentionTextarea bind:value={replyBody} rows={2} placeholder="Reply..." onSubmit={() => submitReply(c.id)} />
                    <div class="flex gap-2 mt-2">
                      <button onclick={() => submitReply(c.id)} disabled={!replyBody.trim()} class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-60">
                        Post reply
                      </button>
                      <button onclick={() => { replyingTo = null; replyBody = ''; }} class="px-3 py-1 text-xs text-gray-400 hover:text-gray-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Composer -->
  {#if canComment}
    <div class="border-t border-gray-800 p-3 shrink-0">
      <MentionTextarea bind:value={body} rows={2} onSubmit={submit} />
      <div class="flex items-center justify-between mt-2">
        <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" bind:checked={attachTimecode} class="accent-blue-600" />
          <span>Attach to <span class="font-mono text-gray-300">{formatTimecode(currentTime)}</span></span>
        </label>
        <button
          onclick={submit}
          disabled={!body.trim() || posting}
          class="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-60"
        >
          {posting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  {/if}
</div>
