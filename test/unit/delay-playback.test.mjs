import assert from "node:assert/strict";
import test from "node:test";

import { createPlaybackController } from "../../src/content/playback.js";
import { DomAssRenderer } from "../../src/renderers/dom/renderer.js";
import { parseDomAssTrack } from "../../src/renderers/dom/track.js";

const assHeader = `[Script Info]
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,sans-serif,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

test("forced DOM delay resync rebuilds the absolute subtitle timestamp", () => {
  const renderer = createStateOnlyDomRenderer([
    dialogue("0:00:01.50", "0:00:02.50", "C"),
    dialogue("0:00:06.50", "0:00:07.50", "B"),
    dialogue("0:00:11.50", "0:00:12.50", "A"),
    dialogue("0:00:16.50", "0:00:17.50", "D")
  ]);
  const videoTime = 12;
  const delays = [0, 5, 10, -5, 0];
  const expected = ["A", "B", "C", "D", "A"];

  const observed = delays.map((delay) => {
    renderer.setCurrentTime(videoTime - delay, true);
    return getActiveTexts(renderer);
  });

  assert.deepEqual(observed, expected.map((text) => [text]));
});

test("forced DOM delay resync renders nothing before subtitle time zero", () => {
  const renderer = createStateOnlyDomRenderer([
    dialogue("0:00:00.00", "0:00:01.00", "zero")
  ]);

  renderer.setCurrentTime(0, true);
  assert.deepEqual(getActiveTexts(renderer), ["zero"]);

  renderer.setCurrentTime(-5, true);
  assert.deepEqual(getActiveTexts(renderer), []);
});

test("forced DOM delay resync resurrects a short cue after a small backward jump", () => {
  const renderer = createStateOnlyDomRenderer([
    dialogue("0:00:09.85", "0:00:09.95", "short")
  ]);

  renderer.setCurrentTime(10, true);
  assert.deepEqual(getActiveTexts(renderer), []);

  renderer.setCurrentTime(9.9, true);
  assert.deepEqual(getActiveTexts(renderer), ["short"]);

  renderer.setCurrentTime(9.8, true);
  assert.deepEqual(getActiveTexts(renderer), []);

  renderer.setCurrentTime(9.9, true);
  assert.deepEqual(getActiveTexts(renderer), ["short"]);
});

test("playback forwards forced delay resync with the signed subtitle time", (context) => {
  const originalMediaElement = globalThis.HTMLMediaElement;
  context.after(() => {
    if (originalMediaElement === undefined) {
      delete globalThis.HTMLMediaElement;
    } else {
      globalThis.HTMLMediaElement = originalMediaElement;
    }
  });
  globalThis.HTMLMediaElement = {
    HAVE_CURRENT_DATA: 2
  };

  const calls = [];
  const video = {
    currentTime: 3,
    paused: false,
    ended: false,
    readyState: 4,
    playbackRate: 1
  };
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
    }
  };
  const playback = createPlaybackController({
    getSubtitleRenderTime() {
      return video.currentTime - 5;
    },
    state,
    trace() {}
  });

  playback.syncPlaybackState(true);

  assert.deepEqual(calls, [
    ["rate", 1],
    ["time", -2, true],
    ["paused", false, -2]
  ]);
});

function dialogue(start, end, text) {
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\pos(320,180)}${text}`;
}

function createStateOnlyDomRenderer(dialogues) {
  const track = parseDomAssTrack(`${assHeader}\n${dialogues.join("\n")}`);
  assert.equal(track.supported, true, track.reason);
  const renderer = new DomAssRenderer({
    layer: {},
    track,
    adjustments: {},
    fontConfig: {},
    trace() {}
  });

  renderer.addActive = function addActive(event) {
    this.active.set(event.id, {
      event,
      element: {
        style: {}
      }
    });
  };
  renderer.releaseActive = function releaseActive(id) {
    this.active.delete(id);
  };
  renderer.updateAnimationState = () => {};
  return renderer;
}

function getActiveTexts(renderer) {
  return Array.from(renderer.active.values(), (entry) => entry.event.text).sort();
}
