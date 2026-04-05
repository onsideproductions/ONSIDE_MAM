<script>
  import TusUploader from '$components/upload/TusUploader.svelte';
</script>

<svelte:head>
  <title>Upload - ONSIDE MAM</title>
</svelte:head>

<div class="p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-2">Upload Videos</h1>
  <p class="text-gray-500 mb-6">Upload video files to your media library. Files will be automatically transcoded, thumbnailed, and analyzed by AI for tagging.</p>

  <TusUploader />

  <div class="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
    <h3 class="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">What happens after upload?</h3>
    <ol class="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
      <li>Technical metadata is extracted (resolution, duration, codec, framerate)</li>
      <li>A proxy version and HLS stream are generated for browser playback</li>
      <li>Thumbnail and sprite sheet are created for previews</li>
      <li>Google Gemini AI analyzes the video and auto-generates tags and descriptions</li>
      <li>The asset becomes searchable and ready for browsing</li>
    </ol>
  </div>
</div>
