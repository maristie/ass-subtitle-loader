import { removeOverlay } from "./overlay.js";
import { getVideoDisplayRect } from "./video-target.js";

function createPlaybackController(options) {
  const {
    getSubtitleRenderTime,
    state,
    trace
  } = options;
  let waiting = false;

  function bindVideo(video) {
    const add = (target, type, listener, listenerOptions) => {
      target.addEventListener(type, listener, listenerOptions);
      state.cleanup.push(() => target.removeEventListener(type, listener, listenerOptions));
    };

    const sync = () => syncPlaybackState();
    const markWaiting = () => {
      waiting = true;
      syncPlaybackState();
    };
    const markPlaying = () => {
      waiting = false;
      syncPlaybackState();
    };
    const finishSeek = () => {
      waiting = false;
      syncPlaybackState(true);
    };
    const resizeAndSync = () => {
      updateOverlayBounds(true);
      syncPlaybackState();
    };
    const resyncVisibleTab = () => {
      if (document.visibilityState === "visible") {
        // CSS animations and media playback can be throttled on different
        // clocks in a background tab. Rebuild at the current media time so a
        // stale animation is not removed before it reaches its authored end.
        syncPlaybackState(true);
      }
    };

    add(video, "timeupdate", sync);
    add(video, "playing", markPlaying);
    add(video, "play", sync);
    add(video, "pause", sync);
    add(video, "waiting", markWaiting);
    add(video, "seeking", sync);
    add(video, "seeked", finishSeek);
    add(video, "ended", sync);
    add(video, "ratechange", sync);
    add(video, "loadedmetadata", resizeAndSync);
    add(video, "resize", resizeAndSync);
    add(window, "resize", scheduleOverlayUpdate);
    add(document, "visibilitychange", resyncVisibleTab);
    add(document, "fullscreenchange", scheduleOverlayUpdate);
    add(document, "webkitfullscreenchange", scheduleOverlayUpdate);

    if (typeof ResizeObserver !== "undefined") {
      state.resizeObserver = new ResizeObserver(scheduleOverlayUpdate);
      state.resizeObserver.observe(video);
      if (state.overlay && state.overlay.host) {
        state.resizeObserver.observe(state.overlay.host);
      }
      state.cleanup.push(() => {
        if (state.resizeObserver) {
          state.resizeObserver.disconnect();
          state.resizeObserver = null;
        }
      });
    }
  }

  function syncPlaybackState(force) {
    if (!state.video || !state.renderer) {
      return;
    }

    const renderer = state.renderer;
    const subtitleTime = getSubtitleRenderTime(state.video);
    const paused = state.video.paused || state.video.ended || state.video.seeking || waiting ||
      state.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    const rate = state.video.playbackRate || 1;
    renderer.setRate(rate);
    renderer.setCurrentTime(subtitleTime, Boolean(force));
    renderer.setIsPaused(paused, subtitleTime);
  }

  function scheduleOverlayUpdate() {
    if (state.resizeFrame) {
      return;
    }

    state.resizeFrame = requestAnimationFrame(() => {
      state.resizeFrame = 0;
      updateOverlayBounds(false);
    });
  }

  function updateOverlayBounds(force) {
    if (!state.video || !state.overlay || !state.overlay.root.isConnected) {
      return;
    }

    const overlay = state.overlay;
    const hostRect = overlay.host.getBoundingClientRect();
    const videoRect = getVideoDisplayRect(state.video, overlay.host) || state.video.getBoundingClientRect();
    const left = videoRect.left - hostRect.left;
    const top = videoRect.top - hostRect.top;
    const width = Math.max(1, videoRect.width);
    const height = Math.max(1, videoRect.height);

    overlay.root.style.setProperty("left", `${left}px`, "important");
    overlay.root.style.setProperty("top", `${top}px`, "important");
    overlay.root.style.setProperty("width", `${width}px`, "important");
    overlay.root.style.setProperty("height", `${height}px`, "important");

    if (
      force ||
        overlay.width !== width ||
        overlay.height !== height
    ) {
      overlay.width = width;
      overlay.height = height;
      trace("overlay:resize", {
        css: `${Math.round(width)}x${Math.round(height)}`,
        force
      });

      if (state.renderer) {
        const renderer = state.renderer;
        renderer.resize({
          cssWidth: width,
          cssHeight: height
        });
        renderer.setCurrentTime(getSubtitleRenderTime(state.video));
      }
    }
  }

  function stop() {
    if (state.resizeFrame) {
      cancelAnimationFrame(state.resizeFrame);
      state.resizeFrame = 0;
    }

    while (state.cleanup.length) {
      const cleanup = state.cleanup.pop();
      try {
        cleanup();
      } catch (error) {
        /* Cleanup errors do not expose page or file data. */
      }
    }
  }

  function runCleanup() {
    stop();
    if (state.overlay) {
      removeOverlay(state.overlay, trace);
    }
  }

  return {
    bindVideo,
    runCleanup,
    scheduleOverlayUpdate,
    stop,
    syncPlaybackState,
    updateOverlayBounds
  };
}

export { createPlaybackController };
