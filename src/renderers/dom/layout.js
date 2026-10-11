const DOM_COMMENT_LINE_HEIGHT = 1.125;
// Leave one ASS coordinate beyond a nominal outline so antialiased edge pixels
// do not touch the neighboring lane when packed rows are scaled onto the video.
const DOM_STROKE_EDGE_RESERVE = 1;
// CSS sizes the bundled font's 1000-unit em. The existing 0.7 conversion
// preserves the calibrated ASS text size with this exact font.
// Recalibrate this if the bundled font changes.
const DOM_ASS_FONT_SIZE_FACTOR = 0.7;

function getDomLaneLayout(track, adjustments) {
  const sourceLaneCount = Math.max(1, (track.maxLaneIndex || 0) + 1);
  const offsets = Array(sourceLaneCount).fill(0);
  const requestedFontScale = Number(adjustments && adjustments.fontScale);
  const requestedLaneGap = Number(adjustments && adjustments.laneGap);
  const fontScale = Number.isFinite(requestedFontScale) && requestedFontScale > 0
    ? requestedFontScale
    : 1;
  const laneGap = Number.isFinite(requestedLaneGap) ? Math.max(0, requestedLaneGap) : 0;
  if (fontScale === 1 && laneGap === 0) {
    return {
      offsets,
      laneCount: sourceLaneCount,
      sourceLaneCount,
      slotHeights: [],
      slotTops: [],
      sourceSlots: Array.from({ length: sourceLaneCount }, (_value, index) => index),
      overflow: 0
    };
  }

  const bounds = Array.isArray(track.laneBounds) ? track.laneBounds : [];
  const origin = Number.isFinite(track.laneOrigin) ? track.laneOrigin : 0;
  const playResY = Math.max(1, Number(track.playResY) || 1);
  const movingEvents = Array.isArray(track.events)
    ? track.events.filter((event) => event && event.move && event.move.kind === "move")
    : [];
  const laneHeight = Math.max(
    1,
    ...movingEvents.map((event) => getDomCommentPaintExtents(event).height * fontScale)
  );
  const maxFontSize = Math.max(
    0,
    ...movingEvents.map((event) => Number(event.style && event.style.fontSize) || 0)
  );
  const clearGap = maxFontSize
    * DOM_ASS_FONT_SIZE_FACTOR
    * fontScale
    * laneGap;
  const desiredTop = Math.max(0, origin);
  const laneCount = Math.max(
    1,
    Math.floor((playResY + clearGap) / (laneHeight + clearGap))
  );
  const packedHeight = (laneCount * laneHeight) + (Math.max(0, laneCount - 1) * clearGap);
  const firstTop = Math.min(desiredTop, Math.max(0, playResY - packedHeight));
  const slotHeights = Array(laneCount).fill(laneHeight);
  const slotTops = Array.from(
    { length: laneCount },
    (_value, index) => firstTop + (index * (laneHeight + clearGap))
  );
  const sourceSlots = Array.from(
    { length: sourceLaneCount },
    (_value, index) => index % laneCount
  );
  const sourceLanes = Array.from({ length: sourceLaneCount }, (_value, index) => {
    const lane = bounds[index] || {};
    const top = Number.isFinite(lane.top) ? lane.top : origin;
    return {
      scaledTop: origin + ((top - origin) * fontScale)
    };
  });
  sourceLanes.forEach((lane, index) => {
    offsets[index] = slotTops[sourceSlots[index]] - lane.scaledTop;
  });

  return {
    offsets,
    laneCount,
    sourceLaneCount,
    slotHeights,
    slotTops,
    sourceSlots,
    overflow: Math.max(0, laneHeight - playResY)
  };
}

function getDomFixedLaneLayout(track, adjustments, options = {}) {
  const events = Array.isArray(track.events) ? track.events.filter(isFixedEdgeEvent) : [];
  if (!events.length) {
    return {
      laneCount: 0,
      laneHeight: 0,
      slotHeights: [],
      slotTops: [],
      overflow: 0
    };
  }

  const requestedFontScale = Number(adjustments && adjustments.fontScale);
  const requestedLaneGap = Number(adjustments && adjustments.laneGap);
  const fontScale = Number.isFinite(requestedFontScale) && requestedFontScale > 0
    ? requestedFontScale
    : 1;
  const laneGap = Number.isFinite(requestedLaneGap) ? Math.max(0, requestedLaneGap) : 0;
  const playResY = Math.max(1, Number(track.playResY) || 1);
  const laneHeight = Math.max(
    1,
    ...events.map((event) => {
      const extents = typeof options.getEventExtents === "function"
        ? options.getEventExtents(event)
        : getDomCommentPaintExtents(event);
      return extents.height * fontScale;
    })
  );
  const maxFontSize = Math.max(
    0,
    ...events.map((event) => Number(event.style && event.style.fontSize) || 0)
  );
  const clearGap = maxFontSize * DOM_ASS_FONT_SIZE_FACTOR * fontScale * laneGap;
  const laneCount = Math.max(1, Math.floor((playResY + clearGap) / (laneHeight + clearGap)));
  const pitch = laneCount > 1 ? (playResY - laneHeight) / (laneCount - 1) : 0;
  const slotTops = Array.from({ length: laneCount }, (_value, index) => Math.max(0, index * pitch));

  return {
    laneCount,
    laneHeight,
    slotHeights: Array(laneCount).fill(laneHeight),
    slotTops,
    overflow: Math.max(0, laneHeight - playResY)
  };
}

function isFixedEdgeEvent(event) {
  if (!event || !event.move || event.move.kind !== "position") {
    return false;
  }
  const vertical = Math.ceil(Number(event.style && event.style.alignment) / 3);
  return vertical !== 2;
}

function getDomCommentBlockExtents(event) {
  const fontSize = Math.max(0, Number(event && event.style ? event.style.fontSize : 0) || 0)
    * DOM_ASS_FONT_SIZE_FACTOR;
  const lineCount = Math.max(1, String(event && event.text ? event.text : "").split("\n").length);
  const height = fontSize * lineCount * DOM_COMMENT_LINE_HEIGHT;
  const verticalAlignment = Math.ceil(Number(event && event.style ? event.style.alignment : 7) / 3);
  const above = verticalAlignment === 1 ? height : verticalAlignment === 2 ? height / 2 : 0;
  return {
    above,
    below: height - above,
    height
  };
}

function getDomCommentPaintExtents(event) {
  const block = getDomCommentBlockExtents(event);
  const style = event && event.style ? event.style : {};
  const outline = Math.max(0, Number(style.outline) || 0);
  const outlineSpread = outline > 0 ? outline + DOM_STROKE_EDGE_RESERVE : 0;
  const shadow = Math.max(0, Number(style.shadow) || 0);
  return {
    above: block.above + outlineSpread,
    below: block.below + outlineSpread + shadow,
    height: block.height + (outlineSpread * 2) + shadow
  };
}

export {
  DOM_ASS_FONT_SIZE_FACTOR,
  DOM_COMMENT_LINE_HEIGHT,
  DOM_STROKE_EDGE_RESERVE,
  getDomFixedLaneLayout,
  getDomLaneLayout,
  getDomCommentBlockExtents,
  getDomCommentPaintExtents
};
