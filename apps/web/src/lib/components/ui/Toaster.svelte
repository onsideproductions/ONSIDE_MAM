<script>
  import { toast } from '$lib/stores/toast';
</script>

<div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
  {#each $toast as t (t.id)}
    <div
      class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm
        {t.kind === 'success'
          ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-900 dark:text-green-100'
          : t.kind === 'error'
            ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-900 dark:text-red-100'
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100'}"
      role="status"
    >
      <div class="shrink-0 mt-0.5">
        {#if t.kind === 'success'}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        {:else if t.kind === 'error'}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        {/if}
      </div>
      <p class="flex-1">{t.message}</p>
      <button
        onclick={() => toast.dismiss(t.id)}
        class="shrink-0 -mr-1 p-1 hover:opacity-70"
        aria-label="Dismiss"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/each}
</div>
