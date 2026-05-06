<script>
  import { onMount, onDestroy } from 'svelte';
  import 'video.js/dist/video-js.css';

  let {
    src,
    poster = null,
    type = null,
    /** [{ timecode: number, color?: string, id?: string }] - shown as dots on the progress bar */
    markers = [],
    /** $bindable - parent can read currentTime live */
    currentTime = $bindable(0),
    /** parent gets a callback so it can seek the player */
    onReady = (_player) => {},
  } = $props();

  let videoEl;
  let player = null;
  let progressEl = null;
  let duration = $state(0);
  let timeUpdater = null;

  function detectType(url) {
    if (type) return type;
    if (url.includes('.m3u8') || url.endsWith('/stream.m3u8')) return 'application/x-mpegURL';
    return 'video/mp4';
  }

  onMount(async () => {
    const videojs = (await import('video.js')).default;

    player = videojs(videoEl, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: true,
      responsive: true,
      playbackRates: [0.25, 0.5, 1, 1.5, 2],
      html5: {
        vhs: { withCredentials: true },
      },
      controlBar: {
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'playbackRateMenuButton',
          'fullscreenToggle',
        ],
      },
    });

    player.src({ type: detectType(src), src });

    player.on('loadedmetadata', () => {
      duration = player.duration() || 0;
      // Find the progress bar to overlay markers
      const root = videoEl?.closest('.video-js') ?? videoEl;
      progressEl = root?.querySelector('.vjs-progress-control .vjs-progress-holder');
    });

    timeUpdater = setInterval(() => {
      if (player) currentTime = player.currentTime() || 0;
    }, 250);

    onReady({
      seek: (t) => {
        if (player) {
          player.currentTime(t);
          player.play().catch(() => {});
        }
      },
      pause: () => player?.pause(),
      currentTime: () => player?.currentTime() ?? 0,
    });

    videoEl.addEventListener('keydown', (e) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          player.paused() ? player.play() : player.pause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.currentTime(player.currentTime() - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.currentTime(player.currentTime() + 5);
          break;
        case 'j':
          player.currentTime(player.currentTime() - 10);
          break;
        case 'l':
          player.currentTime(player.currentTime() + 10);
          break;
        case 'f':
          player.isFullscreen() ? player.exitFullscreen() : player.requestFullscreen();
          break;
        case 'm':
          player.muted(!player.muted());
          break;
      }
    });
  });

  onDestroy(() => {
    if (timeUpdater) clearInterval(timeUpdater);
    if (player) player.dispose();
  });
</script>

<div class="w-full h-full relative">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoEl}
    class="video-js vjs-big-play-centered vjs-theme-fantasy"
    {poster}
    tabindex="0"
  >
  </video>

  <!-- Markers overlay attached to the progress bar via fixed positioning relative to player -->
  {#if duration > 0 && markers.length > 0}
    <div class="vjs-marker-layer pointer-events-none">
      {#each markers as m}
        {@const left = Math.min(100, Math.max(0, (m.timecode / duration) * 100))}
        <button
          type="button"
          class="vjs-marker"
          style="left: {left}%; background-color: {m.color || '#1697C5'}"
          aria-label="Comment marker"
          title="{Math.floor(m.timecode / 60)}:{Math.floor(m.timecode % 60).toString().padStart(2, '0')}"
        ></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(.video-js) {
    width: 100%;
    height: 100%;
  }
  .vjs-marker-layer {
    position: absolute;
    /* Sit roughly where the progress bar is. Video.js controlbar height is ~3em, progress is in there */
    bottom: 35px;
    left: 0;
    right: 0;
    height: 14px;
    pointer-events: none;
    z-index: 5;
  }
  .vjs-marker {
    position: absolute;
    top: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    transform: translateX(-50%);
    border: 2px solid rgba(0, 0, 0, 0.6);
    pointer-events: auto;
    cursor: pointer;
  }
  .vjs-marker:hover {
    transform: translateX(-50%) scale(1.2);
  }
</style>
