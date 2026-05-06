<script>
  import { api } from '$api/client';
  import { toast } from '$lib/stores/toast';

  let { assetId, open = $bindable(false), onCreated = () => {} } = $props();

  let title = $state('');
  let withPassword = $state(false);
  let password = $state('');
  let withExpiry = $state(false);
  let expiresAt = $state('');
  let allowDownload = $state(false);
  let creating = $state(false);
  let createdShare = $state(null);

  function reset() {
    title = '';
    withPassword = false;
    password = '';
    withExpiry = false;
    expiresAt = '';
    allowDownload = false;
    creating = false;
    createdShare = null;
  }

  function close() {
    open = false;
    reset();
  }

  async function create(e) {
    e.preventDefault();
    if (withPassword && password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    creating = true;
    try {
      const share = await api.post('/shares', {
        assetId,
        title: title.trim() || undefined,
        password: withPassword ? password : undefined,
        expiresAt: withExpiry && expiresAt ? new Date(expiresAt).toISOString() : undefined,
        allowDownload,
      });
      createdShare = share;
      onCreated();
    } finally {
      creating = false;
    }
  }

  let shareUrl = $derived(
    createdShare && typeof window !== 'undefined'
      ? `${window.location.origin}/share/${createdShare.id}`
      : ''
  );

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy - select the link manually');
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    onclick={close}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 max-w-md w-full"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {#if createdShare}
        <!-- Success view -->
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-950 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold">Share link ready</h3>
              <p class="text-sm text-gray-400">Anyone with this link can view the asset.</p>
            </div>
          </div>

          <div class="flex gap-2">
            <input
              readonly
              value={shareUrl}
              onclick={(e) => e.target.select()}
              class="flex-1 px-3 py-2 text-sm bg-gray-950 border border-gray-700 rounded-lg font-mono"
            />
            <button
              onclick={copyUrl}
              class="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Copy
            </button>
          </div>

          {#if createdShare.hasPassword}
            <div class="text-sm text-gray-400 bg-gray-950 border border-gray-800 rounded-lg p-3">
              <p class="font-medium text-gray-300 mb-1">Password protected</p>
              <p>You'll need to share the password separately with the recipient.</p>
            </div>
          {/if}

          <div class="flex justify-end pt-2">
            <button
              onclick={close}
              class="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      {:else}
        <!-- Create form -->
        <form onsubmit={create} class="p-6 space-y-4">
          <div>
            <h3 class="text-base font-semibold">Create share link</h3>
            <p class="text-sm text-gray-400 mt-0.5">
              Generate a public link that doesn't require a sign-in.
            </p>
          </div>

          <div>
            <label for="share-title" class="block text-xs font-medium text-gray-400 mb-1">
              Title (optional)
            </label>
            <input
              id="share-title"
              bind:value={title}
              placeholder="e.g. Race Day Highlights"
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={allowDownload}
              class="mt-0.5 accent-blue-600"
            />
            <span class="text-sm">
              <span class="font-medium block">Allow downloads</span>
              <span class="text-xs text-gray-400">Recipients can download the original file.</span>
            </span>
          </label>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={withPassword}
              class="mt-0.5 accent-blue-600"
            />
            <span class="text-sm flex-1">
              <span class="font-medium block">Require password</span>
              {#if withPassword}
                <input
                  bind:value={password}
                  type="text"
                  placeholder="Enter a password"
                  minlength="4"
                  class="w-full mt-2 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              {:else}
                <span class="text-xs text-gray-400">Anyone with the link can view.</span>
              {/if}
            </span>
          </label>

          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={withExpiry}
              class="mt-0.5 accent-blue-600"
            />
            <span class="text-sm flex-1">
              <span class="font-medium block">Set expiry</span>
              {#if withExpiry}
                <input
                  bind:value={expiresAt}
                  type="datetime-local"
                  class="w-full mt-2 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              {:else}
                <span class="text-xs text-gray-400">The link will work indefinitely.</span>
              {/if}
            </span>
          </label>

          <div class="flex justify-end gap-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              onclick={close}
              class="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create link'}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
