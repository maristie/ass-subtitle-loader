import assert from "node:assert/strict";
import test from "node:test";

import { parseDomAssTrack } from "../../src/renderers/dom/track.js";

const header = `[Script Info]
PlayResX: 640
PlayResY: 360

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,sans-serif,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

function createTrack(dialogues) {
  return parseDomAssTrack(`${header}\n${dialogues.join("\n")}`);
}

test("fixed positions do not participate in moving-comment lanes", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,40,0,40)}moving top",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,80,0,80)}moving second",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,20)\\fs100}fixed top",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an2\\pos(320,340)}fixed bottom"
  ]);

  assert.equal(track.supported, true);
  assert.equal(track.maxLaneIndex, 1);
  assert.equal(track.maxLaneFontSize, 24);
  assert.equal(track.maxLaneBlockHeight, 18.9);

  const [firstMove, secondMove, fixedTop, fixedBottom] = track.events;
  assert.deepEqual(
    [firstMove.move.kind, firstMove.laneKey, firstMove.laneIndex],
    ["move", 40, 0]
  );
  assert.deepEqual(
    [secondMove.move.kind, secondMove.laneKey, secondMove.laneIndex],
    ["move", 80, 1]
  );
  assert.deepEqual(
    [fixedTop.move.kind, fixedTop.laneKey, fixedTop.laneIndex],
    ["position", null, 0]
  );
  assert.deepEqual(
    [fixedBottom.move.kind, fixedBottom.laneKey, fixedBottom.laneIndex],
    ["position", null, 0]
  );
});

test("moving lanes reserve stable mixed-size visual extents", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,40,0,40)\\fs16\\an7}top",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,80,0,80)\\fs32\\an4}middle",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,120,0,120)\\fs20\\an1}bottom",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,160,0,160)\\fs16\\an7}two\\Nlines"
  ]);

  assert.equal(track.supported, true);
  assert.equal(track.maxLaneIndex, 3);
  assert.equal(track.maxLaneFontSize, 32);
  assert.equal(track.maxLaneBlockHeight, 25.2);
  assert.deepEqual(
    track.laneBounds,
    [
      { top: 37, bottom: 55.6 },
      { top: 64.4, bottom: 95.6 },
      { top: 101.25, bottom: 123 },
      { top: 157, bottom: 188.2 }
    ]
  );
});

test("moving lanes group mixed font sizes by their authored block start", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,16,0,16)\\fs16\\an1}row-0-small",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,25,0,25)\\fs25\\an1}row-0-normal",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,36,0,36)\\fs36\\an1}row-0-large",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,41,0,41)\\fs16\\an1}row-1-small",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,50,0,50)\\fs25\\an1}row-1-normal",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,61,0,61)\\fs36\\an1}row-1-large"
  ]);

  assert.equal(track.lanePitch, null);
  assert.equal(track.laneOrigin, 0);
  assert.equal(track.maxLaneIndex, 1);
  assert.ok(Math.abs(track.maxLaneBlockHeight - 28.35) < 0.001);
  assert.deepEqual(
    track.events.map((event) => [event.laneKey, event.laneIndex, event.laneAnchor]),
    [
      [0, 0, 16],
      [0, 0, 25],
      [0, 0, 36],
      [25, 1, 41],
      [25, 1, 50],
      [25, 1, 61]
    ]
  );
  assert.deepEqual(track.events.map((event) => event.laneAnchor), [16, 25, 36, 41, 50, 61]);
});

test("mixed font grids share adjustment rows without changing authored anchors", () => {
  const dialogues = [];
  for (const top of [0, 25, 50, 75]) {
    for (let repeat = 0; repeat < 4; repeat += 1) {
      dialogues.push(
        `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,${top + 25},0,${top + 25})\\fs25\\an1}base-${top}-${repeat}`
      );
    }
  }
  dialogues.push(
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,66,0,66)\\fs25\\an1}phase-41",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,91,0,91)\\fs25\\an1}phase-66"
  );
  const track = createTrack(dialogues);
  const phase41 = track.events.find((event) => event.text === "phase-41");
  const phase66 = track.events.find((event) => event.text === "phase-66");

  assert.equal(track.lanePitch, 25);
  assert.equal(track.maxLaneIndex, 3);
  assert.deepEqual(
    [phase41.laneKey, phase41.laneIndex, phase41.laneAnchor],
    [41, 2, 66]
  );
  assert.deepEqual(
    [phase66.laneKey, phase66.laneIndex, phase66.laneAnchor],
    [66, 3, 91]
  );
});

test("moving lanes keep irregular authored block starts exact", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,20,0,20)}first",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,57,0,57)}second",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,103,0,103)}third"
  ]);

  assert.deepEqual(track.events.map((event) => event.laneKey), [20, 57, 103]);
});

test("tiny inferred pitch does not allocate sparse lane arrays", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,0,0,0)}first",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,0.1,0,0.1)}second",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,10000,0,10000)}third",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,10000.1,0,10000.1)}fourth"
  ]);

  assert.equal(track.lanePitch, 0.1);
  assert.equal(track.maxLaneIndex, 3);
  assert.equal(track.laneBounds.length, 4);
});

test("moving lanes keep tight mixed-size lane gaps nonnegative", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,40,0,40)\\fs64\\an7}large top",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,80,0,80)\\fs16\\an7}small top",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,120,0,120)\\fs32\\an4}middle"
  ]);

  assert.equal(track.maxLaneFontSize, 64);
  assert.equal(track.maxLaneBlockHeight, 50.4);
  assert.equal(track.laneBounds.length, 3);
});

test("moving lanes reserve the largest future event without reflowing", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,40,0,40)\\fs20}first lane",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(600,80,0,80)\\fs20}small second lane",
    "Dialogue: 0,0:00:06.00,0:00:10.00,Default,,0,0,0,,{\\move(600,80,0,80)\\fs40}future second lane"
  ]);

  assert.equal(track.maxLaneIndex, 1);
  assert.equal(track.maxLaneFontSize, 40);
  assert.equal(track.maxLaneBlockHeight, 31.5);
  assert.deepEqual(track.laneBounds[1], { top: 77, bottom: 114.5 });
});

test("whole-line leading style overrides remain supported", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,20)}{\\c&H0000FF&}{\\b1}whole line"
  ]);

  assert.equal(track.supported, true);
  assert.equal(track.events[0].style.bold, true);
  assert.equal(track.events[0].style.primaryColor.r, 255);
  assert.equal(track.events[0].style.primaryColor.g, 0);
  assert.equal(track.events[0].style.primaryColor.b, 0);
});

test("non-leading override tags make the CSS track unsupported", () => {
  for (const text of [
    "{\\an8\\pos(320,20)}plain {\\b1}bold",
    "{\\an8\\pos(320,20)}plain{\\b1}"
  ]) {
    const track = createTrack([
      `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,${text}`
    ]);

    assert.equal(track.supported, false);
    assert.match(track.reason, /override tags appear after visible text/);
  }
});
