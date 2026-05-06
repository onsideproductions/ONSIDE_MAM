<script>
  let { body, mentions = [] } = $props();

  // Render the body with @mentions highlighted. We match @token strings and check
  // if any user name/email starts with that token (case-insensitive).
  let parts = $derived(splitWithMentions(body, mentions));

  function splitWithMentions(text, mentions) {
    const result = [];
    const regex = /@([a-zA-Z][\w.\-]{1,40})/g;
    let lastIndex = 0;
    let m;
    const mentionLookup = new Set(
      mentions
        .map((u) => (u.name || '').toLowerCase().split(' ')[0])
        .filter(Boolean)
    );

    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        result.push({ kind: 'text', value: text.slice(lastIndex, m.index) });
      }
      const token = m[1];
      const isMention = mentionLookup.has(token.toLowerCase());
      result.push({ kind: isMention ? 'mention' : 'text', value: '@' + token });
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) {
      result.push({ kind: 'text', value: text.slice(lastIndex) });
    }
    return result;
  }
</script>

<span class="whitespace-pre-wrap break-words">
  {#each parts as p}
    {#if p.kind === 'mention'}
      <span class="text-blue-400 font-medium">{p.value}</span>
    {:else}
      {p.value}
    {/if}
  {/each}
</span>
