<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { toast } from '$lib/stores/toast';

  let prefs = $state(null);
  let loading = $state(true);
  let saving = $state(false);

  onMount(async () => {
    try {
      prefs = await api.get('/settings/notifications');
    } finally {
      loading = false;
    }
  });

  async function update(field, value) {
    saving = true;
    try {
      const updated = await api.patch('/settings/notifications', { [field]: value });
      prefs = updated;
    } catch {
      // toast already shown by api client; revert local
      prefs = await api.get('/settings/notifications', { silent: true });
    } finally {
      saving = false;
    }
  }

  const groups = [
    {
      heading: 'Comments',
      description: 'Activity on comments and threads.',
      items: [
        { field: 'commentsGeneral', label: 'General Comments', sub: 'When someone comments on an asset' },
        { field: 'commentsReplies', label: 'Comment Replies', sub: 'When someone replies to your comment' },
        { field: 'commentsMentions', label: '@Mentions', sub: 'When someone @mentions you in a comment' },
      ],
    },
    {
      heading: 'Assets',
      description: 'Activity on assets in the library.',
      items: [
        { field: 'uploadsYours', label: 'Your Uploads', sub: 'When you upload assets' },
        { field: 'uploadsOthers', label: 'Other Uploads', sub: 'When other users upload assets' },
        { field: 'statusUpdates', label: 'Status Updates', sub: "When someone changes an asset's status" },
        { field: 'assignedToYou', label: 'Assigned to You', sub: 'When someone assigns an asset to you' },
        { field: 'transcriptionActivity', label: 'Your Transcription Activity', sub: 'When you transcribe assets' },
      ],
    },
  ];
</script>

<svelte:head>
  <title>Notifications - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h2 class="text-xl font-semibold">Notifications</h2>
    <p class="text-sm text-gray-400 mt-1">
      Manage how you receive notifications for this account. These settings apply only to you and won't affect other members.
    </p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if prefs}
    {#each groups as group}
      <section class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-800">
          <h3 class="text-base font-semibold">{group.heading}</h3>
          <p class="text-sm text-gray-400 mt-0.5">{group.description}</p>
        </div>
        <div class="divide-y divide-gray-800">
          {#each group.items as item}
            <div class="flex items-start justify-between gap-4 px-5 py-4">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">{item.label}</p>
                <p class="text-xs text-gray-400 mt-0.5">{item.sub}</p>
              </div>
              <button
                onclick={() => update(item.field, !prefs[item.field])}
                disabled={saving}
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60
                  {prefs[item.field] ? 'bg-blue-600' : 'bg-gray-700'}"
                role="switch"
                aria-checked={prefs[item.field]}
                aria-label={item.label}
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition
                    {prefs[item.field] ? 'translate-x-4' : 'translate-x-0.5'}"
                ></span>
              </button>
            </div>
          {/each}
        </div>
      </section>
    {/each}

    <section class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-800">
        <h3 class="text-base font-semibold">Email Notifications</h3>
        <p class="text-sm text-gray-400 mt-0.5">
          When enabled, the events above can also reach you by email. Email delivery isn't wired up yet — toggling this just stores your preference for now.
        </p>
      </div>
      <div class="px-5 py-4 flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Send notification emails</p>
          <p class="text-xs text-gray-400 mt-0.5">{prefs.emailEnabled ? 'You will receive emails for the events enabled above.' : 'You will not receive any notification emails.'}</p>
        </div>
        <button
          onclick={() => update('emailEnabled', !prefs.emailEnabled)}
          disabled={saving}
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60
            {prefs.emailEnabled ? 'bg-blue-600' : 'bg-gray-700'}"
          role="switch"
          aria-checked={prefs.emailEnabled}
          aria-label="Email notifications"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition
              {prefs.emailEnabled ? 'translate-x-4' : 'translate-x-0.5'}"
          ></span>
        </button>
      </div>
    </section>
  {/if}
</div>
