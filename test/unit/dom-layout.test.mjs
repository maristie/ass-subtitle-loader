import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDomLaneLayout } from "../../src/renderers/dom/layout.js";
import { parseDomAssTrack } from "../../src/renderers/dom/track.js";

async function loadTrack(name) {
  const content = await readFile(new URL(`../${name}`, import.meta.url), "utf8");
  return parseDomAssTrack(content);
}

function getRenderedLaneBounds(track, layout, fontScale) {
  const origin = track.laneOrigin;
  return track.laneBounds.map((bounds, index) => ({
    top: origin + ((bounds.top - origin) * fontScale) + layout.offsets[index],
    bottom: origin + ((bounds.bottom - origin) * fontScale) + layout.offsets[index]
  }));
}

test("default DOM lane layout preserves every authored coordinate", async () => {
  const track = await loadTrack("large-load.ass");
  const layout = getDomLaneLayout(track, { fontScale: 1, laneGap: 0 });

  assert.equal(layout.laneCount, 28);
  assert.equal(layout.sourceLaneCount, 28);
  assert.deepEqual(layout.offsets, Array(28).fill(0));
});

test("scaled DOM lane stack recalculates its physical capacity", async () => {
  const track = await loadTrack("dom-synthetic-lane-matrix.ass");
  const fontScale = 1.5;
  const layout = getDomLaneLayout(track, { fontScale, laneGap: 0.5 });
  const bounds = getRenderedLaneBounds(track, layout, fontScale);

  assert.ok(layout.laneCount < layout.sourceLaneCount);
  assert.ok(Math.min(...bounds.map((lane) => lane.top)) >= -0.001);
  assert.ok(Math.max(...bounds.map((lane) => lane.bottom)) <= track.playResY + 0.001);
  assert.equal(new Set(bounds.map((lane) => lane.top.toFixed(3))).size, layout.laneCount);
});

test("larger DOM text reuses fewer lanes instead of crossing the video boundary", async () => {
  const track = await loadTrack("large-load.ass");
  const fontScale = 2;
  const layout = getDomLaneLayout(track, { fontScale, laneGap: 0 });
  const bounds = getRenderedLaneBounds(track, layout, fontScale);
  const renderedTops = new Set(bounds.map((lane) => lane.top.toFixed(3)));

  assert.equal(layout.sourceLaneCount, 28);
  assert.equal(layout.laneCount, 10);
  assert.equal(renderedTops.size, layout.laneCount);
  assert.ok(Math.min(...bounds.map((lane) => lane.top)) >= -0.001);
  assert.ok(Math.max(...bounds.map((lane) => lane.bottom)) <= track.playResY + 0.001);
  assert.equal(layout.overflow, 0);
});
