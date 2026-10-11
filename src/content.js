import { validateSubtitleContent } from "./core/validate-track.js";
import {
  CONTENT,
  isContentMessageType
} from "./shared/messages.js";
import {
  createDefaultSubtitleAdjustments,
  describeSubtitleAdjustments,
  formatSignedSeconds,
  formatSubtitleAdjustments,
  normalizeSubtitleAdjustments,
  normalizeSubtitleDelay
} from "./shared/settings.js";
import {
  createRuntimeLogger,
  describeError
} from "./shared/diagnostics.js";
import { getSubtitleStats } from "./core/ass-parser.js";
import {
  createRendererFontConfig,
  describeFontConfig
} from "./core/font-resolver.js";
import { ensurePageStyle } from "./content/page-style.js";
import {
  describeVideo,
  findBestVideo as findBestVideoElement
} from "./content/video-target.js";
import {
  createStatusSnapshot,
  roundTime
} from "./content/status.js";
import {
  createDefaultsController,
  createStoredDefaultsStatus
} from "./content/defaults.js";
import { AttachedSubtitleSession } from "./content/attached-session.js";
import {
  canRendererRecoveryClearContentError,
  clearContentError,
  clearContentErrorIfCurrent,
  getContentErrorRevision,
  setContentError
} from "./content/error-state.js";
import { createSubtitleLoadCoordinator } from "./content/load-coordinator.js";
import { handleActiveRendererRuntimeError } from "./content/renderer-error.js";
import {
  cancelPendingPickerLoad,
  removeSubtitlePicker as removePicker,
  showSubtitlePicker as showPicker
} from "./content/picker.js";

  const api = globalThis.browser;
  const previousLoader = globalThis.__assSubtitleLoader;
  let previousLoaderCleanup = Promise.resolve();
  const LOADER_VERSION = api && api.runtime && typeof api.runtime.getManifest === "function"
    ? api.runtime.getManifest().version
        : "0.2.0";
  const logPrefix = "[ASS Subtitle Loader]";

  // If injection runs, replace the page controller. The popup only injects
  // after ping fails or the version is stale, including after extension reloads.
  if (previousLoader && typeof previousLoader.dispose === "function") {
    try {
      previousLoaderCleanup = Promise.resolve(previousLoader.dispose("upgrade")).catch((error) => {
        /* Cleanup errors do not expose page or file data. */
      });
    } catch (error) {
      /* Cleanup errors do not expose page or file data. */
    }
  }

  const initialFontConfig = createRendererFontConfig(api, "");
  const state = {
    session: null,
    diagnosticsEnabled: false,
    privateContext: Boolean(api.extension?.inIncognitoContext),
    picker: null,
    subtitleContent: null,
    subtitleName: null,
    subtitleStats: null,
    fontConfig: initialFontConfig,
    fontInfo: describeFontConfig(initialFontConfig),
    subtitleDelay: 0,
    subtitleAdjustments: createDefaultSubtitleAdjustments(),
    observer: null,
    attachment: createAttachmentState("idle"),
    settingsDefaults: createStoredDefaultsStatus(api, null, null, "builtin", null),
    styleElement: null,
    lastError: null,
    lastErrorSource: null,
    lastErrorRevision: 0,
    disposed: false
  };
  const trace = createRuntimeLogger({
    api,
    source: "content",
    prefix: logPrefix,
    enabled: () => state.diagnosticsEnabled,
    privateContext: () => state.privateContext
  });
  const defaultsController = createDefaultsController({
    api,
    getStatus,
    state,
    trace
  });
  let pendingSessionDisposal = previousLoaderCleanup;
  const subtitleLoadCoordinator = createSubtitleLoadCoordinator();
  const storedDefaultsReady = defaultsController.loadStoredDefaults();

  globalThis.__assSubtitleLoader = {
    version: LOADER_VERSION,
    dispose
  };

  const onRuntimeMessage = (message) => {
    if (!message || !isContentMessageType(message.type)) {
      return undefined;
    }

    trace("message:received", {
      type: message.type,
      name: message.name || null,
      contentLength: typeof message.content === "string" ? message.content.length : null
    });

    return Promise.resolve(handleMessage(message)).catch((error) => {
      const errorInfo = describeError(error);
      const messageText = errorInfo.message;
      setContentError(state, messageText, `message:${message.type}`);
      trace("message:error", {
        type: message.type,
        error: messageText,
        details: errorInfo
      }, "error");
      return {
        ok: false,
        error: messageText,
        status: getStatus()
      };
    });
  };

  api.runtime.onMessage.addListener(onRuntimeMessage);
  trace("content:init", {
    url: location.href,
    version: LOADER_VERSION
  });

  async function handleMessage(message) {
    await storedDefaultsReady;

    switch (message.type) {
      case CONTENT.PING:
        return {
          ok: true,
          status: getStatus()
        };
      case CONTENT.SHOW_PICKER:
        showSubtitlePicker();
        return {
          ok: true,
          status: getStatus(),
          message: "Choose an ASS file on the page."
        };
      case CONTENT.LOAD:
        return loadSubtitle(message);
      case CONTENT.REMOVE:
        removeSubtitle();
        return {
          ok: true,
          status: getStatus(),
          message: "Removed subtitle track."
        };
      case CONTENT.SET_DELAY:
        return setSubtitleDelay(message.delay);
      case CONTENT.SET_DIAGNOSTICS:
        state.diagnosticsEnabled = !state.privateContext && message.enabled === true;
        return {ok: true, status: getStatus()};
      case CONTENT.SET_ADJUSTMENTS:
        return setSubtitleAdjustments(message.adjustments || message);
      case CONTENT.SAVE_SITE_DEFAULTS:
        return defaultsController.saveSiteDefaults(message.defaults);
      case CONTENT.RESET_SITE_DEFAULTS:
        return defaultsController.resetSiteDefaults();
      case CONTENT.SAVE_GLOBAL_DEFAULTS:
        return defaultsController.saveGlobalDefaults(message.defaults);
      case CONTENT.RESET_GLOBAL_DEFAULTS:
        return defaultsController.resetGlobalDefaults();
      default:
        return {
          ok: false,
          error: "Unknown ASS Subtitle Loader message.",
          status: getStatus()
        };
    }
  }

  async function loadSubtitle(message) {
    trace("load:start", {
      name: message.name || null,
      contentLength: typeof message.content === "string" ? message.content.length : 0,
      subtitleDelay: state.subtitleDelay
    });

    const loadRevision = Number.isInteger(message.loadRevision)
      ? message.loadRevision
      : subtitleLoadCoordinator.begin();
    if (!subtitleLoadCoordinator.isCurrent(loadRevision)) {
      return createSupersededLoadResponse();
    }

    try {
      const content = String(message.content || "");
      if (!content.trim()) {
        throw new Error("The selected subtitle file is empty.");
      }

      validateSubtitleContent(content);

      if (!subtitleLoadCoordinator.start(loadRevision)) {
        return createSupersededLoadResponse();
      }

      try {
        state.subtitleContent = content;
        state.subtitleName = message.name || "Selected subtitle";
        state.subtitleStats = getSubtitleStats(content, message);
        state.fontConfig = createRendererFontConfig(api, content);
        state.fontInfo = describeFontConfig(state.fontConfig);
        clearContentError(state);
        ensurePageStyle(state);

        const video = findBestVideo();
        if (!video) {
          trace("video:not-found", {});
          state.attachment = createAttachmentState("waiting-for-video");
          disposeSession();
          observeForVideos();
          return {
            ok: false,
            pending: true,
            error: "No usable video element was found on this page yet.",
            status: getStatus()
          };
        }

        const result = await attachToVideo(video, content);
        if (!subtitleLoadCoordinator.isCurrent(loadRevision)) {
          return createSupersededLoadResponse();
        }
        observeForVideos();
        trace("load:complete", {
          ready: result.ready,
          pending: Boolean(result.pending),
          error: result.error || null
        });

        return {
          ok: result.ready,
          pending: Boolean(result.pending),
          error: result.error || null,
          status: getStatus(),
          message: result.ready
            ? `Loaded ${state.subtitleName}.`
            : (result.pending ? `${state.subtitleName} loaded. Waiting for a video element.` : result.error)
        };
      } finally {
        subtitleLoadCoordinator.complete(loadRevision);
      }
    } catch (error) {
      if (!subtitleLoadCoordinator.isCurrent(loadRevision)) {
        return createSupersededLoadResponse();
      }
      return {ok: false, error: describeError(error).message, status: getStatus()};
    }
  }

  async function attachToVideo(video, content) {
    const attempt = createAttachmentState("attaching", video);
    attempt.errorRevision = getContentErrorRevision(state);
    state.attachment = attempt;
    await disposeSession();
    if (state.attachment !== attempt || state.disposed) {
      return attempt.recovery || createSupersededAttachResult();
    }

    let session = null;
    try {
      session = new AttachedSubtitleSession({
        api,
        video,
        content,
        fontConfig: state.fontConfig,
        subtitleStats: state.subtitleStats,
        subtitleAdjustments: state.subtitleAdjustments,
        getDelay: () => state.subtitleDelay,
        getSubtitleRenderTime,
        onVideoSourceChange: (previousSource, source) => {
          handleVideoSourceChange(session, video, previousSource, source);
        },
        onVideoEmptied: () => {
          handleVideoEmptied(session, video);
        },
        onRuntimeError: (error) => handleRendererRuntimeError(session, error),
        trace
      });
      if (state.attachment !== attempt || state.disposed) {
        await trackSessionDisposal(session);
        return attempt.recovery || createSupersededAttachResult();
      }

      state.session = session;
      const attachPromise = session.attach();
      trace("attach:start", {
        video: describeVideo(video),
        currentTime: video.currentTime || 0,
        subtitleTime: getSubtitleRenderTime(video),
        subtitleDelay: state.subtitleDelay,
        adjustments: describeSubtitleAdjustments(state.subtitleAdjustments),
        paused: video.paused,
        readyState: video.readyState,
        overlayHost: session.overlay ? session.overlay.hostLabel : null,
        overlaySize: session.overlaySize,
        backend: session.backend,
        assets: session.assetTrace
      });

      const result = await attachPromise;
      return finishRendererAttach(attempt, session, video, result);
    } catch (error) {
      return finishRendererAttach(attempt, session, video, {
        ready: false,
        error,
        event: "renderer:constructor-error",
        level: "error"
      });
    }
  }

  function finishRendererAttach(attempt, session, video, result) {
    // Attaches can overlap when the user reloads subtitles, changes profile, or
    // the extension reinjects. Only the current session may bind video events or
    // mark the renderer ready; stale async completions must be disposed.
    if (state.attachment !== attempt || state.session !== session || state.disposed) {
      if (session) {
        trackSessionDisposal(session);
      }
      trace("renderer:stale", {
        backend: session ? session.backend : "none",
        currentBackend: state.session ? state.session.backend : "none"
      }, "warn");
      if (attempt.recovery) {
        return attempt.recovery;
      }
      if (
        !state.disposed &&
          state.attachment.phase === "failed" &&
          state.attachment.video === video &&
          state.attachment.error
      ) {
        return {
          ready: false,
          error: state.attachment.error
        };
      }
      if (!state.disposed && state.subtitleContent && state.attachment.phase === "waiting-for-video") {
        return createPendingAttachResult();
      }
      return createSupersededAttachResult();
    }

    if (result.ready && session.isConnected()) {
      state.attachment = createAttachmentState("attached", video);
      const clearsCurrentError = canRendererRecoveryClearContentError(state, attempt.errorRevision);
      if (clearsCurrentError) {
        clearContentError(state);
      }
      if (
        clearsCurrentError &&
        state.picker &&
          state.picker.status &&
          state.picker.status.dataset.state === "error" &&
          String(state.picker.status.dataset.errorSource || "").startsWith("renderer")
      ) {
        state.picker.status.textContent = `Loaded ${state.subtitleName}.`;
        state.picker.status.dataset.state = "normal";
        delete state.picker.status.dataset.errorSource;
      }
      trace(result.event || getRendererReadyEvent(session), {
        ...getRendererReadyTraceDetails(session),
        ...(result.details || {})
      });
      trace(`attach:${session.backend}-renderer-created`, {});
      return {
        ready: true
      };
    }

    const videoWasReplaced = result.ready && !session.isConnected();
    if (videoWasReplaced) {
      clearSubtitleForVideoChange("video-replaced-during-attach", {
        backend: session.backend,
        overlaySize: session.overlaySize
      });
      return createSupersededAttachResult();
    }

    const errorInfo = describeError(result.error);
    const message = errorInfo.message;
    setContentError(state, message, "renderer-attach");
    state.session = null;
    state.attachment = createAttachmentState("failed", video, message);
    trace(result.event || "renderer:error", {
      error: message,
      details: result.details || errorInfo,
      overlaySize: session ? session.overlaySize : null
    }, result.level || "error");
    if (session) {
      trackSessionDisposal(session);
    }
    return {
      ready: false,
      error: message
    };
  }

  function getRendererReadyEvent(session) {
    if (session.backend === "dom") {
      return "dom-renderer:ready";
    }

    return "renderer:ready";
  }

  function getRendererReadyTraceDetails(session) {
    return {
      currentTime: session.video ? session.video.currentTime || 0 : null,
      subtitleTime: session.video ? getSubtitleRenderTime(session.video) : null,
      subtitleDelay: state.subtitleDelay,
      overlaySize: session.overlay ? `${Math.round(session.overlay.width)}x${Math.round(session.overlay.height)}` : null
    };
  }

  function removeSubtitle(reason = "manual") {
    trace("remove:start", {
      hadRenderer: Boolean(state.session),
      subtitleName: state.subtitleName,
      reason
    });
    state.subtitleContent = null;
    state.subtitleName = null;
    state.subtitleStats = null;
    state.fontConfig = createRendererFontConfig(api, "");
    state.fontInfo = describeFontConfig(state.fontConfig);
    clearContentError(state);
    cancelPendingPickerLoad(state);
    subtitleLoadCoordinator.cancel();
    if (state.picker && state.picker.status) {
      state.picker.status.textContent = "No subtitle file loaded.";
      state.picker.status.dataset.state = "normal";
      delete state.picker.status.dataset.errorSource;
    }
    state.attachment = createAttachmentState("idle");
    const disposal = disposeSession();
    disconnectObserver();
    return disposal;
  }

  function showSubtitlePicker() {
    showPicker({
      state,
      findBestVideo,
      trace,
      loadSubtitle,
      beginSubtitleLoad: () => subtitleLoadCoordinator.begin(),
      cancelSubtitleLoad: (revision) => subtitleLoadCoordinator.cancel(revision)
    });
  }

  function removeSubtitlePicker() {
    removePicker(state, trace);
  }

  function setSubtitleDelay(value) {
    const errorRevision = getContentErrorRevision(state);
    const delay = normalizeSubtitleDelay(value);
    state.subtitleDelay = delay;
    if (state.session) {
      // Delay changes select a different absolute subtitle timestamp. Force the
      // renderer to reconstruct that frame so no active cue or animation phase
      // from the previous timestamp can survive the change.
      state.session.syncPlayback(true);
    }
    clearRecoveredSettingError(CONTENT.SET_DELAY, errorRevision);
    trace("delay:set", {
      delay,
      videoTime: state.session && state.session.video ? roundTime(state.session.video.currentTime || 0) : null,
      subtitleTime: state.session && state.session.video ? roundTime(getSubtitleRenderTime(state.session.video)) : null
    });
    return {
      ok: true,
      status: getStatus(),
      message: `Subtitle delay ${formatSignedSeconds(delay)}.`
    };
  }

  async function setSubtitleAdjustments(value) {
    const errorRevision = getContentErrorRevision(state);
    const adjustments = normalizeSubtitleAdjustments(value);
    state.subtitleAdjustments = adjustments;

    const result = await reattachSubtitleIfLoaded();
    clearRecoveredSettingError(CONTENT.SET_ADJUSTMENTS, errorRevision, result);

    trace("adjustments:set", describeSubtitleAdjustments(adjustments));
    return createSettingResponse(result, `Adjustments ${formatSubtitleAdjustments(adjustments, {
      includeLaneGap: Boolean(state.session && state.session.backend === "dom")
    })}.`);
  }

  function clearRecoveredSettingError(messageType, errorRevision, result = null) {
    if (result && !result.ready) {
      return false;
    }

    return clearContentErrorIfCurrent(
      state,
      errorRevision,
      `message:${messageType}`
    );
  }

  async function reattachSubtitleIfLoaded() {
    if (!state.subtitleContent) {
      return null;
    }

    const pendingAttempt = state.attachment && state.attachment.phase === "attaching"
      ? state.attachment
      : null;
    const video = state.session && state.session.video && state.session.video.isConnected
      ? state.session.video
      : findBestVideo();
    const reattachment = video ? attachToVideo(video, state.subtitleContent) : null;
    if (pendingAttempt && reattachment) {
      pendingAttempt.recovery = reattachment;
    }
    return reattachment;
  }

  function createSettingResponse(result, successMessage) {
    const ok = !result || result.ready;
    const error = result && result.error ? result.error : null;
    return {
      ok,
      error,
      status: getStatus(),
      message: ok ? successMessage : error
    };
  }

  function dispose(reason) {
    if (state.disposed) {
      return;
    }

    trace("content:dispose", {
      reason: reason || "manual"
    });
    state.disposed = true;
    removeSubtitlePicker();
    const cleanup = removeSubtitle();
    if (state.styleElement && state.styleElement.isConnected) {
      state.styleElement.remove();
    }
    try {
      api.runtime.onMessage.removeListener(onRuntimeMessage);
    } catch (_error) {
      // The runtime can already be gone during extension reload.
    }

    if (globalThis.__assSubtitleLoader && globalThis.__assSubtitleLoader.version === LOADER_VERSION) {
      globalThis.__assSubtitleLoader = null;
    }
    return cleanup;
  }

  function disposeSession() {
    const session = state.session;
    state.session = null;
    return trackSessionDisposal(session);
  }

  function createSupersededLoadResponse() {
    return {
      ok: false,
      superseded: true,
      error: "Subtitle load was superseded.",
      status: getStatus()
    };
  }

  function trackSessionDisposal(session) {
    if (!session) {
      return pendingSessionDisposal;
    }

    let sessionDisposal;
    try {
      sessionDisposal = Promise.resolve(session.dispose());
    } catch (error) {
      sessionDisposal = Promise.reject(error);
    }
    pendingSessionDisposal = Promise.all([
      pendingSessionDisposal,
      sessionDisposal
    ]).catch((error) => {
      /* Cleanup errors do not expose page or file data. */
    });
    return pendingSessionDisposal;
  }

  function handleRendererRuntimeError(session, error) {
    handleActiveRendererRuntimeError({
      state,
      session,
      error,
      trace,
      disposeSession: trackSessionDisposal
    });
  }

  function getStatus() {
    return createStatusSnapshot({
      state,
      version: globalThis.__assSubtitleLoader.version,
    });
  }

  function observeForVideos() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver(handleObservedVideoMutation);

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"]
    });
  }

  function handleObservedVideoMutation(records) {
    if (!state.subtitleContent || state.disposed) {
      return;
    }

    const attachment = state.attachment || createAttachmentState("idle");
    const session = state.session;
    if (attachment.phase === "attached" && session) {
      if (!session.isConnected()) {
        clearSubtitleForVideoChange("video-replaced", {
          backend: session.backend
        });
        return;
      }
      if (hasActiveVideoSourceMutation(records, session.video)) {
        session.checkVideoSource();
      }
      session.scheduleLayout();
      return;
    }

    const video = findBestVideo();
    if (attachment.phase === "attaching") {
      if (attachment.video && attachment.video.isConnected) {
        return;
      }
      if (video && video !== attachment.video) {
        attachment.recovery = attachToObservedVideo(video);
      } else {
        state.attachment = createAttachmentState("waiting-for-video");
        disposeSession();
      }
      return;
    }

    if (attachment.phase === "failed" && (!video || video === attachment.video)) {
      return;
    }

    if (video) {
      attachToObservedVideo(video);
      return;
    }

    if (attachment.phase !== "failed") {
      state.attachment = createAttachmentState("waiting-for-video");
      disposeSession();
    }
  }

  function attachToObservedVideo(video) {
    if (!video || !state.subtitleContent || state.disposed) {
      return null;
    }

    return attachToVideo(video, state.subtitleContent).catch((error) => {
      const errorInfo = describeError(error);
      setContentError(state, errorInfo.message, "renderer-attach");
      state.attachment = createAttachmentState("failed", video, errorInfo.message);
      trace("attach:observer-error", {
        error: errorInfo.message,
        details: errorInfo
      }, "error");
      return {
        ready: false,
        error: errorInfo.message
      };
    });
  }

  function disconnectObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }

  function handleVideoSourceChange(session, video, previousSource, source) {
    if (state.session !== session || state.disposed || !state.subtitleContent) {
      return;
    }
    clearSubtitleForVideoChange("video-source-changed", {
      video: describeVideo(video),
      previousSource: describeVideoSource(previousSource),
      source: describeVideoSource(source)
    });
  }

  function handleVideoEmptied(session, video) {
    if (state.session !== session || state.disposed || !state.subtitleContent) {
      return;
    }
    // A SPA can reuse its video element and media URL for the next item. The
    // media reset still signals that the subtitle belongs to the prior video.
    clearSubtitleForVideoChange("video-emptied", {
      video: describeVideo(video)
    });
  }

  function clearSubtitleForVideoChange(event, details) {
    trace("video:subtitle-cleared", {
      event,
      ...(details || {})
    }, "warn");
    removeSubtitle("video-changed");
  }

  function hasActiveVideoSourceMutation(records, video) {
    return records.some((record) => {
      if (record.type === "attributes") {
        return record.target === video;
      }
      if (record.target === video) {
        return Array.from(record.addedNodes).some((node) => node instanceof HTMLSourceElement) ||
          Array.from(record.removedNodes).some((node) => node instanceof HTMLSourceElement);
      }
      return record.target instanceof HTMLSourceElement && record.target.parentElement === video;
    });
  }

  function describeVideoSource(source) {
    return typeof source === "string" ? source : (source ? "media stream" : null);
  }

  function findBestVideo() {
    return findBestVideoElement(document, trace);
  }


  function getSubtitleRenderTime(video) {
    return (video.currentTime || 0) - state.subtitleDelay;
  }

  function createAttachmentState(phase, video, error) {
    return {
      phase,
      video: video || null,
      error: error || null,
      recovery: null
    };
  }

  function createSupersededAttachResult() {
    return {
      ready: false,
      error: "Renderer attach was superseded."
    };
  }

  function createPendingAttachResult() {
    return {
      ready: false,
      pending: true,
      error: null
    };
  }
