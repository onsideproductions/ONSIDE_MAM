<script>
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth';

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    error = '';
    submitting = true;
    try {
      await auth.signUp(email, password, name);
      await goto('/');
    } catch (err) {
      error = err.message || 'Sign up failed';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Sign up - ONSIDE MAM</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-blue-600 dark:text-blue-400">ONSIDE MAM</h1>
      <p class="text-sm text-gray-500 mt-1">Create your account</p>
    </div>

    <form onsubmit={handleSubmit} class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
      {#if error}
        <div class="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
          {error}
        </div>
      {/if}

      <div>
        <label for="name" class="block text-sm font-medium mb-1">Name</label>
        <input
          id="name"
          type="text"
          required
          minlength="2"
          bind:value={name}
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autocomplete="name"
        />
      </div>

      <div>
        <label for="email" class="block text-sm font-medium mb-1">Email</label>
        <input
          id="email"
          type="email"
          required
          bind:value={email}
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autocomplete="email"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium mb-1">Password</label>
        <input
          id="password"
          type="password"
          required
          minlength="8"
          bind:value={password}
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autocomplete="new-password"
        />
        <p class="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        class="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
      >
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p class="text-sm text-center text-gray-500 mt-2">
        Already have an account?
        <a href="/login" class="text-blue-600 hover:text-blue-700 font-medium">Sign in</a>
      </p>
    </form>
  </div>
</div>
