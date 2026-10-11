import {
  describeFontConfig,
  resolveFontFamilyForRendering
} from "../../core/font-resolver.js";
import {
  normalizeSubtitleAdjustments,
  roundNumber
} from "../../shared/settings.js";
import {
  DOM_ASS_FONT_SIZE_FACTOR,
  DOM_COMMENT_LINE_HEIGHT,
  DOM_STROKE_EDGE_RESERVE
} from "./layout.js";
import { createDomEventSchedule } from "./scheduler.js";

class DomAssRenderer {
  constructor(options) {
    this.layer = options.layer;
    this.track = options.track;
    this.adjustments = normalizeSubtitleAdjustments(options.adjustments);
    this.fontConfig = options.fontConfig;
    this.measureText = createDomTextMeasurer(this.fontConfig);
    this.getTime = options.getTime;
    this.trace = options.trace;
    this.onError = options.onError;
    this.active = new Map();
    this.pool = [];
    this.width = 1;
    this.height = 1;
    this.rate = 1;
    this.currentTime = 0;
    this.lastTime = null;
    this.nextIndex = 0;
    this.rafId = 0;
    this.paused = true;
    this.disposed = false;
    this.lastError = null;
    this.createdCount = 0;
    this.frameCount = 0;
    this.lastSyncMs = 0;
    this.maxSyncMs = 0;
    this.refreshSchedule(1);
    this.refreshScheduleAfterFontsLoad();
  }

  refreshSchedule(horizontalTextScale) {
    this.schedule = createDomEventSchedule(this.track, this.adjustments, {
      horizontalTextScale,
      measureText: this.measureText
        ? (event, fontScale) => this.measureText(event, fontScale, horizontalTextScale)
        : null
    });
    this.laneLayout = this.schedule.movingLayout;
    this.fixedLaneLayout = this.schedule.fixedLayout;
    this.events = this.schedule.events;
    this.maxDuration = this.schedule.maxDuration;
  }

  getHorizontalTextScale() {
    const scaleX = this.width / this.track.playResX;
    const availableHeight = this.height * (
      1 - ((this.adjustments.marginTop + this.adjustments.marginBottom) / 100)
    );
    const scaleY = availableHeight / this.track.playResY;
    return scaleX > 0 ? scaleY / scaleX : 1;
  }

  refreshScheduleAfterFontsLoad() {
    if (
      !this.schedule.enabled ||
      typeof document === "undefined" ||
      !document.fonts ||
      !document.fonts.ready
    ) {
      return;
    }
    Promise.resolve(document.fonts.ready).then(() => {
      if (this.disposed) {
        return;
      }
      this.refreshSchedule(this.getHorizontalTextScale());
      this.rebuild();
    }).catch(() => {});
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.clearActive();
    this.pool.length = 0;
    if (this.layer) {
      this.layer.replaceChildren();
    }
  }

  resize(width, height) {
    const nextWidth = Math.max(1, Number(width) || 1);
    const nextHeight = Math.max(1, Number(height) || 1);
    if (this.width === nextWidth && this.height === nextHeight) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.refreshSchedule(this.getHorizontalTextScale());
    this.rebuild();
  }

  setRate(rate) {
    const nextRate = Math.max(0.05, Math.abs(Number(rate) || 1));
    if (Math.abs(this.rate - nextRate) < 0.001) {
      return;
    }

    this.rate = nextRate;
    this.rebuild();
  }

  setCurrentTime(time, force) {
    this.currentTime = normalizeRenderTime(time);
    this.sync(Boolean(force));
  }

  setIsPaused(paused, time) {
    this.paused = Boolean(paused);
    if (Number.isFinite(Number(time))) {
      this.currentTime = Number(time);
    }
    this.updateAnimationState();
    this.sync(false);
    if (this.paused) {
      this.stopLoop();
    } else {
      this.startLoop();
    }
  }

  getStats() {
    return {
      backend: "dom",
      frames: this.frameCount,
      chunks: this.active.size,
      alphaPixels: 0,
      workerMs: 0,
      drawMs: this.lastSyncMs,
      totalMs: this.lastSyncMs,
      maxMs: this.maxSyncMs,
      error: this.lastError,
      overlayType: "CSS",
      active: this.active.size,
      pooled: this.pool.length,
      events: this.events.length,
      lanes: this.laneLayout.laneCount,
      sourceLanes: this.laneLayout.sourceLaneCount,
      movingLanes: this.laneLayout.laneCount,
      fixedLanes: this.fixedLaneLayout.laneCount,
      delayed: this.schedule.delayedCount,
      queued: this.schedule.enabled
        ? this.events.filter((event) => (
          event.authoredStart <= this.currentTime && event.start > this.currentTime
        )).length
        : 0,
      maxDelay: roundNumber(this.schedule.maxDelay, 3),
      laneGap: this.adjustments.laneGap,
      fontDebug: describeFontConfig(this.fontConfig)
    };
  }

  startLoop() {
    if (this.rafId || this.disposed) {
      return;
    }

    const step = () => {
      this.rafId = 0;
      if (this.disposed || this.paused) {
        return;
      }

      try {
        if (typeof this.getTime === "function") {
          this.currentTime = normalizeRenderTime(this.getTime(), this.currentTime);
        }
        this.sync(false);
      } catch (error) {
        this.reportError(error);
        return;
      }
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  reportError(error) {
    if (this.disposed || this.lastError) {
      return;
    }
    this.lastError = error && error.message ? error.message : String(error);
    this.stopLoop();
    if (typeof this.onError === "function") {
      this.onError(error);
    }
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  sync(force) {
    if (this.disposed) {
      return;
    }

    const started = getNow();
    const time = this.currentTime;
    const jumped = this.lastTime === null || time < this.lastTime - 0.25 || Math.abs(time - this.lastTime) > 1;
    if (force || jumped) {
      this.rebuild();
    } else {
      this.removeExpired(time);
      this.addDueEvents(time);
    }
    this.updateAnimationState();
    this.lastTime = time;
    this.frameCount += 1;
    this.lastSyncMs = roundTiming(getNow() - started);
    this.maxSyncMs = Math.max(this.maxSyncMs, this.lastSyncMs);
  }

  rebuild() {
    if (this.disposed) {
      return;
    }

    const time = this.currentTime;
    this.clearActive();
    this.nextIndex = lowerBoundEventStart(this.events, time);
    const earliestPossibleStart = time - this.maxDuration - 0.001;
    for (let index = this.nextIndex - 1; index >= 0; index -= 1) {
      const event = this.events[index];
      if (event.start < earliestPossibleStart) {
        break;
      }
      if (event.end > time) {
        this.addActive(event, time);
      }
    }
    this.addDueEvents(time);
    this.updateAnimationState();
  }

  addDueEvents(time) {
    while (this.nextIndex < this.events.length && this.events[this.nextIndex].start <= time) {
      const event = this.events[this.nextIndex];
      if (event.end > time) {
        this.addActive(event, time);
      }
      this.nextIndex += 1;
    }
  }

  addActive(event, time) {
    if (this.active.has(event.id)) {
      return;
    }

    const element = this.pool.pop() || document.createElement("div");
    element.className = "ass-subtitle-loader-dom-comment";
    element.textContent = event.text;
    // Pause the animation while measuring so the sampled transform and the
    // media-time progress used by the containment pass cannot drift apart.
    this.applyEventStyle(element, event, time, 1, "paused");
    this.layer.appendChild(element);
    this.constrainEventPaint(element, event, time);
    element.style.animationPlayState = this.paused ? "paused" : "running";
    this.active.set(event.id, {
      event,
      element
    });
    this.createdCount += 1;
  }

  applyEventStyle(element, event, time, fitScale = 1, animationState = null) {
    const scaleX = this.width / this.track.playResX;
    const style = event.style;
    const paddingTop = this.height * this.adjustments.marginTop / 100;
    const paddingBottom = this.height * this.adjustments.marginBottom / 100;
    const availableHeight = Math.max(1, this.height - paddingTop - paddingBottom);
    // Scheduling is adjustment-only. At 100% font and zero gap this remains
    // exactly zero, preserving authored ASS coordinates. Adjusted moving and
    // edge-fixed comments carry a precomputed collision-safe lane offset.
    const laneOffset = Number.isFinite(event.scheduledLaneOffset)
      ? event.scheduledLaneOffset
      : 0;
    const scaleY = availableHeight / this.track.playResY;
    const safeFitScale = Math.max(0.000001, Number(fitScale) || 1);
    const textScale = scaleY * this.adjustments.fontScale * safeFitScale;
    const fontSize = Math.max(
      0,
      roundCssPixel(style.fontSize * DOM_ASS_FONT_SIZE_FACTOR * textScale)
    );
    const move = event.move;
    const wrapsFixedLine = isFixedEdgePosition(move, style.alignment);
    element.classList.toggle("ass-subtitle-loader-dom-fixed-wrap", wrapsFixedLine);
    const moveDuration = Math.max(0.001, move.end - move.start);
    const animationDuration = moveDuration / this.rate;
    const animationDelay = (event.start + move.start - time) / this.rate;
    const mapY = (value) => paddingTop + ((value + laneOffset) * scaleY);
    const startY = mapY(move.y1);
    const endY = mapY(move.y2);

    element.style.setProperty("--ass-start-x", `${roundCssPixel(move.x1 * scaleX)}px`);
    element.style.setProperty("--ass-start-y", `${roundCssPixel(startY)}px`);
    element.style.setProperty("--ass-end-x", `${roundCssPixel(move.x2 * scaleX)}px`);
    element.style.setProperty("--ass-end-y", `${roundCssPixel(endY)}px`);
    const anchor = getAssAlignmentAnchor(style.alignment);
    if (wrapsFixedLine) {
      const authoredLineCount = getAuthoredLineCount(event.text);
      anchor.y = getInwardFixedWrapAnchorY(
        startY,
        paddingTop,
        this.height - paddingBottom,
        style.alignment,
        anchor.y,
        authoredLineCount,
        fontSize * DOM_COMMENT_LINE_HEIGHT * authoredLineCount
      );
    }
    element.style.setProperty("--ass-anchor-x", anchor.x);
    element.style.setProperty("--ass-anchor-y", anchor.y);
    if (wrapsFixedLine) {
      element.style.setProperty("--ass-wrap-width", `${roundCssPixel(getFixedWrapWidth(
        move.x1 * scaleX,
        style.alignment,
        this.width
      ))}px`);
      element.style.setProperty("--ass-text-align", anchor.textAlign);
    }
    element.style.animationDuration = `${animationDuration}s`;
    element.style.animationDelay = `${animationDelay}s`;
    element.style.animationPlayState = animationState || (this.paused ? "paused" : "running");
    element.style.opacity = String(roundNumber(style.primaryColor.a * this.adjustments.opacity, 3));
    element.style.color = colorToCss({ ...style.primaryColor, a: 1 });
    element.style.fontFamily = formatCssFontFamily(resolveFontFamilyForRendering(this.fontConfig, style.fontName));
    element.style.fontSize = `${fontSize}px`;
    element.style.fontWeight = style.bold ? "700" : "400";
    element.style.fontStyle = style.italic ? "italic" : "normal";
    element.style.textDecoration = getTextDecoration(style);
    // ASS outline/shadow are script-space lengths, not font-em metrics, so they
    // intentionally use textScale without DOM_ASS_FONT_SIZE_FACTOR.
    element.style.webkitTextStroke = buildTextStroke(style, textScale);
    element.style.textShadow = buildTextShadow(style, textScale);
  }

  constrainEventPaint(element, event, time) {
    if (!element || !this.layer || typeof element.getBoundingClientRect !== "function") {
      return;
    }

    const layerRect = this.layer.getBoundingClientRect();
    if (!(layerRect.width > 0) || !(layerRect.height > 0)) {
      return;
    }

    const contentTop = layerRect.height * this.adjustments.marginTop / 100;
    const contentBottom = layerRect.height * (1 - (this.adjustments.marginBottom / 100));
    const contentHeight = Math.max(1, contentBottom - contentTop);
    const mustFitHorizontally = event.move.kind === "position";
    let fitScale = 1;
    let metrics = measureDomEventPaint(element, this.layer, event, time, layerRect);

    // Wrapping can change discretely as the font shrinks, so remeasure after
    // every adjustment instead of assuming the paint box scales linearly.
    for (let attempt = 0; metrics && attempt < 12; attempt += 1) {
      const verticalRatio = contentHeight / Math.max(0.000001, metrics.paintHeight);
      const horizontalRatio = mustFitHorizontally
        ? layerRect.width / Math.max(0.000001, metrics.paintWidth)
        : 1;
      const ratio = Math.min(1, verticalRatio, horizontalRatio);
      if (ratio >= 0.999999) {
        break;
      }

      const nextFitScale = fitScale * Math.max(0.000001, Math.min(0.98, ratio * 0.98));
      if (!(nextFitScale < fitScale - 0.0000001)) {
        break;
      }
      fitScale = nextFitScale;
      this.applyEventStyle(element, event, time, fitScale, "paused");
      metrics = measureDomEventPaint(element, this.layer, event, time, layerRect);
    }

    if (!metrics) {
      return;
    }

    const startY = containDomAxisCoordinate(
      metrics.startY,
      metrics.paintTopOffset,
      metrics.paintBottomOffset,
      contentTop,
      contentBottom
    );
    const endY = containDomAxisCoordinate(
      metrics.endY,
      metrics.paintTopOffset,
      metrics.paintBottomOffset,
      contentTop,
      contentBottom
    );
    element.style.setProperty("--ass-start-y", `${roundCssPixel(startY)}px`);
    element.style.setProperty("--ass-end-y", `${roundCssPixel(endY)}px`);

    // Horizontal motion intentionally enters and exits through the clipped
    // layer edges. Fixed-position cues, however, must keep their complete
    // painted box (including stroke, shadow, and glyph overhang) in frame.
    if (mustFitHorizontally) {
      const startX = containDomAxisCoordinate(
        metrics.startX,
        metrics.paintLeftOffset,
        metrics.paintRightOffset,
        0,
        layerRect.width
      );
      const endX = containDomAxisCoordinate(
        metrics.endX,
        metrics.paintLeftOffset,
        metrics.paintRightOffset,
        0,
        layerRect.width
      );
      element.style.setProperty("--ass-start-x", `${roundCssPixel(startX)}px`);
      element.style.setProperty("--ass-end-x", `${roundCssPixel(endX)}px`);
    }

    element.dataset.assFitScale = String(roundNumber(fitScale, 6));
  }

  removeExpired(time) {
    this.active.forEach((entry, id) => {
      if (entry.event.end <= time || entry.event.start > time + 0.25) {
        this.releaseActive(id);
      }
    });
  }

  releaseActive(id) {
    const entry = this.active.get(id);
    if (!entry) {
      return;
    }

    this.active.delete(id);
    entry.element.remove();
    entry.element.textContent = "";
    entry.element.removeAttribute("style");
    if (this.pool.length < 200) {
      this.pool.push(entry.element);
    }
  }

  clearActive() {
    Array.from(this.active.keys()).forEach((id) => this.releaseActive(id));
  }

  updateAnimationState() {
    const state = this.paused ? "paused" : "running";
    this.active.forEach((entry) => {
      entry.element.style.animationPlayState = state;
    });
  }
}

function measureDomEventPaint(element, layer, event, time, knownLayerRect = null) {
  const rect = element.getBoundingClientRect();
  const layerRect = knownLayerRect || layer.getBoundingClientRect();
  const startX = readCssPixelProperty(element, "--ass-start-x");
  const endX = readCssPixelProperty(element, "--ass-end-x");
  const startY = readCssPixelProperty(element, "--ass-start-y");
  const endY = readCssPixelProperty(element, "--ass-end-y");
  if (![startX, endX, startY, endY, rect.width, rect.height].every(Number.isFinite)) {
    return null;
  }

  const progress = getDomMoveProgress(event, time);
  const currentX = startX + ((endX - startX) * progress);
  const currentY = startY + ((endY - startY) * progress);
  const boxLeftOffset = rect.left - layerRect.left - currentX;
  const boxTopOffset = rect.top - layerRect.top - currentY;
  const computed = getComputedStyle(element);
  const strokeRadius = Math.max(0, (parseFloat(computed.webkitTextStrokeWidth) || 0) / 2);
  const shadow = readDomTextShadow(computed.textShadow);
  const fontSize = Math.max(0, parseFloat(computed.fontSize) || 0);
  const edgeReserve = DOM_STROKE_EDGE_RESERVE * 0.5;
  // Element bounds describe CSS line boxes, not every glyph's ink. Reserve a
  // small em fraction for italic/curved overhang in addition to stroke/shadow.
  const horizontalGlyphReserve = Math.max(edgeReserve, fontSize * (computed.fontStyle === "italic" ? 0.12 : 0.02));
  const verticalGlyphReserve = Math.max(edgeReserve, fontSize * 0.02);
  const leftPaint = strokeRadius + shadow.blur + Math.max(0, -shadow.x) + horizontalGlyphReserve;
  const rightPaint = strokeRadius + shadow.blur + Math.max(0, shadow.x) + horizontalGlyphReserve;
  const topPaint = strokeRadius + shadow.blur + Math.max(0, -shadow.y) + verticalGlyphReserve;
  const bottomPaint = strokeRadius + shadow.blur + Math.max(0, shadow.y) + verticalGlyphReserve;
  const paintLeftOffset = boxLeftOffset - leftPaint;
  const paintRightOffset = boxLeftOffset + rect.width + rightPaint;
  const paintTopOffset = boxTopOffset - topPaint;
  const paintBottomOffset = boxTopOffset + rect.height + bottomPaint;

  return {
    startX,
    endX,
    startY,
    endY,
    paintLeftOffset,
    paintRightOffset,
    paintTopOffset,
    paintBottomOffset,
    paintWidth: paintRightOffset - paintLeftOffset,
    paintHeight: paintBottomOffset - paintTopOffset
  };
}

function getDomMoveProgress(event, time) {
  const move = event && event.move ? event.move : {};
  const moveStart = Math.max(0, Number(move.start) || 0);
  const moveEnd = Math.max(moveStart + 0.001, Number(move.end) || moveStart);
  const elapsed = (Number(time) || 0) - (Number(event && event.start) || 0);
  return Math.max(0, Math.min(1, (elapsed - moveStart) / (moveEnd - moveStart)));
}

function containDomAxisCoordinate(value, paintStartOffset, paintEndOffset, boundaryStart, boundaryEnd) {
  if (![value, paintStartOffset, paintEndOffset, boundaryStart, boundaryEnd].every(Number.isFinite)) {
    return value;
  }
  const minimum = boundaryStart - paintStartOffset;
  const maximum = boundaryEnd - paintEndOffset;
  if (minimum > maximum) {
    return (minimum + maximum) / 2;
  }
  return Math.max(minimum, Math.min(maximum, value));
}

function readCssPixelProperty(element, name) {
  return parseFloat(element.style.getPropertyValue(name));
}

function readDomTextShadow(value) {
  if (!value || value === "none") {
    return { x: 0, y: 0, blur: 0 };
  }
  const lengths = Array.from(
    String(value).matchAll(/(-?(?:\d+(?:\.\d+)?|\.\d+))px/g),
    (match) => Number(match[1])
  );
  return {
    x: Number.isFinite(lengths[0]) ? lengths[0] : 0,
    y: Number.isFinite(lengths[1]) ? lengths[1] : 0,
    blur: Number.isFinite(lengths[2]) ? Math.max(0, lengths[2]) : 0
  };
}

function lowerBoundEventStart(events, time) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (events[mid].start <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function roundCssPixel(value) {
  return Math.round(value * 1000) / 1000;
}

function roundTiming(value) {
  return Math.round(Math.max(0, Number(value) || 0) * 10) / 10;
}

function getNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function normalizeRenderTime(value, fallback = 0) {
  const time = Number(value);
  return Number.isFinite(time) ? time : fallback;
}

function createDomTextMeasurer(fontConfig) {
  let context = null;
  try {
    const canvas = document.createElement("canvas");
    context = canvas.getContext("2d");
  } catch (_error) {
    return null;
  }
  if (!context) {
    return null;
  }

  return (event, fontScale, horizontalTextScale = 1) => {
    const style = event.style || {};
    const fontSize = Math.max(
      0,
      (Number(style.fontSize) || 0)
        * DOM_ASS_FONT_SIZE_FACTOR
        * fontScale
        * horizontalTextScale
    );
    const fontStyle = style.italic ? "italic" : "normal";
    const fontWeight = style.bold ? "700" : "400";
    const fontFamily = formatCssFontFamily(resolveFontFamilyForRendering(fontConfig, style.fontName));
    context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const measured = String(event.text || "").split("\n").map((line) => {
      const metrics = context.measureText(line);
      const inkWidth = Math.max(
        0,
        (Number(metrics.actualBoundingBoxLeft) || 0) +
          (Number(metrics.actualBoundingBoxRight) || 0)
      );
      return Math.max(metrics.width, inkWidth) + (fontSize * 0.1);
    });
    return Math.max(
      0,
      ...measured
    );
  };
}

function getTextDecoration(style) {
  const values = [];
  if (style.underline) {
    values.push("underline");
  }
  if (style.strikeOut) {
    values.push("line-through");
  }
  return values.length ? values.join(" ") : "none";
}

function getAssAlignmentAnchor(alignment) {
  const horizontal = alignment % 3;
  const vertical = Math.ceil(alignment / 3);
  return {
    x: horizontal === 1 ? "0" : horizontal === 2 ? "-50%" : "-100%",
    y: vertical === 1 ? "-100%" : vertical === 2 ? "-50%" : "0",
    textAlign: horizontal === 1 ? "left" : horizontal === 2 ? "center" : "right"
  };
}

function isFixedEdgePosition(move, alignment) {
  const vertical = Math.ceil(alignment / 3);
  return move.kind === "position" && vertical !== 2;
}

function getAuthoredLineCount(text) {
  return Math.max(1, String(text || "").split("\n").length);
}

function getInwardFixedWrapAnchorY(
  y,
  contentTop,
  contentBottom,
  alignment,
  authoredAnchorY,
  authoredLineCount,
  authoredBlockHeight
) {
  const vertical = Math.ceil(alignment / 3);
  const lineSpan = `${Math.max(1, Number(authoredLineCount) || 1)}lh`;
  const blockHeight = Math.max(0, Number(authoredBlockHeight) || 0);
  const authoredTop = vertical === 1 ? y - blockHeight : y;
  const authoredBottom = vertical === 1 ? y : y + blockHeight;
  const roomAbove = authoredTop - contentTop;
  const roomBelow = contentBottom - authoredBottom;

  // Some danmaku generators use bottom alignment for both edges and place the
  // first top row by its lower edge. Preserve the authored line envelope, but
  // let any lines introduced by CSS wrapping grow toward the roomier side.
  // With no automatic wrapping these expressions reduce to the authored ASS
  // anchor, including events that already contain explicit line breaks.
  if (roomBelow > roomAbove && vertical === 1) {
    return `-${lineSpan}`;
  }
  if (roomAbove > roomBelow && vertical === 3) {
    return `calc(-100% + ${lineSpan})`;
  }
  return authoredAnchorY;
}

function getFixedWrapWidth(x, alignment, width) {
  // Keep the ASS anchor fixed while limiting the block to the space on its
  // aligned side, with a small readability margin for normal edge positions.
  const safeX = Math.min(width, Math.max(0, x));
  const horizontal = alignment % 3;
  const availableWidth = horizontal === 1
    ? width - safeX
    : horizontal === 2
      ? 2 * Math.min(safeX, width - safeX)
      : safeX;
  return Math.max(1, Math.min(width * 0.9, availableWidth));
}

function buildTextStroke(style, scale) {
  const outline = Math.max(0, style.outline * scale);
  if (outline <= 0) {
    return "0 transparent";
  }

  // CSS centers a stroke on the glyph edge, while ASS Outline is an outward
  // radius. Doubling makes the outside half match ASS; paint-order hides the
  // inside half behind the glyph fill.
  return `${roundCssPixel(outline * 2)}px ${colorToCss(style.outlineColor)}`;
}

function buildTextShadow(style, scale) {
  const shadow = Math.max(0, style.shadow * scale);
  if (shadow <= 0) {
    return "none";
  }

  const offset = roundCssPixel(shadow);
  return `${offset}px ${offset}px 0 ${colorToCss(style.shadowColor)}`;
}

function colorToCss(color) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(color.a * 1000) / 1000})`;
}

function formatCssFontFamily(fontName) {
  const sanitized = String(fontName || "sans-serif").replace(/["\\\n\r]/g, "").trim();
  if (!sanitized) {
    return "sans-serif";
  }

  return `"${sanitized}", sans-serif`;
}

export {
  DomAssRenderer
};
