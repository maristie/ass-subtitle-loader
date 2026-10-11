import { describeError } from "../shared/diagnostics.js";
import { setContentError } from "./error-state.js";

function handleActiveRendererRuntimeError(options) {
  const {
    state,
    session,
    error,
    trace,
    disposeSession
  } = options;

  if (!session || state.disposed || state.session !== session || session.disposed) {
    return false;
  }

  const errorInfo = describeError(error);
  const message = errorInfo.message;
  const video = session.video || null;
  setContentError(state, message, "renderer-runtime");
  state.attachment = {
    phase: "failed",
    video,
    error: message,
    recovery: null
  };
  state.session = null;

  if (state.picker && state.picker.status) {
    state.picker.status.textContent = message;
    state.picker.status.dataset.state = "error";
    state.picker.status.dataset.errorSource = "renderer-runtime";
  }
  if (typeof trace === "function") {
    trace("renderer:runtime-error", {
      backend: session.backend || "unknown",
      error: message,
      details: errorInfo
    }, "error");
  }
  if (typeof disposeSession === "function") {
    queueMicrotask(() => {
      try {
        disposeSession(session);
      } catch (disposalError) {
        /* Cleanup errors do not expose page or file data. */
      }
    });
  }
  return true;
}

export { handleActiveRendererRuntimeError };
