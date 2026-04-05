<script>
  import * as tus from 'tus-js-client';

  let files = $state([]);
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
    for (const file of videoFiles) {
      const uploadState = $state({
        file,
        progress: 0,
        status: 'pending',
        error: null,
        uploadUrl: null,
      });
      uploads.push(uploadState);
      startUpload(uploadState);
    }
  }

  function startUpload(uploadState) {
    uploadState.status = 'uploading';

    const upload = new tus.Upload(uploadState.file, {
      endpoint: '/api/upload',
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 50 * 1024 * 1024, // 50MB chunks
      metadata: {
        filename: uploadState.file.name,
        filetype: uploadState.file.type,
        filesize: String(uploadState.file.size),
      },
      onProgress(bytesUploaded, bytesTotal) {
        uploadState.progress = Math.round((bytesUploaded / bytesTotal) * 100);
      },
      onSuccess() {
        uploadState.status = 'complete';
        uploadState.progress = 100;
        uploadState.uploadUrl = upload.url;
      },
      onError(error) {
        uploadState.status = 'error';
        uploadState.error = error.message;
      },
    });

    upload.start();
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function removeUpload(index) {
    uploads.splice(index, 1);
  }
</script>

<div class="space-y-6">
  <!-- Drop zone -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    ondragover={(e) => e.preventDefault()}
    ondrop={handleDrop}
    class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer"
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
    <p class="text-xs text-gray-400 mt-3">Supports MP4, MOV, MKV, AVI, and more. Max 50GB per file.</p>
  </div>

  <!-- Upload list -->
  {#if uploads.length > 0}
    <div class="space-y-3">
      <h3 class="font-semibold">Uploads</h3>
      {#each uploads as upload, i}
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex-1 min-w-0 mr-4">
              <p class="text-sm font-medium truncate">{upload.file.name}</p>
              <p class="text-xs text-gray-500">{formatBytes(upload.file.size)}</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              {#if upload.status === 'complete'}
                <span class="text-sm text-green-600 font-medium">Complete</span>
                <a href="/assets" class="text-xs text-blue-600 hover:text-blue-700">View</a>
              {:else if upload.status === 'error'}
                <span class="text-sm text-red-600" title={upload.error}>Error</span>
              {:else}
                <span class="text-sm font-medium">{upload.progress}%</span>
              {/if}
              <button onclick={() => removeUpload(i)} class="text-gray-400 hover:text-gray-600">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          {#if upload.status === 'uploading'}
            <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style="width: {upload.progress}%"
              ></div>
            </div>
          {:else if upload.status === 'complete'}
            <div class="w-full bg-green-100 dark:bg-green-900/30 rounded-full h-2">
              <div class="bg-green-500 h-2 rounded-full w-full"></div>
            </div>
            <p class="text-xs text-gray-500 mt-2">Processing will begin automatically. AI analysis will run after thumbnails are generated.</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
