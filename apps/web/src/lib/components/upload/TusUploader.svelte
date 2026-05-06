<script>
  import { uploadFile } from '$lib/upload/multipart';
  import { toast } from '$lib/stores/toast';

  let { versionOf = null, onComplete = () => {} } = $props();

  let uploads = $state([]);

  function handleDrop(e) {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    addFiles(droppedFiles);
  }

  function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
    e.target.value = '';
  }

  function addFiles(newFiles) {
    const videoFiles = newFiles.filter((f) => f.type.startsWith('video/'));
    if (videoFiles.length < newFiles.length) {
      toast.error('Skipped non-video files');
    }
    for (const file of videoFiles) {
      const controller = new AbortController();
      const upload = $state({
        file,
        progress: 0,
        bytesUploaded: 0,
        bytesPerSec: 0,
        etaSec: null,
        partsCompleted: 0,
        partsTotal: 0,
        status: 'uploading',
        error: null,
        controller,
        startedAt: Date.now(),
      });
      uploads.push(upload);
      run(upload);
    }
  }

  async function run(upload) {
    let lastTs = upload.startedAt;
    let lastBytes = 0;

    try {
      await uploadFile({
        file: upload.file,
        versionOf,
        signal: upload.controller.signal,
        onProgress: (p) => {
          const now = Date.now();
          const dt = (now - lastTs) / 1000;
          if (dt > 0.5) {
            upload.bytesPerSec = (p.bytesUploaded - lastBytes) / dt;
            lastTs = now;
            lastBytes = p.bytesUploaded;
            if (upload.bytesPerSec > 0) {
              upload.etaSec = Math.round((p.bytesTotal - p.bytesUploaded) / upload.bytesPerSec);
            }
          }
          upload.progress = p.percent;
          upload.bytesUploaded = p.bytesUploaded;
          upload.partsCompleted = p.partsCompleted;
          upload.partsTotal = p.partsTotal;
        },
      });
      upload.status = 'complete';
      upload.progress = 100;
      onComplete();
    } catch (err) {
      if (err.name === 'AbortError') {
        upload.status = 'aborted';
      } else {
        upload.status = 'error';
        upload.error = err.message;
      }
    }
  }

  function cancel(upload) {
    upload.controller.abort();
  }

  function removeUpload(index) {
    const u = uploads[index];
    if (u.status === 'uploading') cancel(u);
    uploads.splice(index, 1);
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function formatRate(bps) {
    if (!bps) return '';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return `${(bps / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatEta(s) {
    if (s == null || !isFinite(s)) return '';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
</script>

<div class="space-y-6">
  <!-- Drop zone -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    ondragover={(e) => e.preventDefault()}
    ondrop={handleDrop}
    class="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center hover:border-blue-500 hover:bg-blue-900/10 transition-colors cursor-pointer"
  >
    <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
    <p class="text-lg font-medium mb-1">Drop video files here</p>
    <p class="text-sm text-gray-500 mb-4">or click to browse</p>
    <label class="inline-block px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer">
      Choose Files
      <input type="file" accept="video/*" multiple onchange={handleFileSelect} class="hidden" />
    </label>
    <p class="text-xs text-gray-400 mt-3">Uploads go directly to storage in 6 parallel parts. Max 50GB per file.</p>
  </div>

  <!-- Upload list -->
  {#if uploads.length > 0}
    <div class="space-y-3">
      <h3 class="font-semibold">Uploads</h3>
      {#each uploads as upload, i}
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex-1 min-w-0 mr-4">
              <p class="text-sm font-medium truncate">{upload.file.name}</p>
              <p class="text-xs text-gray-500">
                {formatBytes(upload.file.size)}
                {#if upload.status === 'uploading' && upload.bytesPerSec > 0}
                  &middot; {formatRate(upload.bytesPerSec)}
                  {#if upload.etaSec != null}
                    &middot; {formatEta(upload.etaSec)} left
                  {/if}
                  &middot; {upload.partsCompleted}/{upload.partsTotal} parts
                {/if}
              </p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              {#if upload.status === 'complete'}
                <span class="text-sm text-green-400 font-medium">Complete</span>
                <a href="/assets" class="text-xs text-blue-400 hover:text-blue-300">View</a>
              {:else if upload.status === 'error'}
                <span class="text-sm text-red-400" title={upload.error}>Error</span>
              {:else if upload.status === 'aborted'}
                <span class="text-sm text-gray-500">Cancelled</span>
              {:else}
                <span class="text-sm font-medium tabular-nums">{upload.progress}%</span>
                <button onclick={() => cancel(upload)} class="text-xs text-gray-400 hover:text-gray-200">
                  Cancel
                </button>
              {/if}
              <button onclick={() => removeUpload(i)} class="text-gray-500 hover:text-gray-300" aria-label="Remove">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          {#if upload.status === 'uploading'}
            <div class="w-full bg-gray-800 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-200"
                style="width: {upload.progress}%"
              ></div>
            </div>
          {:else if upload.status === 'complete'}
            <div class="w-full bg-green-900/30 rounded-full h-2">
              <div class="bg-green-500 h-2 rounded-full w-full"></div>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Processing will begin automatically. AI analysis will run after thumbnails are generated.
            </p>
          {:else if upload.status === 'error'}
            <p class="text-xs text-red-400">{upload.error}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
