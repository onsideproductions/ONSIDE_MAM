<script>
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import * as tus from 'tus-js-client';

  let { asset, onChange = () => {} } = $props();

  let menuOpen = $state(false);
  let uploadingNewVersion = $state(false);
  let uploadProgress = $state(0);
  let fileInput;

  let canUpload = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );

  let versions = $derived(asset?.versions ?? []);
  let currentVersion = $derived(asset?.versionNumber ?? 1);
  let totalVersions = $derived(versions.length || 1);

  function pickFile() {
    fileInput?.click();
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Please choose a video file');
      return;
    }
    upload(file);
    e.target.value = '';
  }

  function upload(file) {
    uploadingNewVersion = true;
    uploadProgress = 0;

    const tusUpload = new tus.Upload(file, {
      endpoint: '/api/upload',
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 50 * 1024 * 1024,
      withCredentials: true,
      metadata: {
        filename: file.name,
        filetype: file.type,
        filesize: String(file.size),
        version_of: asset.id,
      },
      onProgress(bytesUploaded, bytesTotal) {
        uploadProgress = Math.round((bytesUploaded / bytesTotal) * 100);
      },
      onSuccess() {
        uploadingNewVersion = false;
        uploadProgress = 100;
        toast.success(`V${totalVersions + 1} uploaded`);
        onChange();
      },
      onError(err) {
        uploadingNewVersion = false;
        toast.error('Upload failed: ' + err.message);
      },
    });

    tusUpload.start();
  }

  function selectVersion(v) {
    menuOpen = false;
    if (v.id !== asset.id) {
      goto(`/assets/${v.id}`);
    }
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    const k = 1024;
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
  }
</script>

<input
  type="file"
  accept="video/*"
  bind:this={fileInput}
  onchange={onFileChange}
  class="hidden"
/>

<div class="relative">
  <button
    onclick={() => menuOpen = !menuOpen}
    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-gray-700 rounded-md hover:bg-gray-800
      {!asset.isLatestVersion ? 'border-amber-700 bg-amber-950/40 text-amber-300' : 'text-gray-300'}"
  >
    V{currentVersion}
    {#if totalVersions > 1}
      <span class="text-gray-500">of {totalVersions}</span>
    {/if}
    <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if menuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-30" onclick={() => menuOpen = false}></div>
    <div class="absolute right-0 top-full mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-40 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-800">
        <p class="text-sm font-semibold">Versions</p>
        <p class="text-xs text-gray-500 mt-0.5">
          {totalVersions} {totalVersions === 1 ? 'version' : 'versions'} of this asset.
        </p>
      </div>
      <div class="max-h-64 overflow-y-auto">
        {#each versions as v}
          <button
            onclick={() => selectVersion(v)}
            class="w-full text-left px-4 py-2.5 hover:bg-gray-800 flex items-center gap-3
              {v.id === asset.id ? 'bg-blue-950/40' : ''}"
          >
            <div class="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xs font-mono shrink-0">
              V{v.versionNumber}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate flex items-center gap-2">
                {v.originalFilename}
                {#if v.isLatestVersion}
                  <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-blue-950 text-blue-300 rounded">latest</span>
                {/if}
              </p>
              <p class="text-xs text-gray-500">{fmtDate(v.createdAt)} · {fmtSize(v.fileSize)}</p>
            </div>
            {#if v.id === asset.id}
              <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
      {#if canUpload}
        <button
          onclick={() => { menuOpen = false; pickFile(); }}
          disabled={uploadingNewVersion}
          class="w-full px-4 py-2.5 text-sm font-medium text-blue-400 border-t border-gray-800 hover:bg-gray-800 text-left flex items-center gap-2 disabled:opacity-60"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {uploadingNewVersion ? `Uploading ${uploadProgress}%...` : 'Upload new version'}
        </button>
      {/if}
    </div>
  {/if}
</div>

{#if uploadingNewVersion}
  <div class="absolute -bottom-1 left-0 right-0 h-1 bg-gray-800 overflow-hidden">
    <div class="h-full bg-blue-500 transition-all" style="width: {uploadProgress}%"></div>
  </div>
{/if}
