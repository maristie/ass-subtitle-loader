import {
  formatCompactNumber,
  roundNumber
} from "../shared/settings.js";

function getSubtitleStats(content, message) {
  const lines = content.split(/\r\n|\r|\n/);
  let eventCount = 0;
  let animatedEventCount = 0;
  let moveEventCount = 0;
  let styleCount = 0;
  let title = null;
  let playRes = null;

  lines.forEach((line) => {
    if (/^\s*Dialogue\s*:/i.test(line)) {
      eventCount += 1;
      if (/\\move\b/i.test(line)) {
        moveEventCount += 1;
      }
      if (/\\(?:move|t|fad|fade|k|kf|ko)\b/i.test(line)) {
        animatedEventCount += 1;
      }
      return;
    }

    if (/^\s*Style\s*:/i.test(line)) {
      styleCount += 1;
      return;
    }

    const titleMatch = line.match(/^\s*Title\s*:\s*(.+?)\s*$/i);
    if (titleMatch) {
      title = titleMatch[1];
      return;
    }

    const playResX = line.match(/^\s*PlayResX\s*:\s*(\d+)\s*$/i);
    if (playResX) {
      playRes = playRes || {};
      playRes.x = Number(playResX[1]);
      return;
    }

    const playResY = line.match(/^\s*PlayResY\s*:\s*(\d+)\s*$/i);
    if (playResY) {
      playRes = playRes || {};
      playRes.y = Number(playResY[1]);
    }
  });

  return {
    title,
    byteLength: Number(message.byteLength) || null,
    charLength: content.length,
    lineCount: lines.length,
    eventCount,
    animatedEventCount,
    moveEventCount,
    styleCount,
    playRes: playRes && playRes.x && playRes.y ? `${playRes.x}x${playRes.y}` : null
  };
}

function getAssPlayRes(content) {
  const playRes = {
    x: 384,
    y: 288
  };
  content.split(/\r\n|\r|\n/).forEach((line) => {
    const xMatch = line.match(/^\s*PlayResX\s*:\s*(\d+)\s*$/i);
    if (xMatch) {
      playRes.x = Math.max(1, Number(xMatch[1]) || playRes.x);
    }

    const yMatch = line.match(/^\s*PlayResY\s*:\s*(\d+)\s*$/i);
    if (yMatch) {
      playRes.y = Math.max(1, Number(yMatch[1]) || playRes.y);
    }
  });
  return playRes;
}

function splitAssFields(value, expectedCount) {
  if (!expectedCount) {
    return value.split(",").map((field) => field.trim());
  }

  const fields = [];
  let rest = value;
  for (let index = 1; index < expectedCount; index += 1) {
    const comma = rest.indexOf(",");
    if (comma === -1) {
      fields.push(rest.trim());
      rest = "";
      break;
    }
    fields.push(rest.slice(0, comma).trim());
    rest = rest.slice(comma + 1);
  }
  fields.push(rest.trim());
  while (fields.length < expectedCount) {
    fields.push("");
  }
  return fields;
}

function assFieldsToObject(format, fields) {
  const data = {};
  format.forEach((key, index) => {
    data[key] = fields[index] || "";
  });
  return data;
}

function normalizeAssKey(value) {
  return String(value || "").trim().toLowerCase();
}

function parseAssTime(value) {
  const match = String(value || "").trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.](\d{1,3}))?$/);
  if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) {
    return NaN;
  }

  const fraction = match[4] ? Number(`0.${match[4]}`) : 0;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]) + fraction;
}

function parseAssNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseAssBool(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number !== 0 : false;
}

function parseAssColor(value, fallback) {
  const match = String(value || "").trim().match(/^&H([0-9a-f]{6}|[0-9a-f]{8})&?$/i);
  if (!match) {
    return fallback;
  }

  const hex = match[1].length === 6 ? `00${match[1]}` : match[1];
  const alpha = parseInt(hex.slice(0, 2), 16);
  const blue = parseInt(hex.slice(2, 4), 16);
  const green = parseInt(hex.slice(4, 6), 16);
  const red = parseInt(hex.slice(6, 8), 16);
  return {
    r: red,
    g: green,
    b: blue,
    a: Math.max(0, Math.min(1, (255 - alpha) / 255))
  };
}

function withAssAlpha(color, alphaHex) {
  const alpha = parseInt(alphaHex, 16);
  if (!Number.isFinite(alpha)) {
    return color;
  }

  return {
    ...color,
    a: Math.max(0, Math.min(1, (255 - alpha) / 255))
  };
}

function formatAssNumber(value) {
  return formatCompactNumber(roundNumber(value, 3));
}

export {
  assFieldsToObject,
  formatAssNumber,
  getAssPlayRes,
  getSubtitleStats,
  normalizeAssKey,
  parseAssBool,
  parseAssColor,
  parseAssNumber,
  parseAssTime,
  splitAssFields,
  withAssAlpha
};
