import {
  createRendererSession,
  resolveRendererPlan
} from "../renderers/factory.js";
import {
  createOverlay,
  describeElement,
  removeOverlay
} from "./overlay.js";
import { createPlaybackController } from "./playback.js";

class AttachedSubtitleSession {
  constructor(options) {
    this.api = options.api;
    this.video = options.video;
    this.content = options.content;
    this.fontConfig = options.fontConfig;
    this.subtitleStats = options.subtitleStats;
    this.subtitleAdjustments = options.subtitleAdjustments;
    this.getDelay = options.getDelay;
    this.getSubtitleRenderTime = options.getSubtitleRenderTime;
    this.onRuntimeError = options.onRuntimeError;
    this.onVideoSourceChange = options.onVideoSourceChange;
    this.onVideoEmptied = options.onVideoEmptied;
    this.trace = options.trace;
    this.rendererPlan = resolveRendererPlan({
      api: this.api,
      video: this.video,
      content: this.content,
      fontConfig: this.fontConfig,
      subtitleStats: this.subtitleStats,
      subtitleAdjustments: this.subtitleAdjustments,
      getDelay: this.getDelay,
      getTime: () => this.video ? this.getSubtitleRenderTime(this.video) : 0,
      trace: this.trace
    });
    this.backend = this.rendererPlan.backend;
    this.ready = false;
    this.attached = false;
    this.disposed = false;
    this.runtimeError = null;
    this.cleanup = [];
    this.resizeObserver = null;
    this.resizeFrame = 0;
    this.overlay = null;
    this.playback = null;
    this.renderer = null;
    this.disposePromise = null;
    this.videoSource = getVideoSource(this.video);
  }

  async attach() {
    if (this.disposed) {
      return createSupersededResult();
    }

    try {
      this.overlay = createOverlay(this.video, this.trace);
      this.overlay.hostLabel = describeElement(this.overlay.host);
      this.playback = createPlaybackController({
        getSubtitleRenderTime: this.getSubtitleRenderTime,
        state: this,
        trace: this.trace
      });
      this.playback.updateOverlayBounds(true);

      this.renderer = createRendererSession({
        api: this.api,
        video: this.video,
        overlay: this.overlay,
        content: this.content,
        fontConfig: this.fontConfig,
        rendererPlan: this.rendererPlan,
        subtitleStats: this.subtitleStats,
        subtitleAdjustments: this.subtitleAdjustments,
        getDelay: this.getDelay,
        getTime: () => this.video ? this.getSubtitleRenderTime(this.video) : 0,
        onRuntimeError: (error) => this.handleRuntimeError(error),
        trace: this.trace
      });

      this.playback.bindVideo(this.video);
      const result = await this.renderer.attach();
      if (this.disposed) {
        await this.dispose();
        return createSupersededResult();
      }

      if (this.runtimeError) {
        return this.finishAttachRuntimeError();
      }

      if (!result.ready) {
        await this.dispose();
        return result;
      }

      this.watchVideoSource();
      this.playback.syncPlaybackState();
      this.playback.updateOverlayBounds(true);
      if (this.runtimeError) {
        return this.finishAttachRuntimeError();
      }
      this.ready = true;
      this.attached = true;
      return result;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  dispose() {
    if (this.disposePromise) {
      return this.disposePromise;
    }
    this.disposed = true;
    this.ready = false;
    this.attached = false;

    const renderer = this.renderer;
    const playback = this.playback;
    const overlay = this.overlay;
    this.renderer = null;
    this.playback = null;

    if (playback) {
      playback.stop();
    }
    this.cleanup.splice(0).forEach((cleanup) => cleanup());
    if (overlay && overlay.root) {
      overlay.root.style.setProperty("visibility", "hidden", "important");
    }

    const finishCleanup = () => {
      removeOverlay(overlay, this.trace);
      this.video = null;
      this.overlay = null;
    };

    let rendererDisposal = null;
    if (renderer) {
      try {
        this.trace("renderer:dispose", {
          backend: this.backend
        });
        rendererDisposal = renderer.dispose();
      } catch (error) {
        /* Cleanup errors do not expose page or file data. */
      }
    }

    if (rendererDisposal && typeof rendererDisposal.then === "function") {
      this.disposePromise = Promise.resolve(rendererDisposal)
        .catch((error) => {
          /* Cleanup errors do not expose page or file data. */
        })
        .then(finishCleanup);
    } else {
      finishCleanup();
      this.disposePromise = Promise.resolve();
    }
    return this.disposePromise;
  }

  getStats() {
    return this.renderer && typeof this.renderer.getStats === "function"
      ? this.renderer.getStats()
      : null;
  }

  get hasRenderer() {
    return Boolean(this.renderer && this.renderer.hasRenderer !== false);
  }

  get assetTrace() {
    return this.renderer ? this.renderer.assetTrace : null;
  }

  get overlayConnected() {
    return Boolean(this.overlay && this.overlay.root && this.overlay.root.isConnected);
  }

  get overlaySize() {
    return this.overlay
      ? `${Math.round(this.overlay.width)}x${Math.round(this.overlay.height)}`
      : null;
  }

  isConnected() {
    return Boolean(this.video && this.video.isConnected && this.overlayConnected);
  }

  scheduleLayout() {
    if (this.playback) {
      this.playback.scheduleOverlayUpdate();
    }
  }

  syncPlayback(force) {
    if (this.playback) {
      this.playback.syncPlaybackState(force);
    }
  }

  checkVideoSource() {
    const source = getVideoSource(this.video);
    if (!source) {
      return false;
    }
    if (!this.videoSource) {
      this.videoSource = source;
      return false;
    }
    if (source === this.videoSource) {
      return false;
    }

    const previousSource = this.videoSource;
    this.videoSource = source;
    if (typeof this.onVideoSourceChange === "function") {
      this.onVideoSourceChange(previousSource, source);
    }
    return true;
  }

  watchVideoSource() {
    const checkVideoSource = () => this.checkVideoSource();
    const handleVideoEmptied = () => {
      if (typeof this.onVideoEmptied === "function") {
        this.onVideoEmptied();
      }
    };
    this.video.addEventListener("loadedmetadata", checkVideoSource);
    this.video.addEventListener("emptied", handleVideoEmptied);
    this.cleanup.push(() => {
      this.video.removeEventListener("loadedmetadata", checkVideoSource);
      this.video.removeEventListener("emptied", handleVideoEmptied);
    });
  }

  handleRuntimeError(error) {
    if (this.disposed || this.runtimeError) {
      return;
    }

    this.runtimeError = error || new Error("Unknown renderer runtime error");
    this.ready = false;
    if (this.playback) {
      this.playback.stop();
    }
    if (this.attached && typeof this.onRuntimeError === "function") {
      this.onRuntimeError(this.runtimeError);
    }
  }

  async finishAttachRuntimeError() {
    const error = this.runtimeError;
    await this.dispose();
    return {
      ready: false,
      error,
      event: "renderer:runtime-error",
      level: "error"
    };
  }
}

function getVideoSource(video) {
  if (!video) {
    return null;
  }
  return video.srcObject || video.currentSrc || video.src || null;
}

function createSupersededResult() {
  return {
    ready: false,
    error: "Renderer attach was superseded."
  };
}

export { AttachedSubtitleSession };
