<script>
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth';

  let { children } = $props();

  let isAdmin = $derived($auth.user?.role === 'admin');

  const sections = [
    {
      heading: 'Personal',
      items: [
        { href: '/settings/profile', label: 'Profile' },
        { href: '/settings/notifications', label: 'Notifications' },
      ],
    },
    {
      heading: 'Account',
      items: [
        { href: '/settings/usage', label: 'Usage' },
        { href: '/settings/branding', label: 'Branding' },
        { href: '/settings/shares', label: 'Shares' },
      ],
    },
    {
      heading: 'Admin',
      items: [
        { href: '/settings/users', label: 'Users', adminOnly: true },
      ],
      adminOnly: true,
    },
    {
      heading: 'Integrations',
      items: [
        { href: '/settings/integrations', label: 'Integrations', tag: 'Coming soon' },
      ],
    },
  ];

  function isActive(href) {
    return $page.url.pathname === href;
  }
</script>

<div class="flex h-full">
  <!-- Sidebar -->
  <aside class="w-60 shrink-0 border-r border-gray-800 bg-gray-900 overflow-y-auto">
    <div class="px-5 py-5 border-b border-gray-800">
      <h1 class="text-base font-semibold">Settings</h1>
    </div>

    <nav class="p-3 space-y-5">
      {#each sections as section}
        {#if !section.adminOnly || isAdmin}
          <div>
            <p class="px-3 mb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {section.heading}
            </p>
            <div class="space-y-0.5">
              {#each section.items as item}
                {#if !item.adminOnly || isAdmin}
                  <a
                    href={item.href}
                    class="flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors
                      {isActive(item.href)
                        ? 'bg-gray-800 text-gray-100 font-medium'
                        : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'}"
                  >
                    <span>{item.label}</span>
                    {#if item.tag}
                      <span class="text-xs text-gray-500">{item.tag}</span>
                    {/if}
                  </a>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </nav>
  </aside>

  <!-- Page content -->
  <div class="flex-1 overflow-y-auto">
    <div class="max-w-3xl mx-auto p-8">
      {@render children()}
    </div>
  </div>
</div>
