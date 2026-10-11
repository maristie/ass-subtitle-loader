import {
  normalizeAssKey,
  splitAssFields
} from "./ass-parser.js";

const FALLBACK_FAMILY = "Noto Sans CJK JP";
const FALLBACK_FONT_PATH = "fonts/NotoSansCJKjp-Regular.otf";
const BUNDLED_FONT_FAMILIES = [
  "Noto Sans CJK JP",
  "Noto Sans JP"
];

function createRendererFontConfig(api, content) {
  const fallbackUrl = getRuntimeUrl(api, FALLBACK_FONT_PATH);
  const availableFonts = {};
  const cssFamilies = [];

  BUNDLED_FONT_FAMILIES.forEach((family) => {
    const normalized = normalizeFontFamily(family);
    if (!normalized) {
      return;
    }
    availableFonts[normalized] = fallbackUrl;
    cssFamilies.push(family);
  });

  const requestedFamilies = collectAssFontFamilies(content);
  const aliasedFamilies = requestedFamilies.filter((family) => isKnownFontFamily({ availableFonts }, family));
  const fallbackFamilies = requestedFamilies.filter((family) => !isKnownFontFamily({ availableFonts }, family));

  return {
    fallbackFamily: FALLBACK_FAMILY,
    fallbackUrl,
    fonts: [fallbackUrl],
    availableFonts,
    aliases: {},
    cssFamilies,
    requestedFamilies,
    aliasedFamilies,
    matchedFamilies: aliasedFamilies,
    fallbackFamilies
  };
}

function describeFontConfig(config) {
  const normalized = config || createRendererFontConfig(null, "");
  const requestedFamilies = uniqueStrings(normalized.requestedFamilies || []);
  const aliasedFamilies = uniqueStrings(normalized.aliasedFamilies || normalized.matchedFamilies || []);
  const fallbackFamilies = uniqueStrings(normalized.fallbackFamilies || []);
  return {
    fallbackFamily: normalized.fallbackFamily || FALLBACK_FAMILY,
    requestedFamilies,
    aliasedFamilies,
    matchedFamilies: aliasedFamilies,
    fallbackFamilies,
    requestedCount: requestedFamilies.length,
    aliasedCount: aliasedFamilies.length,
    matchedCount: aliasedFamilies.length,
    fallbackCount: fallbackFamilies.length,
    bundledFamilyCount: Object.keys(normalized.availableFonts || {}).length
  };
}

function getFontFaceCss(config) {
  const normalized = config || createRendererFontConfig(null, "");
  const fallbackUrl = normalized.fallbackUrl || "";
  if (!fallbackUrl) {
    return "";
  }

  return uniqueStrings(normalized.cssFamilies || BUNDLED_FONT_FAMILIES).map((family) => (
    `@font-face {
      font-family: "${escapeCssString(family)}";
      src: url("${escapeCssString(fallbackUrl)}") format("opentype");
      font-weight: 100 900;
      font-style: normal;
      font-display: block;
    }`
  )).join("\n");
}

function resolveFontFamilyForRendering(config, family) {
  return config && config.fallbackFamily ? config.fallbackFamily : FALLBACK_FAMILY;
}

function isKnownFontFamily(config, family) {
  const normalized = normalizeFontFamily(family);
  return Boolean(normalized && config && config.availableFonts && config.availableFonts[normalized]);
}

function collectAssFontFamilies(content) {
  const families = [];
  let section = "";
  let styleFormat = null;
  let eventFormat = null;

  String(content || "").split(/\r\n|\r|\n/).forEach((line) => {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase();
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
        const fields = splitAssFields(styleMatch[1], styleFormat.length);
        const fontIndex = styleFormat.indexOf("fontname");
        if (fontIndex >= 0) {
          addFontFamily(families, fields[fontIndex]);
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
      if (dialogueMatch) {
        if (eventFormat) {
          const fields = splitAssFields(dialogueMatch[1], eventFormat.length);
          const textIndex = eventFormat.indexOf("text");
          if (textIndex >= 0) {
            collectOverrideFontFamilies(fields[textIndex], families);
          }
        } else {
          collectOverrideFontFamilies(dialogueMatch[1], families);
        }
      }
    }
  });

  return families;
}

function collectOverrideFontFamilies(text, families) {
  String(text || "").replace(/\\fn([^\\}]*)/ig, (_match, family) => {
    addFontFamily(families, family);
    return "";
  });
}

function addFontFamily(families, family) {
  const clean = cleanFontFamily(family);
  if (!clean) {
    return;
  }

  const normalized = normalizeFontFamily(clean);
  if (!families.some((existing) => normalizeFontFamily(existing) === normalized)) {
    families.push(clean);
  }
}

function cleanFontFamily(value) {
  let clean = String(value || "").trim();
  if ((clean.startsWith("\"") && clean.endsWith("\"")) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  if (clean.startsWith("@")) {
    clean = clean.slice(1).trim();
  }
  return clean.replace(/\s+/g, " ");
}

function normalizeFontFamily(value) {
  return cleanFontFamily(value).toLowerCase();
}

function getRuntimeUrl(api, path) {
  return api && api.runtime && typeof api.runtime.getURL === "function"
    ? api.runtime.getURL(path)
    : path;
}

function uniqueStrings(values) {
  const result = [];
  values.forEach((value) => {
    if (typeof value !== "string" || !value) {
      return;
    }
    if (!result.includes(value)) {
      result.push(value);
    }
  });
  return result;
}

function escapeCssString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

export {
  FALLBACK_FAMILY,
  FALLBACK_FONT_PATH,
  collectAssFontFamilies,
  createRendererFontConfig,
  describeFontConfig,
  getFontFaceCss,
  isKnownFontFamily,
  normalizeFontFamily,
  resolveFontFamilyForRendering
};
