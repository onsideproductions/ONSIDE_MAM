<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';

  let name = $state('');
  let image = $state('');
  let savingProfile = $state(false);

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let savingPassword = $state(false);

  onMount(() => {
    name = $auth.user?.name ?? '';
    image = $auth.user?.image ?? '';
  });

  async function saveProfile(e) {
    e.preventDefault();
    savingProfile = true;
    try {
      const updated = await api.patch(`/users/${$auth.user.id}`, {
        name: name.trim() || undefined,
        image: image.trim() || null,
      });
      auth.setUser({ ...$auth.user, ...updated });
      toast.success('Profile updated');
    } finally {
      savingProfile = false;
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    savingPassword = true;
    try {
      // better-auth's change-password endpoint
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || data.error || 'Could not change password');
        return;
      }
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      toast.success('Password changed');
    } finally {
      savingPassword = false;
    }
  }

  let initials = $derived(
    ($auth.user?.name ?? '?')
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  );
</script>

<svelte:head>
  <title>Profile - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-10">
  <div>
    <h2 class="text-xl font-semibold">Profile</h2>
    <p class="text-sm text-gray-400 mt-1">Update your personal details and account password.</p>
  </div>

  <!-- Profile section -->
  <form onsubmit={saveProfile} class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
    <div class="flex items-center gap-5">
      <div class="w-16 h-16 rounded-full bg-blue-600 text-white text-xl font-semibold flex items-center justify-center overflow-hidden">
        {#if image && image.startsWith('http')}
          <img src={image} alt="" class="w-full h-full object-cover" />
        {:else}
          {initials}
        {/if}
      </div>
      <div class="flex-1">
        <p class="text-sm font-medium">{$auth.user?.email}</p>
        <p class="text-xs text-gray-500">Role: {$auth.user?.role}</p>
      </div>
    </div>

    <div>
      <label for="name" class="block text-sm font-medium mb-1">Name</label>
      <input
        id="name"
        type="text"
        bind:value={name}
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div>
      <label for="image" class="block text-sm font-medium mb-1">Avatar URL</label>
      <input
        id="image"
        type="url"
        bind:value={image}
        placeholder="https://..."
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p class="text-xs text-gray-500 mt-1">
        Paste a public image URL. File upload will come in a later release.
      </p>
    </div>

    <div class="flex justify-end">
      <button
        type="submit"
        disabled={savingProfile}
        class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
      >
        {savingProfile ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  </form>

  <!-- Password section -->
  <form onsubmit={changePassword} class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
    <div>
      <h3 class="text-base font-semibold">Change password</h3>
      <p class="text-sm text-gray-400 mt-0.5">
        You'll stay signed in on this device after changing your password.
      </p>
    </div>

    <div>
      <label for="cur" class="block text-sm font-medium mb-1">Current password</label>
      <input
        id="cur"
        type="password"
        bind:value={currentPassword}
        autocomplete="current-password"
        required
        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label for="new" class="block text-sm font-medium mb-1">New password</label>
        <input
          id="new"
          type="password"
          bind:value={newPassword}
          autocomplete="new-password"
          minlength="8"
          required
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label for="conf" class="block text-sm font-medium mb-1">Confirm new password</label>
        <input
          id="conf"
          type="password"
          bind:value={confirmPassword}
          autocomplete="new-password"
          minlength="8"
          required
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    <div class="flex justify-end">
      <button
        type="submit"
        disabled={savingPassword || !currentPassword || !newPassword}
        class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
      >
        {savingPassword ? 'Changing…' : 'Change password'}
      </button>
    </div>
  </form>
</div>
