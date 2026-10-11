import { CONTENT } from "../shared/messages.js";
import { describeError } from "../shared/diagnostics.js";
import {
  encodingOptions,
  readSubtitleFile
} from "./file-reader.js";
import { ensurePageStyle } from "./page-style.js";
import { setContentError } from "./error-state.js";

const containedPickerEventTypes = [
  "keydown",
  "keypress",
  "keyup",
  "beforeinput",
  "input",
  "change",
  "compositionstart",
  "compositionupdate",
  "compositionend"
];

function showSubtitlePicker(context) {
  const {
    state,
    findBestVideo,
    trace
  } = context;

  ensurePageStyle(state);
  removeSubtitlePicker(state, trace);

  const root = document.createElement("div");
  root.className = "ass-subtitle-loader-picker";
  root.tabIndex = -1;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "ASS Subtitle Loader");
  const cleanupEventContainment = containPickerInputEvents(root);

  const header = document.createElement("div");
  header.className = "ass-subtitle-loader-picker-header";

  const title = document.createElement("h2");
  title.textContent = "ASS Subtitle Loader";

  const closeButton = createPickerButton("Close", "secondary");
  closeButton.type = "button";
  closeButton.addEventListener("click", () => removeSubtitlePicker(state, trace));

  header.append(title, closeButton);

  const status = document.createElement("p");
  status.className = "ass-subtitle-loader-picker-status";
  setPickerStatus(
    status,
    state.lastError || (state.subtitleName ? `Loaded: ${state.subtitleName}` : "No subtitle file loaded."),
    Boolean(state.lastError),
    state.lastErrorSource
  );

  const fileInput = createPickerInput({
    type: "file",
    accept: ".ass,.ssa,text/plain"
  });
  const fileLabel = createPickerField("ASS file", fileInput);
  const encodingSelect = createPickerSelect(encodingOptions);
  const encodingLabel = createPickerField("Encoding", encodingSelect);
  root.append(header, status, fileLabel, encodingLabel);
  const picker = {
    root,
    input: fileInput,
    status,
    cleanupEventContainment,
    loadGeneration: 0,
    loadRevision: null,
    cancelSubtitleLoad: context.cancelSubtitleLoad
  };

  fileInput.addEventListener("click", () => {
    fileInput.value = "";
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    if (file) {
      handlePickerFile(context, picker, file, encodingSelect.value, status);
    }
  });

  root.addEventListener("dragover", (event) => {
    event.preventDefault();
    root.classList.add("ass-subtitle-loader-picker-dragging");
  });

  root.addEventListener("dragleave", () => {
    root.classList.remove("ass-subtitle-loader-picker-dragging");
  });

  root.addEventListener("drop", (event) => {
    event.preventDefault();
    root.classList.remove("ass-subtitle-loader-picker-dragging");
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
      ? event.dataTransfer.files[0]
      : null;
    if (file) {
      handlePickerFile(context, picker, file, encodingSelect.value, status);
    }
  });

  (document.body || document.documentElement).appendChild(root);
  focusPickerRoot(root);
  state.picker = picker;

  trace("picker:show", {
    subtitleName: state.subtitleName,
    hasVideo: Boolean(findBestVideo())
  });
}

function removeSubtitlePicker(state, trace) {
  if (!state.picker) {
    return;
  }

  const root = state.picker.root;
  const cleanupEventContainment = state.picker.cleanupEventContainment;
  cancelPendingPickerLoad(state);
  state.picker = null;
  if (typeof cleanupEventContainment === "function") {
    cleanupEventContainment();
  }
  if (root && root.isConnected) {
    root.remove();
  }
  trace("picker:remove", {});
}

function containPickerInputEvents(root) {
  const containEvent = (event) => {
    event.stopPropagation();
  };

  containedPickerEventTypes.forEach((type) => {
    root.addEventListener(type, containEvent);
  });

  return () => {
    containedPickerEventTypes.forEach((type) => {
      root.removeEventListener(type, containEvent);
    });
  };
}

function focusPickerRoot(root) {
  try {
    root.focus({
      preventScroll: true
    });
  } catch (_error) {
    root.focus();
  }
}

async function handlePickerFile(context, picker, file, encoding, statusElement) {
  const {
    loadSubtitle,
    state,
    trace
  } = context;
  const loadGeneration = beginPickerLoad(state, picker);
  if (loadGeneration === null) {
    return;
  }
  const loadRevision = typeof context.beginSubtitleLoad === "function"
    ? context.beginSubtitleLoad()
    : null;
  picker.loadRevision = loadRevision;
  let errorSource = "file-load";

  trace("picker:file-selected", {
    name: file.name,
    size: file.size,
    type: file.type || null,
    encoding
  });
  setPickerStatus(statusElement, `Reading ${file.name}...`, false);

  try {
    const content = await readSubtitleFile(file, encoding);
    if (!isCurrentPickerLoad(state, picker, loadGeneration)) {
      tracePickerLoadSuperseded(trace, file, "read");
      return;
    }
    trace("picker:file-read", {
      name: file.name,
      size: file.size,
      chars: content.length
    });

    const response = await loadSubtitle({
      type: CONTENT.LOAD,
      name: file.name,
      byteLength: file.size,
      loadRevision,
      content
    });
    if (!isCurrentPickerLoad(state, picker, loadGeneration)) {
      tracePickerLoadSuperseded(trace, file, "load");
      return;
    }
    if (response.superseded) {
      setPickerStatus(statusElement, "Another subtitle load replaced this selection.", false);
      tracePickerLoadSuperseded(trace, file, "response");
      return;
    }
    trace("picker:load-response", {
      ok: response.ok,
      pending: Boolean(response.pending),
      message: response.message || null,
      error: response.error || null
    }, response.ok ? "log" : "warn");

    if (response.ok) {
      setPickerStatus(statusElement, `Loaded ${file.name}.`, false);
      return;
    }

    if (response.pending) {
      setPickerStatus(statusElement, `${file.name} loaded. Waiting for a video element.`, false);
      return;
    }

    errorSource = "renderer-attach";
    throw new Error(response.error || "The subtitle renderer rejected the file.");
  } catch (error) {
    if (!isCurrentPickerLoad(state, picker, loadGeneration)) {
      tracePickerLoadSuperseded(trace, file, "error");
      return;
    }
    const errorInfo = describeError(error);
    setContentError(state, errorInfo.message, errorSource);
    setPickerStatus(statusElement, errorInfo.message, true, errorSource);
    trace("picker:error", {
      error: errorInfo.message,
      details: errorInfo
    }, "error");
  }
}

function beginPickerLoad(state, picker) {
  if (!picker || state.picker !== picker) {
    return null;
  }
  picker.loadGeneration = Number(picker.loadGeneration || 0) + 1;
  return picker.loadGeneration;
}

function cancelPendingPickerLoad(state) {
  const picker = state && state.picker;
  if (!picker) {
    return;
  }
  picker.loadGeneration = Number(picker.loadGeneration || 0) + 1;
  if (typeof picker.cancelSubtitleLoad === "function" && picker.loadRevision !== null) {
    picker.cancelSubtitleLoad(picker.loadRevision);
  }
  picker.loadRevision = null;
}

function isCurrentPickerLoad(state, picker, loadGeneration) {
  return Boolean(
    picker &&
      state.picker === picker &&
      picker.loadGeneration === loadGeneration
  );
}

function tracePickerLoadSuperseded(trace, file, stage) {
  trace("picker:load-superseded", {
    name: file.name,
    stage
  });
}

function createPickerButton(label, variant) {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = variant ? `ass-subtitle-loader-picker-button ${variant}` : "ass-subtitle-loader-picker-button";
  return button;
}

function createPickerField(labelText, control) {
  const label = document.createElement("label");
  label.className = "ass-subtitle-loader-picker-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function createPickerSelect(options, value) {
  const select = document.createElement("select");
  options.forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  });
  if (value !== undefined) {
    select.value = value;
  }
  return select;
}

function createPickerInput(attributes) {
  const input = document.createElement("input");
  Object.keys(attributes).forEach((key) => {
    input[key] = String(attributes[key]);
  });
  return input;
}

function setPickerStatus(statusElement, message, isError, errorSource) {
  statusElement.textContent = message;
  statusElement.dataset.state = isError ? "error" : "normal";
  if (isError) {
    statusElement.dataset.errorSource = errorSource || "unknown";
  } else {
    delete statusElement.dataset.errorSource;
  }
}

export {
  cancelPendingPickerLoad,
  handlePickerFile,
  removeSubtitlePicker,
  showSubtitlePicker
};
