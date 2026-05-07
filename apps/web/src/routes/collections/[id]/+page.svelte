<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  // Collections were renamed to Projects; redirect old URLs preserving id
  onMount(() => {
    goto(`/projects/${$page.params.id}`, { replaceState: true });
  });
</script>
