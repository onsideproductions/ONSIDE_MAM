<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth';

  let { children } = $props();

  // Routes that don't require authentication
  const PUBLIC_ROUTES = ['/login', '/signup'];

  let menuOpen = $state(false);

  onMount(async () => {
    await auth.refresh();
  });

  // Redirect to /login when there's no user (except on public routes)
  $effect(() => {
    if ($auth.loading) return;
    const path = $page.url.pathname;
    const isPublic = PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + '/'));
    if (!$auth.user && !isPublic) {
      goto('/login');
    }
    if ($auth.user && isPublic) {
      goto('/');
    }
  });

  let isPublicRoute = $derived(
    PUBLIC_ROUTES.some(
      (p) => $page.url.pathname === p || $page.url.pathname.startsWith(p + '/')
    )
  );

  let canUpload = $derived(
    $auth.user?.role === 'admin' || $auth.user?.role === 'editor'
  );
</script>

{#if isPublicRoute}
  {@render children()}
{:else if $auth.loading || !$auth.user}
  <div class="min-h-screen flex items-center justify-center">
    <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
  </div>
{:else}
  <div class="h-full flex flex-col">
    <!-- Top nav -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-6">
        <a href="/" class="text-xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">
          ONSIDE MAM
        </a>
        <nav class="flex items-center gap-4">
          <a href="/assets" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            Assets
          </a>
          <a href="/collections" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            Collections
          </a>
          {#if canUpload}
            <a href="/upload" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Upload
            </a>
          {/if}
        </nav>
      </div>

      <div class="flex items-center gap-4">
        <!-- Search bar -->
        <form action="/assets" method="get" class="relative">
          <input
            type="search"
            name="q"
            placeholder="Search assets..."
            class="w-72 pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </form>

        {#if canUpload}
          <a
            href="/upload"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload
          </a>
        {/if}

        <!-- User menu -->
        <div class="relative">
          <button
            onclick={() => menuOpen = !menuOpen}
            class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="User menu"
          >
            <div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
              {$auth.user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if menuOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="fixed inset-0 z-10"
              onclick={() => menuOpen = false}
            ></div>
            <div class="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-20 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                <p class="text-sm font-medium truncate">{$auth.user.name}</p>
                <p class="text-xs text-gray-500 truncate">{$auth.user.email}</p>
                <p class="text-xs text-gray-500 mt-0.5">
                  Role: <span class="font-medium">{$auth.user.role}</span>
                </p>
              </div>
              <button
                onclick={() => auth.signOut()}
                class="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Sign out
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
{/if}
