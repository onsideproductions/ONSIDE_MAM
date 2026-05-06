<script>
  import { api } from '$api/client';

  let {
    value = $bindable(''),
    placeholder = 'Add a comment...',
    rows = 3,
    onSubmit = null, // called when Cmd/Ctrl+Enter is pressed
  } = $props();

  let textarea;
  let suggestions = $state([]);
  let activeQuery = $state(null);
  let activePosition = $state(0);
  let highlighted = $state(0);
  let allUsers = $state([]);
  let usersLoaded = $state(false);

  async function ensureUsers() {
    if (usersLoaded) return;
    try {
      allUsers = await api.get('/users', { silent: true });
    } catch {
      allUsers = [];
    } finally {
      usersLoaded = true;
    }
  }

  function detectMention() {
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const before = value.slice(0, pos);
    const m = /@([a-zA-Z][\w.\-]*)$/.exec(before);
    if (!m) {
      suggestions = [];
      activeQuery = null;
      return;
    }
    activeQuery = m[1];
    activePosition = pos - m[0].length; // start of the @
    const q = m[1].toLowerCase();
    suggestions = allUsers
      .filter(
        (u) =>
          (u.name && u.name.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
      )
      .slice(0, 6);
    highlighted = 0;
  }

  function pickSuggestion(u) {
    if (!textarea || activeQuery === null) return;
    const before = value.slice(0, activePosition);
    const after = value.slice(textarea.selectionStart);
    const token = (u.name || '').split(' ')[0]; // use first name
    const insert = '@' + token + ' ';
    value = before + insert + after;
    suggestions = [];
    activeQuery = null;
    // restore caret position after the inserted token
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = (before + insert).length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  function onKey(e) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlighted = (highlighted + 1) % suggestions.length;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlighted = (highlighted - 1 + suggestions.length) % suggestions.length;
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickSuggestion(suggestions[highlighted]);
        return;
      }
      if (e.key === 'Escape') {
        suggestions = [];
        activeQuery = null;
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      onSubmit?.();
    }
  }

  function onInput() {
    ensureUsers().then(detectMention);
  }
</script>

<div class="relative">
  <textarea
    bind:this={textarea}
    bind:value
    {rows}
    {placeholder}
    onkeydown={onKey}
    oninput={onInput}
    onfocus={ensureUsers}
    class="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
  ></textarea>

  {#if suggestions.length > 0}
    <div class="absolute z-10 left-0 mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
      {#each suggestions as u, i}
        <button
          type="button"
          onmousedown={(e) => { e.preventDefault(); pickSuggestion(u); }}
          class="w-full text-left px-3 py-2 text-sm flex items-center gap-2
            {i === highlighted ? 'bg-gray-800' : 'hover:bg-gray-800/60'}"
        >
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
            {(u.name || '?')[0]?.toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">{u.name}</p>
            <p class="text-xs text-gray-500 truncate">{u.email}</p>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>
