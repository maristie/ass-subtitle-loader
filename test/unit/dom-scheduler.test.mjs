import assert from "node:assert/strict";
import test from "node:test";

import { createDomEventSchedule, getMovingPairReleaseTime } from "../../src/renderers/dom/scheduler.js";
import { parseDomAssTrack } from "../../src/renderers/dom/track.js";

function createTrack(dialogues, playResY = 150) {
  return parseDomAssTrack(`[Script Info]
PlayResX: 640
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,sans-serif,36,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues.join("\n")}`);
}

function findEvent(schedule, text) {
  return schedule.events.find((event) => event.text === text);
}

test("moving lanes reopen at the earliest collision-safe time", () => {
  const paint = { width: 100, leftOffset: 0, rightOffset: 100 };
  const leader = {
    start: 0,
    end: 10,
    move: { kind: "move", x1: 640, y1: 20, x2: -100, y2: 20, start: 0, end: 10 },
    paint
  };
  const equalFollower = {
    event: {
      move: { kind: "move", x1: 640, y1: 20, x2: -100, y2: 20, start: 0, end: 10 }
    },
    paint
  };
  const fastFollower = {
    event: {
      move: { kind: "move", x1: 640, y1: 20, x2: -100, y2: 20, start: 0, end: 5 }
    },
    paint
  };

  assert.ok(Math.abs(getMovingPairReleaseTime(leader, equalFollower, 640) - (100 / 74)) < 1e-9);
  assert.ok(Math.abs(getMovingPairReleaseTime(leader, equalFollower, 640, 10) - (110 / 74)) < 1e-9);
  assert.ok(Math.abs(getMovingPairReleaseTime(leader, fastFollower, 640) - (840 / 148)) < 1e-9);

  const leftToRightPaint = { width: 100, leftOffset: -100, rightOffset: 0 };
  const leftToRightLeader = {
    start: 0,
    end: 10,
    move: { kind: "move", x1: 0, y1: 20, x2: 740, y2: 20, start: 0, end: 10 },
    paint: leftToRightPaint
  };
  const leftToRightFollower = {
    event: {
      move: { kind: "move", x1: 0, y1: 20, x2: 740, y2: 20, start: 0, end: 10 }
    },
    paint: leftToRightPaint
  };
  assert.ok(
    Math.abs(getMovingPairReleaseTime(leftToRightLeader, leftToRightFollower, 640) - (100 / 74)) < 1e-9
  );
});

test("fixed top and bottom share lanes while moving comments schedule independently", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}fixed top",
    "Dialogue: 0,0:00:00.00,0:00:07.00,Default,,0,0,0,,{\\an2\\pos(320,140)}fixed bottom",
    "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(320,10)}queued fixed",
    "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\an7\\move(650,30,-110,30)}independent moving"
  ]);
  const schedule = createDomEventSchedule(track, { fontScale: 2, laneGap: 0 }, {
    measureText: () => 100
  });
  const nominal = createDomEventSchedule(track, { fontScale: 1, laneGap: 0 });
  const fixedTop = findEvent(schedule, "fixed top");
  const fixedBottom = findEvent(schedule, "fixed bottom");
  const queuedFixed = findEvent(schedule, "queued fixed");
  const moving = findEvent(schedule, "independent moving");

  assert.equal(schedule.fixedLayout.laneCount, 2);
  assert.ok(nominal.fixedLayout.laneCount > schedule.fixedLayout.laneCount);
  assert.ok(Math.abs(schedule.fixedLayout.laneHeight / nominal.fixedLayout.laneHeight - 2) < 0.001);
  assert.deepEqual(
    [fixedTop.scheduledLaneIndex, fixedTop.start, fixedTop.end],
    [0, 0, 5]
  );
  assert.deepEqual(
    [fixedBottom.scheduledLaneIndex, fixedBottom.start, fixedBottom.end],
    [1, 0, 7]
  );
  assert.deepEqual(
    [queuedFixed.scheduledLaneIndex, queuedFixed.start, queuedFixed.end],
    [0, 5, 7]
  );
  assert.deepEqual(
    [moving.collisionClass, moving.start, moving.end],
    ["moving", 1, 4]
  );
  assert.equal(schedule.delayedCount, 1);

  const activeAtSix = schedule.events
    .filter((event) => event.start <= 6 && event.end > 6)
    .map((event) => event.text)
    .sort();
  assert.deepEqual(activeAtSix, ["fixed bottom", "queued fixed"]);
});

test("moving scheduler tries the next free lane before delaying", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,{\\an7\\move(650,30,-110,30)}moving one",
    "Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,{\\an7\\move(650,30,-110,30)}moving two",
    "Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,{\\an7\\move(650,30,-110,30)}moving three",
    "Dialogue: 0,0:01:40.00,0:01:50.00,Default,,0,0,0,,{\\an7\\move(650,120,-110,120)}future second lane"
  ], 150);
  const options = { measureText: () => 100 };
  const schedule = createDomEventSchedule(track, { fontScale: 1.5, laneGap: 0 }, options);
  const repeated = createDomEventSchedule(track, { fontScale: 1.5, laneGap: 0 }, options);
  const first = findEvent(schedule, "moving one");
  const second = findEvent(schedule, "moving two");
  const third = findEvent(schedule, "moving three");

  assert.equal(schedule.movingLayout.laneCount, 2);
  assert.deepEqual([first.scheduledLaneIndex, first.start], [0, 0]);
  assert.deepEqual([second.scheduledLaneIndex, second.start], [1, 0]);
  assert.equal(third.scheduledLaneIndex, 0);
  assert.ok(third.start > 0 && third.start < first.end);
  assert.deepEqual(
    schedule.events.map((event) => [event.id, event.start, event.end, event.scheduledLaneIndex]),
    repeated.events.map((event) => [event.id, event.start, event.end, event.scheduledLaneIndex])
  );
});

test("diagonal moving comments reserve the whole moving pool conservatively", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,{\\an7\\move(650,30,-110,30)}horizontal leader",
    "Dialogue: 0,0:00:00.50,0:00:01.50,Default,,0,0,0,,{\\an7\\move(650,20,-110,100)}diagonal",
    "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an7\\move(650,120,-110,120)}horizontal follower"
  ]);
  const schedule = createDomEventSchedule(track, { fontScale: 1.5, laneGap: 0 }, {
    measureText: () => 100
  });
  const diagonal = findEvent(schedule, "diagonal");
  const follower = findEvent(schedule, "horizontal follower");

  assert.equal(schedule.movingLayout.laneCount, 2);
  assert.deepEqual([diagonal.scheduledLaneIndex, diagonal.start, diagonal.end], [null, 2, 3]);
  assert.deepEqual([follower.start, follower.end], [3, 4]);
});

test("inward-growing fixed wraps reserve extra lines without moving the authored edge row", () => {
  const track = createTrack([
    `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an2\\pos(320,10)}${"X".repeat(40)}`
  ], 300);
  const schedule = createDomEventSchedule(track, { fontScale: 2, laneGap: 0 }, {
    measureText: (event) => event.text.length * 30
  });
  const event = schedule.events[0];
  const authoredLineHeight = 36 * 0.7 * 1.125;
  const expectedAnchor = (authoredLineHeight + 3) * 2;

  assert.ok(schedule.fixedLayout.laneHeight > (authoredLineHeight + 6) * 2);
  assert.ok(Math.abs(event.move.y1 + event.scheduledLaneOffset - expectedAnchor) < 0.001);
});

test("fixed wraps reserve every glyph-broken row", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(50,10)}XYZ"
  ], 300);
  const schedule = createDomEventSchedule(track, { fontScale: 2, laneGap: 0 }, {
    measureText: (event) => event.text.length * 60
  });
  const expectedBlockHeight = 36 * 0.7 * 3 * 1.125;
  const expectedPaintHeight = (expectedBlockHeight + 6) * 2;

  assert.ok(Math.abs(schedule.fixedLayout.laneHeight - expectedPaintHeight) < 0.001);
});

test("fixed wraps keep joined emoji graphemes on one row", () => {
  const family = "👨‍👩‍👧‍👦";
  const track = createTrack([
    `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(50,10)}${family}X`
  ], 300);
  const schedule = createDomEventSchedule(track, { fontScale: 2, laneGap: 0 }, {
    measureText: (event) => {
      if (event.text === `${family}X`) {
        return 120;
      }
      if (event.text === family || event.text === "X") {
        return 60;
      }
      return 600;
    }
  });
  const expectedBlockHeight = 36 * 0.7 * 2 * 1.125;
  const expectedPaintHeight = (expectedBlockHeight + 6) * 2;

  assert.ok(Math.abs(schedule.fixedLayout.laneHeight - expectedPaintHeight) < 0.001);
});

test("automatic fixed wrapping reserves its full height at default adjustments", () => {
  const wrappedText = "X".repeat(40);
  const track = createTrack([
    `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}${wrappedText}`,
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}fixed follower",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an7\\move(650,120,-110,120)}moving control"
  ], 300);
  const schedule = createDomEventSchedule(track, { fontScale: 1, laneGap: 0 }, {
    measureText: (event) => event.text === wrappedText ? 1200 : event.text.length * 15
  });
  const wrapped = findEvent(schedule, wrappedText);
  const follower = findEvent(schedule, "fixed follower");
  const moving = findEvent(schedule, "moving control");

  assert.equal(schedule.enabled, true);
  assert.deepEqual([wrapped.start, follower.start], [0, 0]);
  assert.ok(
    follower.scheduledLaneOffset >=
      wrapped.scheduledLaneOffset + schedule.fixedLayout.laneHeight - 0.001
  );
  assert.deepEqual(
    [moving.start, moving.end, moving.collisionClass, moving.scheduledLaneOffset],
    [0, 5, null, 0]
  );
});

test("automatic fixed wrapping queues a conflict when no vertical gap remains", () => {
  const firstText = "X".repeat(40);
  const secondText = "Y".repeat(40);
  const track = createTrack([
    `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}${firstText}`,
    `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}${secondText}`
  ], 150);
  const schedule = createDomEventSchedule(track, { fontScale: 1, laneGap: 0 }, {
    measureText: (event) => event.text.length * 30
  });
  const first = findEvent(schedule, firstText);
  const second = findEvent(schedule, secondText);

  assert.deepEqual([first.start, first.end], [0, 5]);
  assert.deepEqual([second.start, second.end], [5, 10]);
  assert.equal(schedule.delayedCount, 1);
});

test("default fixed positions remain unscheduled when no cue wraps automatically", () => {
  const track = createTrack([
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}first",
    "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(320,10)}second"
  ], 300);
  const schedule = createDomEventSchedule(track, { fontScale: 1, laneGap: 0 }, {
    measureText: (event) => event.text.length * 15
  });

  assert.equal(schedule.enabled, false);
  assert.equal(schedule.events, track.events);
});
