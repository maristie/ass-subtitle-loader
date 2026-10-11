import assert from "node:assert/strict";
import test from "node:test";

import { createPlaybackController } from "../../src/content/playback.js";

test("returning to a visible tab forces playback back onto the media clock", (context) => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousMediaElement = globalThis.HTMLMediaElement;
  const previousResizeObserver = globalThis.ResizeObserver;
  context.after(() => {
    restoreGlobal("document", previousDocument);
    restoreGlobal("window", previousWindow);
    restoreGlobal("HTMLMediaElement", previousMediaElement);
    restoreGlobal("ResizeObserver", previousResizeObserver);
  });

  const documentTarget = createEventTarget({ visibilityState: "visible" });
  const windowTarget = createEventTarget();
  const video = createEventTarget({
    currentTime: 10,
    paused: false,
    ended: false,
    readyState: 4,
    playbackRate: 1
  });
  globalThis.document = documentTarget;
  globalThis.window = windowTarget;
  globalThis.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };
  delete globalThis.ResizeObserver;

  const calls = [];
  const state = {
    video,
    renderer: {
      setRate(rate) {
        calls.push(["rate", rate]);
      },
      setCurrentTime(time, force) {
        calls.push(["time", time, force]);
      },
      setIsPaused(paused, time) {
        calls.push(["paused", paused, time]);
      }
    },
    cleanup: [],
    resizeFrame: 0,
    resizeObserver: null,
    overlay: null
  };
  const playback = createPlaybackController({
    getSubtitleRenderTime(currentVideo) {
      return currentVideo.currentTime - 2;
    },
    state,
    trace() {}
  });
  playback.bindVideo(video);

  documentTarget.visibilityState = "hidden";
  documentTarget.dispatch("visibilitychange");
  assert.deepEqual(calls, []);

  video.currentTime = 13;
  documentTarget.visibilityState = "visible";
  documentTarget.dispatch("visibilitychange");
  assert.deepEqual(calls, [
    ["rate", 1],
    ["time", 11, true],
    ["paused", false, 11]
  ]);

  playback.stop();
  calls.length = 0;
  documentTarget.dispatch("visibilitychange");
  assert.deepEqual(calls, []);
});

test("waiting freezes playback until playing resumes it", (context) => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousMediaElement = globalThis.HTMLMediaElement;
  const previousResizeObserver = globalThis.ResizeObserver;
  context.after(() => {
    restoreGlobal("document", previousDocument);
    restoreGlobal("window", previousWindow);
    restoreGlobal("HTMLMediaElement", previousMediaElement);
    restoreGlobal("ResizeObserver", previousResizeObserver);
  });

  globalThis.document = createEventTarget({ visibilityState: "visible" });
  globalThis.window = createEventTarget();
  globalThis.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };
  delete globalThis.ResizeObserver;
  const video = createEventTarget({
    currentTime: 4,
    paused: false,
    ended: false,
    seeking: false,
    readyState: 2,
    playbackRate: 1
  });
  const pausedStates = [];
  const state = {
    video,
    renderer: {
      setRate() {},
      setCurrentTime() {},
      setIsPaused(paused) {
        pausedStates.push(paused);
      }
    },
    cleanup: [],
    resizeFrame: 0,
    resizeObserver: null,
    overlay: null
  };
  const playback = createPlaybackController({
    getSubtitleRenderTime(currentVideo) {
      return currentVideo.currentTime;
    },
    state,
    trace() {}
  });
  playback.bindVideo(video);

  video.dispatch("waiting");
  video.dispatch("timeupdate");
  video.readyState = 4;
  video.dispatch("playing");

  assert.deepEqual(pausedStates, [true, true, false]);
  playback.stop();
});

function createEventTarget(properties = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) || new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener(type, listener) {
      const typeListeners = listeners.get(type);
      if (typeListeners) {
        typeListeners.delete(listener);
      }
    },
    dispatch(type) {
      Array.from(listeners.get(type) || [], (listener) => listener());
    }
  }, properties);
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
  } else {
    globalThis[name] = value;
  }
}
