import { DomAssRenderer } from "./dom/renderer.js";
import { validateSubtitleContent } from "../core/validate-track.js";
function resolveRendererPlan(options) {
  const track = validateSubtitleContent(options.content);
  if (!track.supported) throw new Error(`Unsupported ASS file: ${track.reason}.`);
  return {backend: "dom", track};
}
function createRendererSession(options) {
  const plan = options.rendererPlan || resolveRendererPlan(options);
  return new DomRendererSession({...options, track: plan.track});
}
class RendererSessionBase {
  constructor(options) {
    this.backend = options.backend;
    this.assetTrace = options.assetTrace || null;
    this.onRuntimeError = options.onRuntimeError;
    this.hasRenderer = false;
    this.failed = false;
    this.overlay = options.overlay || null;
    this.renderer = null;
  }

  dispose() {
    const renderer = this.renderer;
    this.renderer = null;
    this.hasRenderer = false;
    return renderer ? renderer.dispose() : undefined;
  }

  callRenderer(method, args) {
    if (this.failed || !this.renderer || typeof this.renderer[method] !== "function") {
      return;
    }

    try {
      this.renderer[method](...args);
    } catch (error) {
      this.reportRuntimeError(error);
    }
  }

  reportRuntimeError(error) {
    if (this.failed) {
      return;
    }
    this.failed = true;
    if (typeof this.onRuntimeError === "function") {
      this.onRuntimeError(error);
    }
  }

  setRate(rate) {
    this.callRenderer("setRate", [rate]);
  }

  setCurrentTime(time, force) {
    this.callRenderer("setCurrentTime", [time, force]);
  }

  setIsPaused(paused, time) {
    this.callRenderer("setIsPaused", [paused, time]);
  }

  getStats() {
    return null;
  }
}

class DomRendererSession extends RendererSessionBase {
  constructor(options) {
    super({
      backend: "dom",
      overlay: options.overlay,
      onRuntimeError: options.onRuntimeError
    });
    this.track = options.track;
    this.subtitleAdjustments = options.subtitleAdjustments;
    this.fontConfig = options.fontConfig;
    this.getTime = options.getTime;
    this.trace = options.trace;
  }

  attach() {
    this.overlay.root.dataset.renderer = this.backend;
    this.renderer = new DomAssRenderer({
      layer: this.overlay.domLayer,
      track: this.track,
      adjustments: this.subtitleAdjustments,
      fontConfig: this.fontConfig,
      getTime: this.getTime,
      trace: this.trace,
      onError: (error) => this.reportRuntimeError(error)
    });
    this.hasRenderer = true;
    return Promise.resolve({
      ready: true,
      event: "dom-renderer:ready",
      details: {
        events: this.track.events.length,
        playRes: `${this.track.playResX}x${this.track.playResY}`,
        reason: this.track.reason
      }
    });
  }

  resize(size) {
    this.callRenderer("resize", [size.cssWidth, size.cssHeight]);
  }

  getStats() {
    return this.renderer ? this.renderer.getStats() : null;
  }
}


export {createRendererSession, resolveRendererPlan};
