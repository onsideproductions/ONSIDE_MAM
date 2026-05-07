<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  // Old asset list page is gone - send users to global search instead
  onMount(() => {
    const q = $page.url.searchParams.get('q');
    goto(q ? `/search?q=${encodeURIComponent(q)}` : '/search', { replaceState: true });
  });
</script>
