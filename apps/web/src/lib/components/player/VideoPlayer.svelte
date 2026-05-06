<script>
  import { onMount, onDestroy } from 'svelte';
  import 'video.js/dist/video-js.css';

  let { src, poster = null, type = null } = $props();

  let videoEl;
  let player = null;

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
      // HLS config: send the auth cookie when fetching m3u8 from our API
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

    // Keyboard shortcuts
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
    if (player) {
      player.dispose();
    }
  });
</script>

<div class="w-full h-full">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoEl}
    class="video-js vjs-big-play-centered vjs-theme-fantasy"
    {poster}
    tabindex="0"
  >
  </video>
</div>

<style>
  :global(.video-js) {
    width: 100%;
    height: 100%;
  }
</style>
