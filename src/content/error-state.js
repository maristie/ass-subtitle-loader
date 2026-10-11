function setContentError(state, message, source) {
  state.lastError = message;
  state.lastErrorSource = source || "unknown";
  state.lastErrorRevision = Number(state.lastErrorRevision || 0) + 1;
  return state.lastErrorRevision;
}

function clearContentError(state) {
  state.lastError = null;
  state.lastErrorSource = null;
}

function getContentErrorRevision(state) {
  return Number(state.lastErrorRevision || 0);
}

function canClearContentError(state, revision) {
  return getContentErrorRevision(state) === Number(revision || 0);
}

function clearContentErrorIfCurrent(state, revision, expectedSource) {
  if (
    !canClearContentError(state, revision) ||
      state.lastErrorSource !== expectedSource
  ) {
    return false;
  }

  clearContentError(state);
  return true;
}

function canRendererRecoveryClearContentError(state, revision) {
  return canClearContentError(state, revision) && (
    !state.lastError || String(state.lastErrorSource || "").startsWith("renderer")
  );
}

export {
  canClearContentError,
  canRendererRecoveryClearContentError,
  clearContentError,
  clearContentErrorIfCurrent,
  getContentErrorRevision,
  setContentError
};
