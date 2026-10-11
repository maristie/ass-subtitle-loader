import {
  assFieldsToObject,
  normalizeAssKey,
  parseAssBool,
  parseAssColor,
  parseAssNumber,
  parseAssTime,
  splitAssFields,
  withAssAlpha
} from "../../core/ass-parser.js";
import { roundNumber } from "../../shared/settings.js";
import {
  getDomCommentBlockExtents,
  getDomCommentPaintExtents
} from "./layout.js";

function parseDomAssTrack(content) {
  const lines = content.split(/\r\n|\r|\n/);
  const styles = new Map();
  const events = [];
  const unsupported = [];
  let section = "";
  let styleFormat = null;
  let eventFormat = null;
  let playResX = 384;
  let playResY = 288;

  styles.set("Default", createDefaultAssStyle());

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) {
      return;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase();
      return;
    }

    if (section === "script info") {
      const playResXMatch = trimmed.match(/^PlayResX\s*:\s*(\d+)\s*$/i);
      if (playResXMatch) {
        playResX = Math.max(1, Number(playResXMatch[1]) || playResX);
        return;
      }

      const playResYMatch = trimmed.match(/^PlayResY\s*:\s*(\d+)\s*$/i);
      if (playResYMatch) {
        playResY = Math.max(1, Number(playResYMatch[1]) || playResY);
      }
      return;
    }

    if (section === "v4+ styles" || section === "v4 styles") {
      const formatMatch = line.match(/^\s*Format\s*:\s*(.+)$/i);
      if (formatMatch) {
        styleFormat = splitAssFields(formatMatch[1]).map(normalizeAssKey);
        return;
      }

      const styleMatch = line.match(/^\s*Style\s*:\s*(.+)$/i);
      if (styleMatch && styleFormat) {
        const style = parseAssStyle(styleMatch[1], styleFormat);
        if (style && style.name) {
          styles.set(style.name, style);
        }
      }
      return;
    }

    if (section === "events") {
      const formatMatch = line.match(/^\s*Format\s*:\s*(.+)$/i);
      if (formatMatch) {
        eventFormat = splitAssFields(formatMatch[1]).map(normalizeAssKey);
        return;
      }

      const dialogueMatch = line.match(/^\s*Dialogue\s*:\s*(.+)$/i);
      if (dialogueMatch && eventFormat) {
        const parsed = parseDomAssEvent(dialogueMatch[1], eventFormat, styles, events.length);
        if (parsed.event) {
          events.push(parsed.event);
        } else if (parsed.empty) {
          // Generated comment files sometimes include blank timed entries.
        } else {
          unsupported.push(`line ${index + 1}: ${parsed.reason}`);
        }
      }
    }
  });

  events.sort((a, b) => a.start - b.start || a.end - b.end);
  const laneInfo = assignDomAssLanes(events);
  const maxDuration = events.reduce((max, event) => Math.max(max, event.end - event.start), 0);
  const reason = unsupported.length
    ? unsupported[0]
    : events.length
      ? "simple moving or fixed comments"
      : "no supported moving or fixed comment events";

  return {
    supported: unsupported.length === 0 && events.length > 0,
    reason,
    events,
    maxDuration,
    maxLaneIndex: laneInfo.maxIndex,
    minLaneKey: laneInfo.minKey,
    laneOrigin: laneInfo.origin,
    lanePitch: laneInfo.pitch,
    laneBounds: laneInfo.bounds,
    maxLaneFontSize: laneInfo.maxFontSize,
    maxLaneBlockHeight: laneInfo.maxBlockHeight,
    playResX,
    playResY
  };
}

function assignDomAssLanes(events) {
  const placements = new Map(events.map((event) => [event, getDomAssLanePlacement(event)]));
  const laneKeys = Array.from(new Set(
    Array.from(placements.values(), (placement) => placement ? placement.key : null)
      .filter((key) => key !== null)
  )).sort((a, b) => a - b);
  const grid = inferDomAssLaneGrid(placements);
  const rawSlots = laneKeys.map((key, rank) => (
    grid ? Math.round((key - grid.origin) / grid.pitch) : rank
  ));
  const occupiedSlots = Array.from(new Set(rawSlots)).sort((left, right) => left - right);
  const slotIndexes = new Map(occupiedSlots.map((slot, index) => [slot, index]));
  const laneIndexes = new Map(laneKeys.map((key, rank) => [key, slotIndexes.get(rawSlots[rank])]));
  const minLaneKey = laneKeys.length ? laneKeys[0] : 0;
  const laneBounds = Array.from(
    { length: Math.max(0, ...laneIndexes.values()) + 1 },
    () => ({ top: Infinity, height: 0 })
  );
  let maxFontSize = 0;
  let maxBlockHeight = 0;
  events.forEach((event) => {
    const placement = placements.get(event);
    event.laneIndex = placement ? laneIndexes.get(placement.key) || 0 : 0;
    event.laneKey = placement ? placement.key : null;
    event.laneAnchor = placement ? placement.anchor : null;
    if (placement) {
      const extents = getDomCommentPaintExtents(event);
      const bounds = laneBounds[event.laneIndex];
      bounds.top = Math.min(bounds.top, placement.anchor - extents.above);
      bounds.height = Math.max(bounds.height, extents.height);
      maxFontSize = Math.max(maxFontSize, event.style ? event.style.fontSize || 0 : 0);
      maxBlockHeight = Math.max(maxBlockHeight, getDomCommentBlockExtents(event).height);
    }
  });
  events.forEach((event) => {
    const placement = placements.get(event);
    if (!placement) {
      event.laneAlignOffset = 0;
      return;
    }
    const extents = getDomCommentPaintExtents(event);
    event.laneAlignOffset = roundNumber(
      laneBounds[event.laneIndex].top - (placement.anchor - extents.above),
      3
    );
  });

  return {
    maxIndex: Math.max(0, ...laneIndexes.values()),
    minKey: minLaneKey,
    origin: minLaneKey,
    pitch: grid ? grid.pitch : null,
    bounds: laneBounds.map((bounds) => ({
      top: roundNumber(Number.isFinite(bounds.top) ? bounds.top : minLaneKey, 3),
      bottom: roundNumber(
        Number.isFinite(bounds.top) ? bounds.top + bounds.height : minLaneKey,
        3
      )
    })),
    maxFontSize: maxFontSize || 25,
    maxBlockHeight: maxBlockHeight || 25
  };
}

function inferDomAssLaneGrid(placements) {
  const counts = new Map();
  placements.forEach((placement) => {
    if (placement) {
      counts.set(placement.key, (counts.get(placement.key) || 0) + 1);
    }
  });
  const coordinates = Array.from(counts.keys()).sort((left, right) => left - right);
  if (coordinates.length < 3 || coordinates.length > 512) {
    return null;
  }

  const candidates = new Map();
  coordinates.forEach((coordinate, index) => {
    for (let nextIndex = index + 1; nextIndex < coordinates.length; nextIndex += 1) {
      const next = coordinates[nextIndex];
      const pitch = roundNumber(next - coordinate, 1);
      const candidate = candidates.get(pitch) || { pitch, score: 0, steps: 0 };
      candidate.score += Math.min(counts.get(coordinate), counts.get(next));
      candidate.steps += 1;
      candidates.set(pitch, candidate);
    }
  });
  let best = null;
  candidates.forEach((candidate) => {
    if (
      !best || candidate.score > best.score ||
      (candidate.score === best.score && candidate.steps > best.steps) ||
      (candidate.score === best.score && candidate.steps === best.steps && candidate.pitch < best.pitch)
    ) {
      best = candidate;
    }
  });
  if (!best || best.steps < 2 || best.pitch <= 0) {
    return null;
  }

  const origin = coordinates.slice().sort((left, right) => (
    counts.get(right) - counts.get(left) || left - right
  ))[0];
  const snapLimit = best.pitch * 0.45;
  let exactWeight = 0;
  let totalWeight = 0;
  const fits = coordinates.every((coordinate) => {
    const slot = Math.round((coordinate - origin) / best.pitch);
    const distance = Math.abs(coordinate - (origin + (slot * best.pitch)));
    const weight = counts.get(coordinate);
    totalWeight += weight;
    if (distance <= best.pitch * 0.1) {
      exactWeight += weight;
    }
    return distance < snapLimit;
  });
  return fits && exactWeight >= totalWeight * 0.8
    ? { origin, pitch: best.pitch }
    : null;
}

function getDomAssLanePlacement(event) {
  const anchor = getDomAssLaneAnchor(event);
  if (anchor === null) {
    return null;
  }
  return {
    anchor,
    // ASS positions use the selected alignment as their anchor. Converting each
    // event to its authored block start groups mixed font sizes without moving
    // the raw authored anchor.
    key: getDomAssLaneCoordinate(event, anchor)
  };
}

function getDomAssLaneCoordinate(event, anchor) {
  const fontSize = Math.max(0, Number(event.style ? event.style.fontSize : 0) || 0);
  const lineCount = Math.max(1, String(event.text || "").split("\n").length);
  const nominalHeight = fontSize * lineCount;
  const verticalAlignment = getDomVerticalAlignment(event.style);
  const nominalAbove = verticalAlignment === 1
    ? nominalHeight
    : verticalAlignment === 2
      ? nominalHeight / 2
      : 0;
  return roundNumber(anchor - nominalAbove, 1);
}

function getDomAssLaneAnchor(event) {
  if (!event || !event.move || event.move.kind !== "move") {
    return null;
  }

  return roundNumber((event.move.y1 + event.move.y2) / 2, 1);
}

function getDomVerticalAlignment(style) {
  return Math.ceil(Number(style ? style.alignment : 7) / 3);
}

function parseDomAssEvent(value, format, styles, id) {
  const fields = splitAssFields(value, format.length);
  const data = assFieldsToObject(format, fields);
  const start = parseAssTime(data.start);
  const end = parseAssTime(data.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      reason: "invalid event time"
    };
  }

  const styleName = data.style || "Default";
  const baseStyle = styles.get(styleName) || styles.get("Default");
  if (!baseStyle) {
    return {
      reason: "missing event style"
    };
  }

  if (!styles.has(styleName)) return {reason: "missing event style"};
  const styleReason = getDomStyleUnsupportedReason(baseStyle);
  if (styleReason) {
    return {
      reason: styleReason
    };
  }

  const parsedText = parseDomAssText(data.text || "", baseStyle, end - start);
  if (parsedText.empty) {
    return {
      empty: true
    };
  }

  if (!parsedText.event) {
    return {
      reason: parsedText.reason
    };
  }

  return {
    event: {
      id,
      start,
      end,
      text: parsedText.event.text,
      move: parsedText.event.move,
      style: parsedText.event.style
    }
  };
}

function parseDomAssText(rawText, baseStyle, eventDuration) {
  // This parser is intentionally conservative. It only accepts ASS events that
  // can be represented as compositor-driven text. Other tracks are rejected.
  if (/[{}]/.test(rawText.replace(/\{[^{}]*\}/g, ""))) return {reason: "malformed override block"};
  const tagBlocks = [];
  let cursor = 0;
  let hasVisibleText = false;
  for (const match of rawText.matchAll(/\{([^}]*)\}/g)) {
    hasVisibleText = hasVisibleText || containsVisibleAssText(rawText.slice(cursor, match.index));
    const block = match[1];
    if (hasVisibleText && hasDomOverrideTag(block)) {
      return {
        reason: "override tags appear after visible text"
      };
    }
    tagBlocks.push(block);
    cursor = match.index + match[0].length;
  }

  const tagText = tagBlocks.join("");
  const moveMatches = Array.from(tagText.matchAll(/\\move\s*\(([^)]*)\)/ig));
  const posMatches = Array.from(tagText.matchAll(/\\pos\s*\(([^)]*)\)/ig));
  if (moveMatches.length + posMatches.length !== 1) {
    return {
      reason: "event is not a single simple move or position"
    };
  }

  const move = moveMatches.length
    ? parseAssMove(moveMatches[0][1], eventDuration)
    : parseAssPosition(posMatches[0][1], eventDuration);
  if (!move) {
    return {
      reason: "invalid move or position tag"
    };
  }

  const style = cloneAssStyle(baseStyle);
  let alignment = style.alignment;
  let remaining = tagText;
  const consume = (regex, callback) => {
    remaining = remaining.replace(regex, (...args) => {
      callback(...args);
      return "";
    });
  };

  consume(/\\move\s*\(([^)]*)\)/ig, () => {});
  consume(/\\pos\s*\(([^)]*)\)/ig, () => {});
  consume(/\\bord\s*([+-]?\d+(?:\.\d+)?)(?![\w.])/ig, (_match, value) => {
    style.outline = parseAssNumber(value, style.outline);
  });
  consume(/\\shad\s*([+-]?\d+(?:\.\d+)?)(?![\w.])/ig, (_match, value) => {
    style.shadow = parseAssNumber(value, style.shadow);
  });
  consume(/\\fs\s*([+-]?\d+(?:\.\d+)?)(?![\w.])/ig, (_match, value) => {
    style.fontSize = parseAssNumber(value, style.fontSize);
  });
  consume(/\\fn([^\\}]*)/ig, (_match, value) => {
    const fontName = value.trim();
    if (fontName) {
      style.fontName = fontName;
    }
  });
  consume(/\\b(?![A-Za-z])(-?\d+)?(?![\w.])/ig, (_match, value) => {
    style.bold = value === undefined || value === "" ? true : parseAssBool(value);
  });
  consume(/\\i(?![A-Za-z])(-?\d+)?(?![\w.])/ig, (_match, value) => {
    style.italic = value === undefined || value === "" ? true : parseAssBool(value);
  });
  consume(/\\u(?![A-Za-z])(-?\d+)?(?![\w.])/ig, (_match, value) => {
    style.underline = value === undefined || value === "" ? true : parseAssBool(value);
  });
  consume(/\\s(?![A-Za-z])(-?\d+)?(?![\w.])/ig, (_match, value) => {
    style.strikeOut = value === undefined || value === "" ? true : parseAssBool(value);
  });
  consume(/\\(?:1c|c)\s*&H([0-9a-f]{6}|[0-9a-f]{8})&?(?![0-9a-f])/ig, (_match, value) => {
    style.primaryColor = parseAssColor(`&H${value}`, style.primaryColor);
  });
  consume(/\\3c\s*&H([0-9a-f]{6}|[0-9a-f]{8})&?(?![0-9a-f])/ig, (_match, value) => {
    style.outlineColor = parseAssColor(`&H${value}`, style.outlineColor);
  });
  consume(/\\4c\s*&H([0-9a-f]{6}|[0-9a-f]{8})&?(?![0-9a-f])/ig, (_match, value) => {
    style.shadowColor = parseAssColor(`&H${value}`, style.shadowColor);
  });
  consume(/\\(?:alpha|1a)\s*&H([0-9a-f]{2})&?(?![0-9a-f])/ig, (_match, value) => {
    style.primaryColor = withAssAlpha(style.primaryColor, value);
  });
  consume(/\\3a\s*&H([0-9a-f]{2})&?(?![0-9a-f])/ig, (_match, value) => {
    style.outlineColor = withAssAlpha(style.outlineColor, value);
  });
  consume(/\\4a\s*&H([0-9a-f]{2})&?(?![0-9a-f])/ig, (_match, value) => {
    style.shadowColor = withAssAlpha(style.shadowColor, value);
  });
  consume(/\\an([1-9])(?![0-9])/ig, (_match, value) => {
    alignment = Number(value);
  });

  if (!Number.isInteger(alignment) || alignment < 1 || alignment > 9) {
    return {
      reason: "invalid alignment"
    };
  }
  style.alignment = alignment;
  if (style.fontSize <= 0 || style.outline < 0 || style.shadow < 0) return {reason: "invalid style dimensions"};

  const leftover = remaining.replace(/\s+/g, "");
  if (leftover.includes("\\")) {
    return {
      reason: "unsupported override tag"
    };
  }

  const text = rawText
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\h/g, "\u00a0");

  if (!text.trim()) {
    return {
      empty: true
    };
  }

  return {
    event: {
      text,
      move,
      style
    }
  };
}

function getDomStyleUnsupportedReason(style) {
  if (style.borderStyle !== 1) {
    return "style uses opaque box borders";
  }

  if (style.angle !== 0 || style.scaleX !== 100 || style.scaleY !== 100 || style.spacing !== 0) {
    return "style uses transform or spacing";
  }

  return null;
}

function parseAssMove(value, eventDuration) {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 && parts.length !== 6) {
    return null;
  }

  if (value.split(",").some(part => !part.trim()) || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const moveStart = parts.length === 6 ? Math.max(0, parts[4] / 1000) : 0;
  const moveEnd = parts.length === 6 ? Math.max(moveStart, parts[5] / 1000) : eventDuration;
  if (moveEnd <= moveStart) {
    return null;
  }

  return {
    kind: "move",
    x1: parts[0],
    y1: parts[1],
    x2: parts[2],
    y2: parts[3],
    start: moveStart,
    end: Math.min(eventDuration, moveEnd)
  };
}

function parseAssPosition(value, eventDuration) {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || value.split(",").some(part => !part.trim()) || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  return {
    kind: "position",
    x1: parts[0],
    y1: parts[1],
    x2: parts[0],
    y2: parts[1],
    start: 0,
    end: Math.max(0.001, eventDuration)
  };
}

function containsVisibleAssText(value) {
  return value
    .replace(/\\[Nnh]/g, "")
    .replace(/\s+/g, "")
    .length > 0;
}

function hasDomOverrideTag(block) {
  return /\\[A-Za-z0-9]/.test(block);
}

function parseAssStyle(value, format) {
  const fields = splitAssFields(value, format.length);
  const data = assFieldsToObject(format, fields);
  return {
    name: data.name || fields[0] || "Default",
    fontName: data.fontname || "sans-serif",
    fontSize: parseAssNumber(data.fontsize, 25),
    primaryColor: parseAssColor(data.primarycolour, { r: 255, g: 255, b: 255, a: 1 }),
    outlineColor: parseAssColor(data.outlinecolour, { r: 0, g: 0, b: 0, a: 1 }),
    shadowColor: parseAssColor(data.backcolour, { r: 0, g: 0, b: 0, a: 0.75 }),
    bold: parseAssBool(data.bold),
    italic: parseAssBool(data.italic),
    underline: parseAssBool(data.underline),
    strikeOut: parseAssBool(data.strikeout),
    scaleX: parseAssNumber(data.scalex, 100),
    scaleY: parseAssNumber(data.scaley, 100),
    spacing: parseAssNumber(data.spacing, 0),
    angle: parseAssNumber(data.angle, 0),
    borderStyle: Math.round(parseAssNumber(data.borderstyle, 1)),
    outline: parseAssNumber(data.outline, 2),
    shadow: parseAssNumber(data.shadow, 0),
    alignment: Math.round(parseAssNumber(data.alignment, 2))
  };
}

function createDefaultAssStyle() {
  return {
    name: "Default",
    fontName: "sans-serif",
    fontSize: 25,
    primaryColor: { r: 255, g: 255, b: 255, a: 1 },
    outlineColor: { r: 0, g: 0, b: 0, a: 1 },
    shadowColor: { r: 0, g: 0, b: 0, a: 0.75 },
    bold: false,
    italic: false,
    underline: false,
    strikeOut: false,
    scaleX: 100,
    scaleY: 100,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 0,
    alignment: 7
  };
}

function cloneAssStyle(style) {
  return {
    ...style,
    primaryColor: { ...style.primaryColor },
    outlineColor: { ...style.outlineColor },
    shadowColor: { ...style.shadowColor }
  };
}

export {
  parseDomAssTrack
};
