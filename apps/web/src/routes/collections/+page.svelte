<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  // Collections were renamed to Projects; redirect old URLs
  onMount(() => goto('/', { replaceState: true }));
</script>
