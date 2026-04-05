<script>
  import '../app.css';

  let { children } = $props();
</script>

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
        <a href="/upload" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
          Upload
        </a>
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

      <!-- Upload button -->
      <a
        href="/upload"
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        Upload
      </a>
    </div>
  </header>

  <!-- Main content -->
  <main class="flex-1 overflow-auto">
    {@render children()}
  </main>
</div>
