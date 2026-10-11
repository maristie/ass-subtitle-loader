import assert from "node:assert/strict";
import test from "node:test";

import {
  canClearContentError,
  canRendererRecoveryClearContentError,
  clearContentError,
  clearContentErrorIfCurrent,
  getContentErrorRevision,
  setContentError
} from "../../src/content/error-state.js";
import { CONTENT } from "../../src/shared/messages.js";

test("a newer error cannot be cleared by an older renderer attempt", () => {
  const state = {
    lastError: null,
    lastErrorRevision: 0,
    lastErrorSource: null
  };
  const rendererAttemptRevision = getContentErrorRevision(state);

  setContentError(state, "The newer file is empty.", "file-load");

  assert.equal(canClearContentError(state, rendererAttemptRevision), false);
  assert.equal(canRendererRecoveryClearContentError(state, rendererAttemptRevision), false);
  assert.equal(state.lastError, "The newer file is empty.");
  assert.equal(state.lastErrorSource, "file-load");
});

test("successful recovery can clear the error that preceded its attempt", () => {
  const state = {
    lastError: null,
    lastErrorRevision: 0,
    lastErrorSource: null
  };
  setContentError(state, "Renderer crashed.", "renderer-runtime");
  const recoveryRevision = getContentErrorRevision(state);

  assert.equal(canClearContentError(state, recoveryRevision), true);
  assert.equal(canRendererRecoveryClearContentError(state, recoveryRevision), true);
  clearContentError(state);
  assert.equal(state.lastError, null);
  assert.equal(state.lastErrorSource, null);
  assert.equal(getContentErrorRevision(state), recoveryRevision);
});

test("renderer recovery does not clear a current file validation error", () => {
  const state = {
    lastError: null,
    lastErrorRevision: 0,
    lastErrorSource: null
  };
  setContentError(state, "The selected file is empty.", "file-load");
  const revision = getContentErrorRevision(state);

  assert.equal(canClearContentError(state, revision), true);
  assert.equal(canRendererRecoveryClearContentError(state, revision), false);
});

test("successful setting retries clear only their matching command errors", () => {
  const messageTypes = [
    CONTENT.SET_DELAY,
    CONTENT.SET_RENDERER_PREFERENCE,
    CONTENT.SET_PERFORMANCE_MODE,
    CONTENT.SET_ADJUSTMENTS
  ];

  for (const messageType of messageTypes) {
    const state = createErrorState();
    const source = `message:${messageType}`;
    const revision = setContentError(state, `Invalid ${messageType}.`, source);

    assert.equal(clearContentErrorIfCurrent(state, revision, source), true);
    assert.equal(state.lastError, null);
    assert.equal(state.lastErrorSource, null);
  }
});

test("a setting retry does not clear an unrelated file or renderer error", () => {
  for (const source of ["file-load", "renderer-runtime"]) {
    const state = createErrorState();
    const revision = setContentError(state, `Current ${source} error.`, source);

    assert.equal(clearContentErrorIfCurrent(
      state,
      revision,
      `message:${CONTENT.SET_RENDERER_PREFERENCE}`
    ), false);
    assert.equal(state.lastError, `Current ${source} error.`);
    assert.equal(state.lastErrorSource, source);
  }
});

test("a setting retry cannot clear a newer error from the same command", () => {
  const state = createErrorState();
  const source = `message:${CONTENT.SET_RENDERER_PREFERENCE}`;
  const retryRevision = setContentError(state, "First invalid renderer.", source);
  setContentError(state, "Newer invalid renderer.", source);

  assert.equal(clearContentErrorIfCurrent(state, retryRevision, source), false);
  assert.equal(state.lastError, "Newer invalid renderer.");
  assert.equal(state.lastErrorSource, source);
});

function createErrorState() {
  return {
    lastError: null,
    lastErrorRevision: 0,
    lastErrorSource: null
  };
}
