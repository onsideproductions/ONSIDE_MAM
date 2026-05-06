<script>
  import { confirm } from '$lib/stores/confirm';

  function handleKey(e) {
    if (!$confirm.open) return;
    if (e.key === 'Escape') confirm.answer(false);
    if (e.key === 'Enter') confirm.answer(true);
  }
</script>

<svelte:window on:keydown={handleKey} />

{#if $confirm.open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    onclick={() => confirm.answer(false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="p-6">
        {#if $confirm.title}
          <h2 class="text-lg font-semibold mb-1">{$confirm.title}</h2>
        {/if}
        <p class="text-sm text-gray-600 dark:text-gray-400">{$confirm.message}</p>
      </div>
      <div class="px-6 py-4 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 rounded-b-xl flex justify-end gap-2">
        <button
          onclick={() => confirm.answer(false)}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
        >
          {$confirm.cancelText ?? 'Cancel'}
        </button>
        <button
          onclick={() => confirm.answer(true)}
          autofocus
          class="px-4 py-2 text-sm font-medium text-white rounded-lg
            {$confirm.destructive
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'}"
        >
          {$confirm.confirmText ?? 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}
