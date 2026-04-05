<script>
  import { onMount, onDestroy } from 'svelte';

  let { src, poster = null } = $props();

  let videoEl;
  let player = null;

  onMount(async () => {
    const videojs = (await import('video.js')).default;

    player = videojs(videoEl, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: true,
      responsive: true,
      playbackRates: [0.25, 0.5, 1, 1.5, 2],
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

    // Set source
    if (src.includes('.m3u8')) {
      player.src({ type: 'application/x-mpegURL', src });
    } else {
      player.src({ type: 'video/mp4', src });
    }

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
