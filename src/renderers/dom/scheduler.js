import {
  DOM_ASS_FONT_SIZE_FACTOR,
  DOM_COMMENT_LINE_HEIGHT,
  DOM_STROKE_EDGE_RESERVE,
  getDomCommentPaintExtents,
  getDomFixedLaneLayout,
  getDomLaneLayout
} from "./layout.js";

const SCHEDULE_EPSILON = 0.000001;
const DOM_GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

// Build the complete media-time schedule up front so normal playback and seeks
// make the same lane decisions. Moving and edge-fixed comments reserve separate
// pools; top and bottom fixed comments intentionally share the fixed pool.
function createDomEventSchedule(track, adjustments, options = {}) {
  const movingLayout = options.movingLayout || getDomLaneLayout(track, adjustments);
  const fontScale = adjustments.fontScale;
  const fixedExtents = new Map(
    track.events
      .filter((event) => getDomCollisionClass(event) === "fixed")
      .map((event) => [
        event,
        getScheduledFixedPaintExtents(event, track, fontScale, options.measureText)
      ])
  );
  const fixedLayout = options.fixedLayout || getDomFixedLaneLayout(track, adjustments, {
    getEventExtents: (event) => fixedExtents.get(event) || getDomCommentPaintExtents(event)
  });
  const adjustmentSchedulingEnabled = adjustments.fontScale !== 1 || adjustments.laneGap !== 0;
  const enabled = adjustmentSchedulingEnabled || Array.from(
    fixedExtents.values()
  ).some((extents) => extents.renderedLineCount > extents.authoredLineCount);
  const sourceEvents = track.events.slice().sort((left, right) => (
    left.start - right.start || left.id - right.id
  ));
  if (!enabled) {
    return {
      enabled: false,
      events: track.events,
      movingLayout,
      fixedLayout,
      delayedCount: 0,
      maxDelay: 0,
      maxDuration: track.maxDuration
    };
  }

  const movingReservations = Array.from(
    { length: Math.max(1, movingLayout.laneCount) },
    () => []
  );
  const fixedAvailableAt = Array(Math.max(0, fixedLayout.laneCount)).fill(0);
  const scheduled = [];
  let delayedCount = 0;
  let maxDelay = 0;

  sourceEvents.forEach((sourceEvent) => {
    const collisionClass = getDomCollisionClass(sourceEvent);
    let entry;
    if (collisionClass === "moving" && adjustmentSchedulingEnabled) {
      entry = scheduleMovingEvent(
        sourceEvent,
        track,
        movingLayout,
        movingReservations,
        fontScale,
        options
      );
    } else if (collisionClass === "fixed" && fixedLayout.laneCount > 0) {
      entry = scheduleFixedEvent(
        sourceEvent,
        track,
        fixedLayout,
        fixedAvailableAt,
        fontScale,
        fixedExtents.get(sourceEvent)
      );
    } else {
      entry = cloneScheduledEvent(sourceEvent, sourceEvent.start, null, null, 0);
    }

    const delay = entry.start - sourceEvent.start;
    if (delay > SCHEDULE_EPSILON) {
      delayedCount += 1;
      maxDelay = Math.max(maxDelay, delay);
    }
    scheduled.push(entry);
  });

  scheduled.sort((left, right) => (
    left.start - right.start || left.authoredStart - right.authoredStart || left.id - right.id
  ));
  return {
    enabled: true,
    events: scheduled,
    movingLayout,
    fixedLayout,
    delayedCount,
    maxDelay,
    maxDuration: scheduled.reduce(
      (maximum, event) => Math.max(maximum, event.end - event.start),
      0
    )
  };
}

function scheduleMovingEvent(
  sourceEvent,
  track,
  layout,
  reservations,
  fontScale,
  options
) {
  const eventHeight = getDomCommentPaintExtents(sourceEvent).height * fontScale;
  const paint = getMovingPaintMetrics(
    sourceEvent,
    fontScale,
    options.measureText,
    options.horizontalTextScale
  );
  if (Math.abs(sourceEvent.move.y1 - sourceEvent.move.y2) > 0.001) {
    return scheduleSweptMovingEvent(
      sourceEvent,
      track,
      reservations,
      fontScale,
      paint,
      options
    );
  }
  const sourceLaneIndex = Number.isFinite(sourceEvent.laneIndex) ? sourceEvent.laneIndex : 0;
  const preferredLane = layout.sourceSlots[sourceLaneIndex] ?? (sourceLaneIndex % layout.laneCount);
  const laneOrder = getCyclicLaneOrder(layout.laneCount, preferredLane);
  const eligibleLanes = laneOrder.filter((laneIndex) => (
    (layout.slotHeights[laneIndex] || 0) + 0.001 >= eventHeight
  ));
  const candidates = eligibleLanes.length ? eligibleLanes : laneOrder;
  let selectedLane = candidates[0] || 0;
  let selectedStart = Infinity;

  candidates.forEach((laneIndex) => {
    const laneReservations = reservations[laneIndex];
    const earliestStart = getEarliestMovingStart(
      sourceEvent,
      paint,
      laneReservations,
      sourceEvent.start,
      track.playResX,
      Math.max(0, Number(options.movingGap) || 0)
    );
    if (earliestStart < selectedStart - SCHEDULE_EPSILON) {
      selectedLane = laneIndex;
      selectedStart = earliestStart;
    }
  });

  const laneTop = layout.slotTops[selectedLane] || 0;
  const anchor = Number.isFinite(sourceEvent.laneAnchor)
    ? sourceEvent.laneAnchor
    : (sourceEvent.move.y1 + sourceEvent.move.y2) / 2;
  const extents = getDomCommentPaintExtents(sourceEvent);
  const laneOffset = laneTop + (extents.above * fontScale) - anchor;
  const entry = cloneScheduledEvent(
    sourceEvent,
    selectedStart,
    "moving",
    selectedLane,
    laneOffset
  );
  reservations[selectedLane].push({
    ...entry,
    paint
  });
  return entry;
}

function scheduleSweptMovingEvent(sourceEvent, track, reservations, fontScale, paint, options) {
  let selectedStart = sourceEvent.start;
  reservations.forEach((laneReservations) => {
    selectedStart = Math.max(
      selectedStart,
      getEarliestMovingStart(
        sourceEvent,
        paint,
        laneReservations,
        sourceEvent.start,
        track.playResX,
        Math.max(0, Number(options.movingGap) || 0)
      )
    );
  });

  const extents = getDomCommentPaintExtents(sourceEvent);
  const authoredTop = Math.min(sourceEvent.move.y1, sourceEvent.move.y2)
    - (extents.above * fontScale);
  const authoredBottom = Math.max(sourceEvent.move.y1, sourceEvent.move.y2)
    + (extents.below * fontScale);
  let laneOffset = 0;
  if (authoredTop < 0) {
    laneOffset = -authoredTop;
  } else if (authoredBottom > track.playResY) {
    laneOffset = track.playResY - authoredBottom;
  }
  const entry = cloneScheduledEvent(
    sourceEvent,
    selectedStart,
    "moving",
    null,
    laneOffset
  );
  const reservation = {
    ...entry,
    paint
  };
  reservations.forEach((laneReservations) => laneReservations.push(reservation));
  return entry;
}

function scheduleFixedEvent(sourceEvent, track, layout, availableAt, fontScale, scheduledExtents) {
  const isTop = ((sourceEvent.move.y1 + sourceEvent.move.y2) / 2) <= track.playResY / 2;
  const laneOrder = isTop
    ? Array.from({ length: layout.laneCount }, (_value, index) => index)
    : Array.from({ length: layout.laneCount }, (_value, index) => layout.laneCount - index - 1);
  let selectedLane = laneOrder[0] || 0;
  let selectedStart = Infinity;
  laneOrder.forEach((laneIndex) => {
    const earliestStart = Math.max(sourceEvent.start, availableAt[laneIndex] || 0);
    if (earliestStart < selectedStart - SCHEDULE_EPSILON) {
      selectedLane = laneIndex;
      selectedStart = earliestStart;
    }
  });

  const duration = sourceEvent.end - sourceEvent.start;
  availableAt[selectedLane] = selectedStart + duration;
  const extents = scheduledExtents || getDomCommentPaintExtents(sourceEvent);
  const eventHeight = extents.height * fontScale;
  const slotTop = layout.slotTops[selectedLane] || 0;
  const slotHeight = layout.slotHeights[selectedLane] || layout.laneHeight || eventHeight;
  const paintTop = isTop ? slotTop : slotTop + Math.max(0, slotHeight - eventHeight);
  const laneOffset = paintTop + (extents.above * fontScale) - sourceEvent.move.y1;
  return cloneScheduledEvent(
    sourceEvent,
    selectedStart,
    "fixed",
    selectedLane,
    laneOffset
  );
}

function cloneScheduledEvent(sourceEvent, scheduledStart, collisionClass, laneIndex, laneOffset) {
  const duration = sourceEvent.end - sourceEvent.start;
  return {
    ...sourceEvent,
    authoredStart: sourceEvent.start,
    authoredEnd: sourceEvent.end,
    start: scheduledStart,
    end: scheduledStart + duration,
    collisionClass,
    scheduledLaneIndex: laneIndex,
    scheduledLaneOffset: laneOffset,
    scheduleDelay: scheduledStart - sourceEvent.start
  };
}

function getEarliestMovingStart(event, paint, reservations, authoredStart, playResX, gap) {
  let earliest = authoredStart;
  reservations.forEach((previous) => {
    earliest = Math.max(
      earliest,
      getMovingPairReleaseTime(previous, { event, paint }, playResX, gap)
    );
  });
  if (reservations.length) {
    earliest = Math.max(earliest, reservations[reservations.length - 1].start);
  }
  return earliest;
}

function getMovingPairReleaseTime(previous, next, playResX, gap = 0) {
  const oldEvent = previous.event || previous;
  const newEvent = next.event || next;
  const oldPaint = previous.paint;
  const newPaint = next.paint;
  if (!canReuseMovingLaneEarly(oldEvent, oldPaint, newEvent, newPaint, playResX)) {
    return previous.end;
  }

  const oldMove = oldEvent.move;
  const newMove = newEvent.move;
  const oldVelocity = (oldMove.x2 - oldMove.x1) / (oldMove.end - oldMove.start);
  const newVelocity = (newMove.x2 - newMove.x1) / (newMove.end - newMove.start);
  const oldStart = previous.start;
  let releaseTime;
  // For a full horizontal traversal, compare the old trailing paint edge with
  // the new leading edge. Faster followers wait until they cannot catch the
  // leader before it exits; ambiguous trajectories use the full event end.
  if (oldVelocity < 0) {
    const oldTailStart = oldMove.x1 + oldPaint.rightOffset;
    const newHeadStart = newMove.x1 + newPaint.leftOffset;
    if (newVelocity >= oldVelocity) {
      const oldClearTime = oldStart + oldMove.start
        + (((playResX - gap) - oldTailStart) / oldVelocity);
      const newEntryAge = newMove.start + ((playResX - newHeadStart) / newVelocity);
      releaseTime = oldClearTime - newEntryAge;
    } else {
      const oldExitTime = oldStart + oldMove.start + ((0 - oldTailStart) / oldVelocity);
      const newGapAge = newMove.start + ((gap - newHeadStart) / newVelocity);
      releaseTime = oldExitTime - newGapAge;
    }
  } else {
    const oldTailStart = oldMove.x1 + oldPaint.leftOffset;
    const newHeadStart = newMove.x1 + newPaint.rightOffset;
    if (newVelocity <= oldVelocity) {
      const oldClearTime = oldStart + oldMove.start + ((gap - oldTailStart) / oldVelocity);
      const newEntryAge = newMove.start + ((0 - newHeadStart) / newVelocity);
      releaseTime = oldClearTime - newEntryAge;
    } else {
      const oldExitTime = oldStart + oldMove.start + ((playResX - oldTailStart) / oldVelocity);
      const newGapAge = newMove.start + (((playResX - gap) - newHeadStart) / newVelocity);
      releaseTime = oldExitTime - newGapAge;
    }
  }
  return Math.min(previous.end, releaseTime);
}

function canReuseMovingLaneEarly(oldEvent, oldPaint, newEvent, newPaint, playResX) {
  if (!oldPaint || !newPaint || !Number.isFinite(oldPaint.width) || !Number.isFinite(newPaint.width)) {
    return false;
  }
  const oldMove = oldEvent.move;
  const newMove = newEvent.move;
  if (
    Math.abs(oldMove.y1 - oldMove.y2) > 0.001 ||
    Math.abs(newMove.y1 - newMove.y2) > 0.001
  ) {
    return false;
  }
  const oldVelocity = (oldMove.x2 - oldMove.x1) / (oldMove.end - oldMove.start);
  const newVelocity = (newMove.x2 - newMove.x1) / (newMove.end - newMove.start);
  if (!Number.isFinite(oldVelocity) || !Number.isFinite(newVelocity) || oldVelocity * newVelocity <= 0) {
    return false;
  }

  if (oldVelocity < 0) {
    return oldMove.x1 + oldPaint.leftOffset >= playResX - 0.001 &&
      oldMove.x2 + oldPaint.rightOffset <= 0.001 &&
      newMove.x1 + newPaint.leftOffset >= playResX - 0.001 &&
      newMove.x2 + newPaint.rightOffset <= 0.001;
  }
  return oldMove.x1 + oldPaint.rightOffset <= 0.001 &&
    oldMove.x2 + oldPaint.leftOffset >= playResX - 0.001 &&
    newMove.x1 + newPaint.rightOffset <= 0.001 &&
    newMove.x2 + newPaint.leftOffset >= playResX - 0.001;
}

function getScheduledFixedPaintExtents(event, track, fontScale, measureText) {
  const style = event.style || {};
  const wrapWidth = getFixedWrapWidthInScript(
    event.move.x1,
    style.alignment,
    track.playResX
  );
  const lines = String(event.text || "").split("\n");
  const renderedLineCount = lines.reduce((total, line) => (
    total + estimateFixedWrappedLineCount(line, event, fontScale, wrapWidth, measureText)
  ), 0);
  const blockHeight = Math.max(0, Number(style.fontSize) || 0)
    * DOM_ASS_FONT_SIZE_FACTOR
    * renderedLineCount
    * DOM_COMMENT_LINE_HEIGHT;
  const authoredLineCount = Math.max(1, lines.length);
  const authoredBlockHeight = Math.max(0, Number(style.fontSize) || 0)
    * DOM_ASS_FONT_SIZE_FACTOR
    * authoredLineCount
    * DOM_COMMENT_LINE_HEIGHT;
  const outline = Math.max(0, Number(style.outline) || 0);
  const outlineSpread = outline > 0 ? outline + DOM_STROKE_EDGE_RESERVE : 0;
  const shadow = Math.max(0, Number(style.shadow) || 0);
  const vertical = Math.ceil(Number(style.alignment) / 3);
  const isTop = ((event.move.y1 + event.move.y2) / 2) <= track.playResY / 2;
  const blockAbove = isTop
    ? vertical === 1 ? authoredBlockHeight : 0
    : vertical === 3 ? Math.max(0, blockHeight - authoredBlockHeight) : blockHeight;
  return {
    above: blockAbove + outlineSpread,
    below: blockHeight - blockAbove + outlineSpread + shadow,
    height: blockHeight + (outlineSpread * 2) + shadow,
    renderedLineCount,
    authoredLineCount
  };
}

function estimateFixedWrappedLineCount(line, event, fontScale, wrapWidth, measureText) {
  const maximumWidth = Math.max(1, wrapWidth);
  const tokens = String(line).match(/\S+\s*|\s+/g) || [""];
  let lineCount = 1;
  let usedWidth = 0;
  const measure = (text) => {
    const tokenEvent = { ...event, text };
    const measured = typeof measureText === "function"
      ? Number(measureText(tokenEvent, fontScale))
      : NaN;
    return Number.isFinite(measured) && measured >= 0
      ? measured
      : estimateTextWidth(tokenEvent, fontScale);
  };

  tokens.forEach((token) => {
    const width = measure(token);
    if (width <= maximumWidth) {
      if (usedWidth > 0 && usedWidth + width > maximumWidth) {
        lineCount += 1;
        usedWidth = width;
      } else {
        usedWidth += width;
      }
      return;
    }

    // `overflow-wrap:anywhere` breaks an oversized token at glyph boundaries.
    // Dividing its aggregate width by the line width can undercount when only
    // one wide glyph fits on each row, so pack progressively measured prefixes.
    if (usedWidth > 0) {
      lineCount += 1;
    }
    let fragmentWidth = 0;
    const characters = splitDomWrapUnits(token);
    let start = 0;
    while (start < characters.length) {
      let bestEnd = start + 1;
      let bestWidth = measure(characters[start]);
      if (bestWidth <= maximumWidth + 0.001) {
        let probeLength = 2;
        let overflowEnd = null;
        while (bestEnd < characters.length) {
          const end = Math.min(characters.length, start + probeLength);
          const candidateWidth = measure(characters.slice(start, end).join(""));
          if (candidateWidth <= maximumWidth + 0.001) {
            bestEnd = end;
            bestWidth = candidateWidth;
            probeLength *= 2;
            continue;
          }
          overflowEnd = end;
          break;
        }
        let low = bestEnd + 1;
        let high = overflowEnd === null ? bestEnd : overflowEnd - 1;
        while (low <= high) {
          const end = (low + high) >> 1;
          const candidateWidth = measure(characters.slice(start, end).join(""));
          if (candidateWidth <= maximumWidth + 0.001) {
            bestEnd = end;
            bestWidth = candidateWidth;
            low = end + 1;
          } else {
            high = end - 1;
          }
        }
      }
      if (start > 0) {
        lineCount += 1;
      }
      fragmentWidth = bestWidth;
      start = bestEnd;
    }
    usedWidth = fragmentWidth;
  });
  return lineCount;
}

function splitDomWrapUnits(value) {
  const text = String(value);
  if (!DOM_GRAPHEME_SEGMENTER) {
    return Array.from(text);
  }
  return Array.from(DOM_GRAPHEME_SEGMENTER.segment(text), (entry) => entry.segment);
}

function getFixedWrapWidthInScript(x, alignment, width) {
  const safeX = Math.min(width, Math.max(0, Number(x) || 0));
  const horizontal = Number(alignment) % 3;
  const availableWidth = horizontal === 1
    ? width - safeX
    : horizontal === 2
      ? 2 * Math.min(safeX, width - safeX)
      : safeX;
  return Math.max(1, Math.min(width * 0.9, availableWidth));
}

function getMovingPaintMetrics(event, fontScale, measureText, horizontalTextScale = 1) {
  const horizontalScale = Number.isFinite(Number(horizontalTextScale))
    ? Math.max(0, Number(horizontalTextScale))
    : 1;
  const measured = typeof measureText === "function"
    ? Number(measureText(event, fontScale))
    : NaN;
  const width = Number.isFinite(measured) && measured >= 0
    ? measured
    : estimateTextWidth(event, fontScale) * horizontalScale;
  const style = event.style || {};
  const outline = Math.max(0, Number(style.outline) || 0);
  const outlineSpread = outline > 0
    ? (outline + DOM_STROKE_EDGE_RESERVE) * fontScale * horizontalScale
    : 0;
  const shadow = Math.max(0, Number(style.shadow) || 0) * fontScale * horizontalScale;
  const horizontal = Number(style.alignment) % 3;
  const glyphLeft = horizontal === 1 ? 0 : horizontal === 2 ? -width / 2 : -width;
  return {
    width,
    leftOffset: glyphLeft - outlineSpread,
    rightOffset: glyphLeft + width + outlineSpread + shadow
  };
}

function estimateTextWidth(event, fontScale) {
  const fontSize = Math.max(0, Number(event.style && event.style.fontSize) || 0)
    * DOM_ASS_FONT_SIZE_FACTOR
    * fontScale;
  return Math.max(
    0,
    ...String(event.text || "").split("\n").map((line) => line.length * fontSize * 0.6)
  );
}

function getCyclicLaneOrder(laneCount, preferredLane) {
  const safeCount = Math.max(1, laneCount);
  const start = ((Number(preferredLane) || 0) % safeCount + safeCount) % safeCount;
  return Array.from({ length: safeCount }, (_value, offset) => (start + offset) % safeCount);
}

function getDomCollisionClass(event) {
  if (!event || !event.move) {
    return null;
  }
  if (event.move.kind === "move") {
    return "moving";
  }
  const vertical = Math.ceil(Number(event.style && event.style.alignment) / 3);
  return event.move.kind === "position" && vertical !== 2 ? "fixed" : null;
}

export {
  createDomEventSchedule,
  getDomCollisionClass,
  getMovingPairReleaseTime
};
