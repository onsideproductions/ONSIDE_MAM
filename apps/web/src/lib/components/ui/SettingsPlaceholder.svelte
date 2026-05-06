<script>
  let { title, description, features = [] } = $props();
</script>

<div class="space-y-6">
  <div>
    <div class="flex items-center gap-3">
      <h2 class="text-xl font-semibold">{title}</h2>
      <span class="px-2 py-0.5 text-xs font-medium bg-blue-950 text-blue-300 border border-blue-900 rounded-full">
        Coming soon
      </span>
    </div>
    <p class="text-sm text-gray-400 mt-1">{description}</p>
  </div>

  <div class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
    <div class="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-800 flex items-center justify-center">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <p class="text-sm font-medium">This page isn't built yet</p>
    <p class="text-xs text-gray-500 mt-1">It's reserved in the navigation as a placeholder.</p>
    {#if features.length}
      <ul class="mt-5 text-left max-w-sm mx-auto text-sm text-gray-400 space-y-2">
        {#each features as feature}
          <li class="flex items-start gap-2">
            <svg class="w-4 h-4 mt-0.5 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span>{feature}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
