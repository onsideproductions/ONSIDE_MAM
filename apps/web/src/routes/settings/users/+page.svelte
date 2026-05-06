<script>
  import { onMount } from 'svelte';
  import { api } from '$api/client';
  import { auth } from '$lib/stores/auth';
  import { toast } from '$lib/stores/toast';
  import { confirm } from '$lib/stores/confirm';

  let users = $state([]);
  let loading = $state(true);

  let showAddForm = $state(false);
  let newName = $state('');
  let newEmail = $state('');
  let newPassword = $state('');
  let newRole = $state('viewer');
  let creating = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    try {
      users = await api.get('/users');
    } finally {
      loading = false;
    }
  }

  async function createUser(e) {
    e.preventDefault();
    creating = true;
    try {
      await api.post('/users', {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
      });
      newName = '';
      newEmail = '';
      newPassword = '';
      newRole = 'viewer';
      showAddForm = false;
      toast.success('User created');
      await load();
    } finally {
      creating = false;
    }
  }

  async function changeRole(u, role) {
    if (u.role === role) return;
    await api.patch(`/users/${u.id}`, { role });
    toast.success(`${u.name} is now ${role}`);
    await load();
  }

  async function deleteUser(u) {
    if (u.id === $auth.user?.id) {
      toast.error('You cannot delete your own account');
      return;
    }
    const ok = await confirm.ask({
      title: `Delete ${u.name}?`,
      message: `${u.email} will be permanently removed and signed out from all devices. Their uploaded assets will remain in the library but will become unowned.`,
      confirmText: 'Delete user',
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/users/${u.id}`);
    toast.success(`Deleted ${u.email}`);
    await load();
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let p = '';
    for (let i = 0; i < 14; i++) p += chars[Math.floor(Math.random() * chars.length)];
    newPassword = p;
  }
</script>

<svelte:head>
  <title>Users - Settings - ONSIDE MAM</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2 class="text-xl font-semibold">Users</h2>
      <p class="text-sm text-gray-400 mt-1">Add and manage team members. Roles control what each member can do.</p>
    </div>
    <button
      onclick={() => showAddForm = !showAddForm}
      class="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      Add user
    </button>
  </div>

  {#if showAddForm}
    <form onsubmit={createUser} class="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="text-sm">
          <span class="block text-xs font-medium text-gray-400 mb-1">Name</span>
          <input
            bind:value={newName}
            required
            minlength="2"
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label class="text-sm">
          <span class="block text-xs font-medium text-gray-400 mb-1">Email</span>
          <input
            type="email"
            bind:value={newEmail}
            required
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="text-sm">
          <span class="block text-xs font-medium text-gray-400 mb-1">Initial password</span>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newPassword}
              required
              minlength="8"
              placeholder="At least 8 characters"
              class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onclick={generatePassword}
              class="px-3 py-2 text-xs border border-gray-700 rounded-lg hover:bg-gray-800"
            >
              Generate
            </button>
          </div>
          <p class="text-xs text-gray-500 mt-1">Share this with the user; they can change it on their profile.</p>
        </label>
        <label class="text-sm">
          <span class="block text-xs font-medium text-gray-400 mb-1">Role</span>
          <select
            bind:value={newRole}
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="viewer">Viewer (browse, search, download)</option>
            <option value="editor">Editor (+ upload, tag, organise)</option>
            <option value="admin">Admin (+ delete, manage users)</option>
          </select>
        </label>
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" onclick={() => showAddForm = false} class="px-3 py-2 text-sm text-gray-400 hover:text-gray-200">
          Cancel
        </button>
        <button
          type="submit"
          disabled={creating}
          class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  {/if}

  <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else}
      <table class="w-full text-sm">
        <thead class="bg-gray-950 border-b border-gray-800">
          <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 font-medium">Role</th>
            <th class="px-4 py-3 w-12"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          {#each users as u}
            <tr>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
                    {u.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span class="font-medium">{u.name}</span>
                  {#if u.id === $auth.user?.id}
                    <span class="text-xs text-gray-500">(you)</span>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3 text-gray-400">{u.email}</td>
              <td class="px-4 py-3">
                <select
                  value={u.role}
                  onchange={(e) => changeRole(u, e.currentTarget.value)}
                  disabled={u.id === $auth.user?.id}
                  class="px-2 py-1 bg-gray-800 border border-gray-700 rounded-md text-xs disabled:opacity-60"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td class="px-4 py-3 text-right">
                {#if u.id !== $auth.user?.id}
                  <button
                    onclick={() => deleteUser(u)}
                    class="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-950/40 rounded"
                    aria-label="Delete user"
                    title="Delete user"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>
