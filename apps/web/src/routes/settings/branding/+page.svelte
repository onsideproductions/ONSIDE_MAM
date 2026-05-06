<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import { confirm } from '$lib/stores/confirm';
  import { branding } from '$lib/stores/branding';

  let loading = $state(true);
  let saving = $state(false);
  let uploadingLogo = $state(false);

  let teamName = $state('');
  let accentColor = $state('#1697C5');
  let logoUrl = $state(null);
  let fileInput;

  let isAdmin = $derived($auth.user?.role === 'admin');

  // Preset colors a la frame.io
  const presets = [
    { name: 'Cyan',   value: '#1697C5' },
    { name: 'Blue',   value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink',   value: '#EC4899' },
    { name: 'Red',    value: '#EF4444' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Green',  value: '#10B981' },
    { name: 'Teal',   value: '#14B8A6' },
  ];

  onMount(async () => {
    try {
      const data = await api.get('/settings/account');
      const b = data.branding ?? {};
      teamName = b.teamName ?? '';
      accentColor = b.accentColor ?? '#1697C5';
      logoUrl = b.logoUrl ?? null;
      // Live-preview colors as the user changes them
      branding.setBranding({ ...b });
    } finally {
      loading = false;
    }
  });

  // Live preview while editing
  $effect(() => {
    branding.setBranding({
      teamName: teamName || undefined,
      accentColor,
      logoUrl,
    });
  });

  async function save() {
    saving = true;
    try {
      const data = await api.patch('/settings/account', {
        branding: {
          teamName: teamName.trim() || undefined,
          accentColor,
        },
      });
      branding.setBranding(data.branding ?? {});
      toast.success('Branding saved');
    } finally {
      saving = false;
    }
  }

  async function pickFile() {
    fileInput?.click();
  }

  async function uploadLogo(file) {
    uploadingLogo = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/account/logo', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || data.error || 'Upload failed');
        return;
      }
      const data = await res.json();
      logoUrl = data.branding?.logoUrl ?? null;
      branding.setBranding(data.branding ?? {});
      toast.success('Logo uploaded');
    } finally {
      uploadingLogo = false;
    }
  }

  async function removeLogo() {
    const ok = await confirm.ask({
      title: 'Remove logo?',
      message: 'The team name will be shown in the navigation instead.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    const data = await api.delete('/settings/account/logo');
    logoUrl = data.branding?.logoUrl ?? null;
    branding.setBranding(data.branding ?? {});
    toast.success('Logo removed');
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    uploadLogo(file);
    e.target.value = '';
  }
</script>

<svelte:head>
  <title>Branding - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h2 class="text-xl font-semibold">Branding</h2>
    <p class="text-sm text-gray-400 mt-1">
      Customise how your media library is presented across the app.
      {#if !isAdmin}
        <span class="block mt-1 text-amber-400">View only - admins can make changes.</span>
      {/if}
    </p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Logo -->
    <section class="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 class="text-base font-semibold mb-1">Logo</h3>
      <p class="text-sm text-gray-400 mb-5">
        Replaces the wordmark in the navigation. Use a transparent PNG or SVG. Max 5MB.
      </p>

      <div class="flex items-center gap-5">
        <div class="w-32 h-16 rounded-lg bg-gray-950 border border-gray-800 flex items-center justify-center overflow-hidden">
          {#if logoUrl}
            <img src={logoUrl} alt="Logo" class="max-w-full max-h-full object-contain" />
          {:else}
            <span class="text-xs text-gray-600">No logo</span>
          {/if}
        </div>

        {#if isAdmin}
          <div class="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              bind:this={fileInput}
              onchange={onFileChange}
              class="hidden"
            />
            <button
              onclick={pickFile}
              disabled={uploadingLogo}
              class="px-3 py-1.5 text-sm font-medium border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-60"
            >
              {uploadingLogo ? 'Uploading...' : logoUrl ? 'Replace' : 'Upload logo'}
            </button>
            {#if logoUrl}
              <button
                onclick={removeLogo}
                class="px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950/30 rounded-lg"
              >
                Remove
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- Team name -->
    <section class="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 class="text-base font-semibold mb-1">Team name</h3>
      <p class="text-sm text-gray-400 mb-4">
        Shown in the navigation when no logo is set, and in browser tabs.
      </p>
      <input
        type="text"
        bind:value={teamName}
        placeholder="ONSIDE"
        disabled={!isAdmin}
        maxlength="40"
        class="w-full max-w-sm px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
      />
    </section>

    <!-- Accent color -->
    <section class="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 class="text-base font-semibold mb-1">Accent colour</h3>
      <p class="text-sm text-gray-400 mb-5">
        The colour used for buttons, links and selected states across the app.
      </p>

      <div class="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4">
        {#each presets as p}
          <button
            onclick={() => isAdmin && (accentColor = p.value)}
            disabled={!isAdmin}
            class="aspect-square rounded-lg border-2 transition flex items-center justify-center
              {accentColor.toLowerCase() === p.value.toLowerCase()
                ? 'border-white scale-105'
                : 'border-transparent hover:scale-105'}
              disabled:cursor-not-allowed disabled:opacity-60"
            style="background-color: {p.value}"
            title={p.name}
            aria-label={p.name}
          >
            {#if accentColor.toLowerCase() === p.value.toLowerCase()}
              <svg class="w-5 h-5 text-white drop-shadow" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-400">Or pick a custom hex:</span>
        <input
          type="color"
          bind:value={accentColor}
          disabled={!isAdmin}
          class="w-10 h-10 rounded cursor-pointer disabled:opacity-60"
        />
        <input
          type="text"
          bind:value={accentColor}
          disabled={!isAdmin}
          maxlength="7"
          class="w-28 px-3 py-2 text-sm font-mono bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
      </div>

      <!-- Live preview -->
      <div class="mt-6 p-4 bg-gray-950 border border-gray-800 rounded-lg">
        <p class="text-xs uppercase tracking-wider text-gray-500 mb-3">Preview</p>
        <div class="flex items-center gap-3">
          <button class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            Primary action
          </button>
          <a href="/assets" class="text-sm text-blue-400 hover:text-blue-300">A link</a>
          <span class="px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full">
            Tag
          </span>
        </div>
      </div>
    </section>

    {#if isAdmin}
      <div class="flex justify-end">
        <button
          onclick={save}
          disabled={saving}
          class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    {/if}
  {/if}
</div>
