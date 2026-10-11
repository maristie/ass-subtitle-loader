const subtitleAdjustmentFields = [
  {
    key: "fontScale",
    inputId: "font-scale",
    label: "Font size",
    inputLabel: "Font size (%)",
    summaryLabel: "font",
    kind: "percent",
    defaultValue: 1,
    minValue: 0.5,
    maxValue: 2,
    decimals: 3,
    inputStep: 5,
    inputMin: 50,
    inputMax: 200
  },
  {
    key: "opacity",
    inputId: "font-opacity",
    label: "Opacity",
    inputLabel: "Opacity (%)",
    summaryLabel: "opacity",
    kind: "percent",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    decimals: 3,
    inputStep: 5,
    inputMin: 0,
    inputMax: 100
  },
  {
    key: "marginTop",
    inputId: "margin-top",
    label: "Top padding",
    inputLabel: "Top padding (%)",
    summaryLabel: "top",
    kind: "padding",
    defaultValue: 0,
    minValue: 0,
    maxValue: 40,
    decimals: 2,
    inputStep: 1,
    inputMin: 0,
    inputMax: 40
  },
  {
    key: "marginBottom",
    inputId: "margin-bottom",
    label: "Bottom padding",
    inputLabel: "Bottom padding (%)",
    summaryLabel: "bottom",
    kind: "padding",
    defaultValue: 0,
    minValue: 0,
    maxValue: 40,
    decimals: 2,
    inputStep: 1,
    inputMin: 0,
    inputMax: 40
  },
  {
    key: "laneGap",
    inputId: "lane-gap",
    label: "Lane gap",
    inputLabel: "Lane gap (%)",
    summaryLabel: "lane",
    kind: "percent",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    decimals: 3,
    inputStep: 5,
    inputMin: 0,
    inputMax: 100
  }
];

function createDefaultSubtitleAdjustments() {
  return subtitleAdjustmentFields.reduce((adjustments, field) => {
    adjustments[field.key] = field.defaultValue;
    return adjustments;
  }, {});
}

function normalizeSubtitleAdjustments(value) {
  const fallback = createDefaultSubtitleAdjustments();
  const source = value && typeof value === "object" ? value : {};
  const normalized = subtitleAdjustmentFields.reduce((adjustments, field) => {
    adjustments[field.key] = roundNumber(
      clampNumber(source[field.key], fallback[field.key], field.minValue, field.maxValue),
      field.decimals
    );
    return adjustments;
  }, {});

  const marginTotal = normalized.marginTop + normalized.marginBottom;
  if (marginTotal > 80) {
    const scale = 80 / marginTotal;
    normalized.marginTop = roundNumber(normalized.marginTop * scale, 2);
    normalized.marginBottom = roundNumber(normalized.marginBottom * scale, 2);
  }

  return normalized;
}

function describeSubtitleAdjustments(adjustments) {
  return normalizeSubtitleAdjustments(adjustments);
}

function formatSubtitleAdjustments(adjustments, options) {
  const normalized = normalizeSubtitleAdjustments(adjustments);
  const includeLaneGap = !options || options.includeLaneGap !== false;
  return subtitleAdjustmentFields.filter((field) => (
    includeLaneGap || field.key !== "laneGap"
  )).map((field) => {
    return `${field.summaryLabel} ${formatSubtitleAdjustmentInput(field, normalized)}%`;
  }).join(", ");
}

function getSubtitleAdjustmentFields() {
  return subtitleAdjustmentFields.map((field) => ({
    ...field
  }));
}

function readSubtitleAdjustmentInput(field, value) {
  if (field.kind === "percent") {
    return readPercentInput(value, field.label);
  }

  return readPaddingInput(value, field.label);
}

function formatSubtitleAdjustmentInput(field, adjustments) {
  const value = adjustments && typeof adjustments === "object" ? adjustments[field.key] : field.defaultValue;
  if (field.kind === "percent") {
    return formatPercentInput(value);
  }

  return formatPaddingInput(value);
}

function parseSubtitleDelay(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number)) {
    return number;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error("Subtitle delay must be a number.");
}

function normalizeSubtitleDelay(value) {
  const number = parseSubtitleDelay(value);
  return Math.max(-600, Math.min(600, Math.round(number * 1000) / 1000));
}

function formatDelayInput(value) {
  const rounded = normalizeSubtitleDelay(value);
  if (Object.is(rounded, -0)) {
    return "0.0";
  }

  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}

function formatSignedSeconds(value) {
  const rounded = normalizeSubtitleDelay(value);
  if (rounded === 0 || Object.is(rounded, -0)) {
    return "0.0s";
  }

  const sign = rounded > 0 ? "+" : "";
  return `${sign}${formatDelayInput(rounded)}s`;
}

function readPercentInput(value, label) {
  return readNumberInput(value, label) / 100;
}

function readPaddingInput(value, label) {
  return readNumberInput(value, label);
}

function readNumberInput(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  return number;
}

function formatPercentInput(value) {
  return formatCompactNumber(roundNumber(value * 100, 1));
}

function formatPaddingInput(value) {
  return formatCompactNumber(roundNumber(value, 1));
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  const finite = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, finite));
}

function roundNumber(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function formatCompactNumber(value) {
  return String(value);
}

export {
  clampNumber,
  createDefaultSubtitleAdjustments,
  describeSubtitleAdjustments,
  formatSubtitleAdjustmentInput,
  formatCompactNumber,
  formatDelayInput,
  formatPaddingInput,
  formatPercentInput,
  formatSignedSeconds,
  formatSubtitleAdjustments,
  getSubtitleAdjustmentFields,
  normalizeSubtitleAdjustments,
  normalizeSubtitleDelay,
  parseSubtitleDelay,
  readNumberInput,
  readPaddingInput,
  readPercentInput,
  readSubtitleAdjustmentInput,
  roundNumber
};
