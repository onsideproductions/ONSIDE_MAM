<script>
  import { auth } from '$lib/stores/auth';
  import TusUploader from '$components/upload/TusUploader.svelte';

  let canUpload = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );
</script>

<svelte:head>
  <title>Upload - ONSIDE MAM</title>
</svelte:head>

<div class="p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-2">Upload Videos</h1>
  <p class="text-gray-500 mb-6">
    Upload video files to your media library. Files will be automatically transcoded, thumbnailed, and analyzed by AI for tagging.
  </p>

  {#if !canUpload}
    <div class="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-5 text-center">
      <svg class="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="font-medium text-amber-900 dark:text-amber-200">
        You don't have permission to upload
      </p>
      <p class="text-sm text-amber-700 dark:text-amber-400 mt-1">
        Your role is <span class="font-medium">{$auth.user?.role ?? 'unknown'}</span>.
        Ask an admin to grant you the editor or admin role.
      </p>
    </div>
  {:else}
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
  {/if}
</div>
