import {
  createDefaultSubtitleAdjustments,
  describeSubtitleAdjustments,
  getSubtitleAdjustmentFields,
  normalizeSubtitleAdjustments
} from "../shared/settings.js";
import { describeError } from "../shared/diagnostics.js";

const GLOBAL_DEFAULTS_STORAGE_KEY = "assSubtitleLoader.defaults.global";
const SITE_DEFAULTS_STORAGE_KEY_PREFIX = "assSubtitleLoader.defaults.site.";
const DEFAULTS_STORAGE_VERSION = 2;
const DEFAULTS_ADJUSTMENT_KEYS = getSubtitleAdjustmentFields().map((field) => field.key);

function createDefaultsController(options) {
  const {
    api,
    getStatus,
    state,
    trace
  } = options;

  async function loadStoredDefaults() {
    try {
      const stored = await readStoredDefaults();
      const effective = stored.siteDefaults || stored.globalDefaults;
      if (effective) {
        applyStoredDefaults(effective);
      }
      updateStoredDefaultsStatus(stored.globalDefaults, stored.siteDefaults, getDefaultScope(stored), null);
      trace("defaults:loaded", {
        scope: state.settingsDefaults.effectiveScope,
        origin: state.settingsDefaults.origin,
        hasGlobal: state.settingsDefaults.global.hasDefaults,
        hasSite: state.settingsDefaults.site.hasDefaults
      });
    } catch (error) {
      const errorInfo = describeError(error);
      updateStoredDefaultsStatus(null, null, "builtin", errorInfo.message);
      trace("defaults:load-error", {
        error: errorInfo.message,
        details: errorInfo
      }, "warn");
    }
  }

  async function saveSiteDefaults(snapshot) {
    ensureDefaultsStorageAvailable(api);
    if (api.extension?.inIncognitoContext) throw new Error("Saving and resetting defaults are disabled in private tabs.");
    const origin = api.extension?.inIncognitoContext ? null : getDefaultsOrigin();
    if (!origin) {
      throw new Error("Site defaults are unavailable for this page.");
    }

    const defaults = createStoredDefaultsPayload(snapshot);
    await storageSet(api, {
      [getSiteDefaultsStorageKey(origin)]: defaults
    });
    await refreshStoredDefaultsStatus();
    trace("defaults:site-save", {
      origin,
      subtitleAdjustments: defaults.subtitleAdjustments
    });
    return {
      ok: true,
      status: getStatus(),
      message: `Saved site default for ${origin}.`
    };
  }

  async function resetSiteDefaults() {
    ensureDefaultsStorageAvailable(api);
    if (api.extension?.inIncognitoContext) throw new Error("Saving and resetting defaults are disabled in private tabs.");
    const origin = api.extension?.inIncognitoContext ? null : getDefaultsOrigin();
    if (!origin) {
      throw new Error("Site defaults are unavailable for this page.");
    }

    await storageRemove(api, getSiteDefaultsStorageKey(origin));
    await refreshStoredDefaultsStatus();
    trace("defaults:site-reset", {
      origin
    });
    return {
      ok: true,
      status: getStatus(),
      message: `Reset site default for ${origin}.`
    };
  }

  async function saveGlobalDefaults(snapshot) {
    ensureDefaultsStorageAvailable(api);
    if (api.extension?.inIncognitoContext) throw new Error("Saving and resetting defaults are disabled in private tabs.");
    const defaults = createStoredDefaultsPayload(snapshot);
    await storageSet(api, {
      [GLOBAL_DEFAULTS_STORAGE_KEY]: defaults
    });
    await refreshStoredDefaultsStatus();
    trace("defaults:global-save", {
      subtitleAdjustments: defaults.subtitleAdjustments
    });
    return {
      ok: true,
      status: getStatus(),
      message: "Saved global default."
    };
  }

  async function resetGlobalDefaults() {
    ensureDefaultsStorageAvailable(api);
    if (api.extension?.inIncognitoContext) throw new Error("Saving and resetting defaults are disabled in private tabs.");
    await storageRemove(api, GLOBAL_DEFAULTS_STORAGE_KEY);
    await refreshStoredDefaultsStatus();
    trace("defaults:global-reset", {});
    return {
      ok: true,
      status: getStatus(),
      message: "Reset global default."
    };
  }

  async function refreshStoredDefaultsStatus() {
    const stored = await readStoredDefaults();
    updateStoredDefaultsStatus(stored.globalDefaults, stored.siteDefaults, getDefaultScope(stored), null);
  }

  async function readStoredDefaults() {
    const origin = api.extension?.inIncognitoContext ? null : getDefaultsOrigin();
    const keys = origin
      ? [GLOBAL_DEFAULTS_STORAGE_KEY, getSiteDefaultsStorageKey(origin)]
      : [GLOBAL_DEFAULTS_STORAGE_KEY];
    const values = await storageGet(api, keys);
    const globalDefaults = normalizeStoredDefaults(values && values[GLOBAL_DEFAULTS_STORAGE_KEY]);
    const siteDefaults = origin
      ? normalizeStoredDefaults(values && values[getSiteDefaultsStorageKey(origin)])
      : null;
    return {
      globalDefaults,
      siteDefaults
    };
  }

  function getDefaultScope(stored) {
    if (stored && stored.siteDefaults) {
      return "site";
    }
    if (stored && stored.globalDefaults) {
      return "global";
    }
    return "builtin";
  }

  function applyStoredDefaults(defaults) {
    state.subtitleAdjustments = defaults.subtitleAdjustments;
  }

  function createStoredDefaultsPayload(snapshot) {
    ensureDefaultsSnapshot(snapshot);
    return {
      version: DEFAULTS_STORAGE_VERSION,
      subtitleAdjustments: describeSubtitleAdjustments(snapshot.subtitleAdjustments)
    };
  }

  function normalizeStoredDefaults(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    try {
      return {
        version: Number(value.version) || 0,
        subtitleAdjustments: normalizeSubtitleAdjustments(value.subtitleAdjustments || createDefaultSubtitleAdjustments())
      };
    } catch (_error) {
      return null;
    }
  }

  function updateStoredDefaultsStatus(globalDefaults, siteDefaults, effectiveScope, error) {
    state.settingsDefaults = createStoredDefaultsStatus(api, globalDefaults, siteDefaults, effectiveScope, error);
  }

  return {
    loadStoredDefaults,
    resetGlobalDefaults,
    resetSiteDefaults,
    saveGlobalDefaults,
    saveSiteDefaults
  };
}

function createStoredDefaultsStatus(api, globalDefaults, siteDefaults, effectiveScope, error) {
  const origin = api.extension?.inIncognitoContext ? null : getDefaultsOrigin();
  return {
    origin,
    privateContext: Boolean(api.extension?.inIncognitoContext),
    canStore: !api.extension?.inIncognitoContext && Boolean(getStorageArea(api)),
    effectiveScope: effectiveScope || "builtin",
    error: error || null,
    global: {
      hasDefaults: Boolean(globalDefaults),
    },
    site: {
      hasDefaults: Boolean(siteDefaults),
    }
  };
}

function ensureDefaultsStorageAvailable(api) {
  if (!getStorageArea(api)) {
    throw new Error("Extension storage is unavailable.");
  }
}

function ensureDefaultsSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Default settings snapshot is required.");
  }
  if (
    !snapshot.subtitleAdjustments ||
    typeof snapshot.subtitleAdjustments !== "object" ||
    Array.isArray(snapshot.subtitleAdjustments)
  ) {
    throw new Error("Default settings snapshot is incomplete.");
  }
  const hasInvalidAdjustment = DEFAULTS_ADJUSTMENT_KEYS.some((key) => (
    !Object.prototype.hasOwnProperty.call(snapshot.subtitleAdjustments, key) ||
    typeof snapshot.subtitleAdjustments[key] !== "number" ||
    !Number.isFinite(snapshot.subtitleAdjustments[key])
  ));
  if (hasInvalidAdjustment) {
    throw new Error("Default settings snapshot is incomplete.");
  }
}

function getDefaultsOrigin() {
  try {
    const origin = location.origin;
    return origin && origin !== "null" ? origin : null;
  } catch (_error) {
    return null;
  }
}

function getSiteDefaultsStorageKey(origin) {
  return `${SITE_DEFAULTS_STORAGE_KEY_PREFIX}${encodeURIComponent(origin)}`;
}

function getStorageArea(api) {
  return api && api.storage && api.storage.local ? api.storage.local : null;
}

async function storageGet(api, keys) {
  const storage = getStorageArea(api);
  if (!storage || typeof storage.get !== "function") {
    return {};
  }
  return await storage.get(keys) || {};
}

async function storageSet(api, values) {
  const storage = getStorageArea(api);
  if (!storage || typeof storage.set !== "function") {
    throw new Error("Extension storage is unavailable.");
  }
  await storage.set(values);
}

async function storageRemove(api, keys) {
  const storage = getStorageArea(api);
  if (!storage || typeof storage.remove !== "function") {
    throw new Error("Extension storage is unavailable.");
  }
  await storage.remove(keys);
}

export {
  createDefaultsController,
  createStoredDefaultsStatus
};
