<script>
  let { asset } = $props();

  function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
</script>

<a href="/assets/{asset.id}" class="group block">
  <div class="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
    {#if asset.thumbnailUrl}
      <img
        src={asset.thumbnailUrl}
        alt={asset.title}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
      />
    {:else}
      <div class="w-full h-full flex items-center justify-center text-gray-400">
        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    {/if}

    <!-- Duration badge -->
    {#if asset.duration}
      <span class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-xs font-medium bg-black/75 text-white rounded">
        {formatDuration(asset.duration)}
      </span>
    {/if}

    <!-- Status badge -->
    {#if asset.status !== 'ready'}
      <span class="absolute top-1.5 left-1.5 px-2 py-0.5 text-xs font-medium rounded
        {asset.status === 'processing' || asset.status === 'analyzing'
          ? 'bg-amber-500 text-white'
          : asset.status === 'error'
            ? 'bg-red-500 text-white'
            : 'bg-gray-500 text-white'}">
        {asset.status}
      </span>
    {/if}
  </div>

  <p class="text-sm font-medium truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
    {asset.title}
  </p>
  {#if asset.codec && asset.width}
    <p class="text-xs text-gray-500 mt-0.5">{asset.width}x{asset.height} &middot; {asset.codec.toUpperCase()}</p>
  {/if}
</a>
