import {
  CONTENT
} from "../src/shared/messages.js";
import {
  createDefaultSubtitleAdjustments as getDefaultAdjustments,
  formatDelayInput,
  formatSubtitleAdjustmentInput,
  getSubtitleAdjustmentFields,
  normalizeSubtitleAdjustments as normalizeAdjustments,
  normalizeSubtitleDelay as normalizeDelay,
  parseSubtitleDelay as parseDelay,
  readSubtitleAdjustmentInput
} from "../src/shared/settings.js";
import {
  createRuntimeLogger,
  describeError
} from "../src/shared/diagnostics.js";
import {
  renderEmpty as renderStatusEmpty,
  renderResponse as renderStatusResponse
} from "../src/status-view.js";

const api = globalThis.browser;
const logPrefix = "[ASS Subtitle Loader]";
const extensionVersion = api.runtime.getManifest().version;

const contentScriptFiles = [
  "/build/content.bundle.js"
];
const STATUS_REFRESH_INTERVAL_MS = 1000;

const statusEl = document.getElementById("status");
const stateEl = document.getElementById("state");
const loadButton = document.getElementById("load");
const removeButton = document.getElementById("remove");
const delayInput = document.getElementById("delay");
const delayEarlierButton = document.getElementById("delay-earlier");
const delayResetButton = document.getElementById("delay-reset");
const delayLaterButton = document.getElementById("delay-later");
const adjustmentFields = getSubtitleAdjustmentFields();
const adjustmentInputs = adjustmentFields.reduce((inputs, field) => {
  inputs[field.key] = document.getElementById(field.inputId);
  return inputs;
}, {});
const adjustmentElements = adjustmentFields.reduce((elements, field) => {
  const input = adjustmentInputs[field.key];
  elements[field.key] = {
    input,
    label: input ? document.querySelector(`label[for="${field.inputId}"]`) : null
  };
  return elements;
}, {});
const adjustmentInputControls = adjustmentFields.map((field) => adjustmentInputs[field.key]).filter(Boolean);
const adjustmentResetButton = document.getElementById("adjustment-reset");
const defaultsStatusEl = document.getElementById("defaults-status");
const saveSiteDefaultsButton = document.getElementById("save-site-defaults");
const resetSiteDefaultsButton = document.getElementById("reset-site-defaults");
const saveGlobalDefaultsButton = document.getElementById("save-global-defaults");
const resetGlobalDefaultsButton = document.getElementById("reset-global-defaults");
const busyControls = [
  loadButton,
  removeButton,
  delayInput,
  delayEarlierButton,
  delayResetButton,
  delayLaterButton,
  ...adjustmentInputControls,
  adjustmentResetButton
].filter(Boolean);

let currentTab = null;
let activeCommandCount = 0;
let statusRefreshInFlight = false;
let statusRefreshTimer = 0;
let statusRefreshInitialized = false;
const logPopup = createRuntimeLogger({
  api,
  source: "popup",
  prefix: logPrefix
});

initializeAdjustmentFields();

loadButton.addEventListener("click", async () => {
  await withBusy(async () => {
    const tab = await runStep("get active tab", getActiveTab);
    if (!tab || typeof tab.id !== "number") {
      throw new Error("No active tab.");
    }

    currentTab = tab;
    logPopup("popup:load-click", {
      tabId: tab.id,
      title: tab.title || null,
      url: tab.url || null
    });
    await runStep("prepare target page", () => ensureContentScripts(tab.id));
    const response = await runStep("show page picker", () => api.tabs.sendMessage(tab.id, {
      type: CONTENT.SHOW_PICKER
    }));
    logPopup("popup:show-picker-response", response);
    renderResponse(response);
    setStatus("Choose an ASS file on the video page.");
    if (response && response.ok) {
      window.close();
    }
  });
});

removeButton.addEventListener("click", async () => {
  await sendPopupCommand({
    payload: {
      type: CONTENT.REMOVE
    },
    eventName: "popup:remove-click",
    responseEventName: "popup:remove-response"
  });
});

delayInput.addEventListener("change", () => {
  setDelayFromInput();
});

delayEarlierButton.addEventListener("click", () => {
  adjustDelay(-0.5);
});

delayResetButton.addEventListener("click", () => {
  setSubtitleDelay(0);
});

delayLaterButton.addEventListener("click", () => {
  adjustDelay(0.5);
});

adjustmentInputControls.forEach((input) => {
  input.addEventListener("change", () => {
    setSubtitleAdjustmentsFromInputs();
  });
});

adjustmentResetButton.addEventListener("click", () => {
  setAdjustmentInputs(getDefaultAdjustments(), {
    force: true
  });
  setSubtitleAdjustments(getDefaultAdjustments());
});

saveSiteDefaultsButton.addEventListener("click", () => {
  saveDefaults(CONTENT.SAVE_SITE_DEFAULTS, "popup:defaults-site-save");
});

resetSiteDefaultsButton.addEventListener("click", () => {
  resetDefaults(CONTENT.RESET_SITE_DEFAULTS, "popup:defaults-site-reset");
});

saveGlobalDefaultsButton.addEventListener("click", () => {
  saveDefaults(CONTENT.SAVE_GLOBAL_DEFAULTS, "popup:defaults-global-save");
});

resetGlobalDefaultsButton.addEventListener("click", () => {
  resetDefaults(CONTENT.RESET_GLOBAL_DEFAULTS, "popup:defaults-global-reset");
});

document.addEventListener("DOMContentLoaded", initializeStatusRefresh);
initializeStatusRefresh();

function initializeStatusRefresh() {
  if (statusRefreshInitialized) {
    return;
  }
  statusRefreshInitialized = true;
  refreshStatus();
  startStatusRefresh();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStatus();
    }
  });
  window.addEventListener("pagehide", stopStatusRefresh);
}

function startStatusRefresh() {
  if (statusRefreshTimer) {
    return;
  }
  statusRefreshTimer = setInterval(() => {
    refreshStatus({
      passive: true
    });
  }, STATUS_REFRESH_INTERVAL_MS);
}

function stopStatusRefresh() {
  if (!statusRefreshTimer) {
    return;
  }
  clearInterval(statusRefreshTimer);
  statusRefreshTimer = 0;
}

async function refreshStatus(options = {}) {
  if (statusRefreshInFlight || (options.passive && activeCommandCount > 0) || (options.passive && document.visibilityState === "hidden")) {
    return;
  }

  statusRefreshInFlight = true;
  try {
    const tab = await getActiveTab();
    currentTab = tab || null;
    if (!tab || typeof tab.id !== "number") {
      renderEmpty("No active tab.");
      return;
    }

    const response = await api.tabs.sendMessage(tab.id, {
      type: CONTENT.PING
    });
    if (!options.passive) {
      logPopup("popup:status-response", response);
    }
    if (options.passive && activeCommandCount > 0) {
      return;
    }
    renderResponse(response);
  } catch (_error) {
    if (!options.passive) {
      logPopup("popup:status-no-content", {});
    }
    if (options.passive && activeCommandCount > 0) {
      return;
    }
    renderEmpty("No ASS loaded yet. Click Load ASS.");
  } finally {
    statusRefreshInFlight = false;
  }
}

async function sendToPage(payload) {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab.");
  }
  currentTab = tab;

  await ensureContentScripts(tab.id);
  logPopup("popup:send-to-page", {
    tabId: tab.id,
    type: payload.type
  });
  return api.tabs.sendMessage(tab.id, payload);
}

async function setDelayFromInput() {
  try {
    await setSubtitleDelay(parseDelay(delayInput.value));
  } catch (error) {
    const errorInfo = describeError(error);
    setStatus(errorInfo.message);
    delayInput.value = formatDelayInput(parseDelay(delayInput.dataset.currentDelay, 0));
  }
}

async function adjustDelay(delta) {
  const currentDelay = parseDelay(delayInput.value, 0);
  await setSubtitleDelay(currentDelay + delta);
}

async function setSubtitleDelay(delay) {
  const normalized = normalizeDelay(delay);
  delayInput.value = formatDelayInput(normalized);

  await sendPopupCommand({
    payload: {
      type: CONTENT.SET_DELAY,
      delay: normalized
    },
    eventName: "popup:delay-set",
    eventDetails: {
      delay: normalized
    },
    responseEventName: "popup:delay-response"
  });
}

async function sendPopupCommand(options) {
  await withBusy(async () => {
    logPopup(options.eventName, options.eventDetails || {});
    const payload = typeof options.createPayload === "function"
      ? options.createPayload()
      : options.payload;
    const response = await sendToPage(payload);
    logPopup(options.responseEventName || `${options.eventName}-response`, response);
    renderResponse(response);
  });
}

async function getActiveTab() {
  const tabs = await api.tabs.query({
    active: true,
    currentWindow: true
  });
  return tabs[0];
}

async function ensureContentScripts(tabId) {
  try {
    const response = await api.tabs.sendMessage(tabId, {
      type: CONTENT.PING
    });
    const responseVersion = response && response.status ? response.status.version : null;
    if (response && response.ok && responseVersion === extensionVersion) {
      logPopup("popup:content-already-present", {
        tabId,
        version: responseVersion
      });
      return;
    }
    logPopup("popup:content-stale", {
      tabId,
      expectedVersion: extensionVersion,
      actualVersion: responseVersion
    }, "warn");
  } catch (_error) {
    // A missing receiver means the page has not been prepared yet.
  }

  logPopup("popup:inject-content-scripts", {
    tabId,
    files: contentScriptFiles
  });
  for (const file of contentScriptFiles) {
    await runStep(`inject ${file}`, () => executeExtensionScript(tabId, file));
  }
}

async function executeExtensionScript(tabId, file) {
  const attempts = file.startsWith("/") ? [file, file.slice(1)] : [`/${file}`, file];
  let lastError = null;

  for (const candidate of attempts) {
    try {
      logPopup("popup:execute-script-attempt", {
        tabId,
        file: candidate
      });
      return await api.tabs.executeScript(tabId, {
        file: candidate
      });
    } catch (error) {
      lastError = error;
      logPopup("popup:execute-script-failed", {
        tabId,
        file: candidate,
        error: describeError(error).message,
        details: describeError(error)
      }, "warn");
    }
  }

  throw lastError || new Error(`Could not inject ${file}.`);
}

async function runStep(label, callback) {
  logPopup("popup:step-start", {
    step: label
  });

  try {
    const result = await callback();
    logPopup("popup:step-complete", {
      step: label
    });
    return result;
  } catch (error) {
    const message = describeError(error).message;
    logPopup("popup:step-error", {
      step: label,
      error: message,
      details: describeError(error)
    }, "error");
    throw new Error(`${label} failed: ${message}`);
  }
}

async function withBusy(callback) {
  activeCommandCount += 1;
  setControlsDisabled(true);

  try {
    await callback();
  } catch (error) {
    const errorInfo = describeError(error);
    const message = errorInfo.message;
    logPopup("popup:error", {
      error: message,
      details: errorInfo
    }, "error");
    renderEmpty(message);
  } finally {
    activeCommandCount = Math.max(0, activeCommandCount - 1);
    if (activeCommandCount === 0) {
      setControlsDisabled(false);
    }
  }
}

function setControlsDisabled(disabled) {
  busyControls.forEach((control) => {
    control.disabled = disabled;
  });
}

function initializeAdjustmentFields() {
  adjustmentFields.forEach((field) => {
    const input = adjustmentInputs[field.key];
    if (!input) {
      return;
    }

    input.step = String(field.inputStep);
    input.min = String(field.inputMin);
    input.max = String(field.inputMax);

    const label = document.querySelector(`label[for="${field.inputId}"]`);
    if (label) {
      label.textContent = field.inputLabel;
    }
  });
  updateLaneGapVisibility(null);
}

function renderResponse(response) {
  renderStatusResponse(response, getViewOptions());
  applyDelayStatus(response && response.status);
  applyAdjustmentStatus(response && response.status);
  applyDefaultsStatus(response && response.status);
  applyDiagnosticsStatus(response?.status);
}

function renderEmpty(message) {
  renderStatusEmpty(getViewOptions(), message);
  applyDelayStatus(null);
  applyAdjustmentStatus(null);
  applyDefaultsStatus(null);
  applyDiagnosticsStatus(null);
}

function getViewOptions() {
  return {
    currentTab,
    stateEl,
    statusEl
  };
}

function setStatus(message) {
  statusEl.textContent = message;
}

function applyDelayStatus(status) {
  const delay = status && Number.isFinite(Number(status.subtitleDelay)) ? Number(status.subtitleDelay) : 0;
  setControlValue(delayInput, formatDelayInput(delay));
  delayInput.dataset.currentDelay = String(delay);
}

function applyAdjustmentStatus(status) {
  setAdjustmentInputs(status && status.subtitleAdjustments ? status.subtitleAdjustments : getDefaultAdjustments());
  updateLaneGapVisibility(status);
}

async function setSubtitleAdjustments(adjustments) {
  const normalized = normalizeAdjustments(adjustments);
  setAdjustmentInputs(normalized, {
    force: true
  });

  await sendPopupCommand({
    payload: {
      type: CONTENT.SET_ADJUSTMENTS,
      adjustments: normalized
    },
    eventName: "popup:adjustments-set",
    eventDetails: normalized,
    responseEventName: "popup:adjustments-response"
  });
}

async function saveDefaults(messageType, eventName) {
  await sendPopupCommand({
    createPayload: () => ({
      type: messageType,
      defaults: readDefaultsSnapshot()
    }),
    eventName
  });
}

async function resetDefaults(messageType, eventName) {
  await sendPopupCommand({
    payload: {
      type: messageType
    },
    eventName
  });
}

function readDefaultsSnapshot() {
  return {
    subtitleAdjustments: readAdjustmentInputs()
  };
}

async function setSubtitleAdjustmentsFromInputs() {
  try {
    await setSubtitleAdjustments(readAdjustmentInputs());
  } catch (error) {
    setStatus(describeError(error).message);
  }
}

function readAdjustmentInputs() {
  return adjustmentFields.reduce((adjustments, field) => {
    const input = adjustmentInputs[field.key];
    if (input) {
      adjustments[field.key] = readSubtitleAdjustmentInput(field, input.value);
    }
    return adjustments;
  }, {});
}

function setAdjustmentInputs(adjustments, options = {}) {
  const normalized = normalizeAdjustments(adjustments);
  adjustmentFields.forEach((field) => {
    const input = adjustmentInputs[field.key];
    if (input) {
      setControlValue(input, formatSubtitleAdjustmentInput(field, normalized), options);
    }
  });
}

function setControlValue(control, value, options = {}) {
  if (!control) {
    return;
  }

  if (!options.force && document.activeElement === control) {
    return;
  }

  control.value = value;
}

function updateLaneGapVisibility(status) {
  const hidden = false;
  const elements = adjustmentElements.laneGap || {};
  [elements.label, elements.input].filter(Boolean).forEach((element) => {
    element.hidden = hidden;
    element.setAttribute("aria-hidden", hidden ? "true" : "false");
  });
}

function applyDefaultsStatus(status) {
  if (!defaultsStatusEl) {
    return;
  }

  defaultsStatusEl.textContent = getDefaultsStatusText(status && status.settingsDefaults);
  [saveSiteDefaultsButton, resetSiteDefaultsButton, saveGlobalDefaultsButton, resetGlobalDefaultsButton].forEach(button => { button.disabled = Boolean(currentTab?.incognito || !status?.settingsDefaults?.canStore); });
}

function getDefaultsStatusText(defaults) {
  if (!defaults) {
    return "Defaults: unavailable";
  }

  const origin = formatOrigin(defaults.origin);
  if (defaults.error) {
    return `Defaults: ${defaults.error}`;
  }

  if (defaults.privateContext) return "Private tab: temporary adjustments; global defaults only.";
  if (!defaults.canStore) {
    return "Defaults: storage unavailable";
  }

  if (defaults.effectiveScope === "site") {
    return `Defaults: site override for ${origin}`;
  }

  if (defaults.effectiveScope === "global") {
    return `Defaults: global default${origin ? ` for ${origin}` : ""}`;
  }

  return `Defaults: built-in${origin ? ` for ${origin}` : ""}`;
}

function formatOrigin(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).host || value;
  } catch (_error) {
    return value;
  }
}

const diagnosticsControl = document.getElementById("diagnostics");
diagnosticsControl.addEventListener("change", () => sendPopupCommand({payload: {type: CONTENT.SET_DIAGNOSTICS, enabled: diagnosticsControl.checked}, eventName: "diagnostics:set"}));

function applyDiagnosticsStatus(status) {
  diagnosticsControl.checked = Boolean(status?.diagnosticsEnabled);
  diagnosticsControl.disabled = Boolean(status?.privateContext || currentTab?.incognito || api.extension?.inIncognitoContext);
}
