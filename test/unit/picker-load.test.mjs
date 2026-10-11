import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelPendingPickerLoad,
  handlePickerFile
} from "../../src/content/picker.js";

test("a slower old file read cannot replace a newer selection", async () => {
  const oldRead = createDeferred();
  const status = createStatus();
  const picker = createPicker(status);
  const state = {
    lastError: null,
    picker
  };
  const loaded = [];
  const context = {
    state,
    trace() {},
    async loadSubtitle(message) {
      loaded.push(message.name);
      return {
        ok: true,
        message: `Loaded ${message.name}.`
      };
    }
  };

  const oldLoad = handlePickerFile(
    context,
    picker,
    createFile("old.ass", oldRead.promise),
    "utf-8",
    status
  );
  const newLoad = handlePickerFile(
    context,
    picker,
    createFile("new.ass", Promise.resolve(encode("new subtitle"))),
    "utf-8",
    status
  );

  await newLoad;
  oldRead.resolve(encode("old subtitle"));
  await oldLoad;

  assert.deepEqual(loaded, ["new.ass"]);
  assert.equal(status.textContent, "Loaded new.ass.");
  assert.equal(status.dataset.state, "normal");
  assert.equal(state.lastError, null);
});

test("a stale load response cannot overwrite newer status or errors", async () => {
  const oldResponse = createDeferred();
  const oldStarted = createDeferred();
  const status = createStatus();
  const picker = createPicker(status);
  const state = {
    lastError: null,
    picker
  };
  const context = {
    state,
    trace() {},
    loadSubtitle(message) {
      if (message.name === "old.ass") {
        oldStarted.resolve();
        return oldResponse.promise;
      }
      return Promise.resolve({
        ok: true,
        message: `Loaded ${message.name}.`
      });
    }
  };

  const oldLoad = handlePickerFile(
    context,
    picker,
    createFile("old.ass", Promise.resolve(encode("old subtitle"))),
    "utf-8",
    status
  );
  await oldStarted.promise;
  await handlePickerFile(
    context,
    picker,
    createFile("new.ass", Promise.resolve(encode("new subtitle"))),
    "utf-8",
    status
  );
  oldResponse.resolve({
    ok: false,
    error: "Old renderer failed."
  });
  await oldLoad;

  assert.equal(status.textContent, "Loaded new.ass.");
  assert.equal(status.dataset.state, "normal");
  assert.equal(state.lastError, null);
});

test("removing or replacing the picker invalidates a pending file read", async () => {
  const read = createDeferred();
  const status = createStatus();
  const picker = createPicker(status);
  const state = {
    lastError: null,
    picker
  };
  let loadCount = 0;
  const pending = handlePickerFile({
    state,
    trace() {},
    async loadSubtitle() {
      loadCount += 1;
      return { ok: true };
    }
  }, picker, createFile("removed.ass", read.promise), "utf-8", status);

  cancelPendingPickerLoad(state);
  state.picker = null;
  read.resolve(encode("removed subtitle"));
  await pending;

  assert.equal(loadCount, 0);
  assert.equal(state.lastError, null);
});

test("a load superseded outside the picker does not become a picker error", async () => {
  const status = createStatus();
  const picker = createPicker(status);
  const state = {
    lastError: null,
    picker
  };

  await handlePickerFile({
    state,
    trace() {},
    async loadSubtitle() {
      return {
        ok: false,
        superseded: true,
        error: "Subtitle load was superseded."
      };
    }
  }, picker, createFile("old.ass", Promise.resolve(encode("old subtitle"))), "utf-8", status);

  assert.equal(status.textContent, "Another subtitle load replaced this selection.");
  assert.equal(status.dataset.state, "normal");
  assert.equal(state.lastError, null);
});

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve
  };
}

function createFile(name, buffer) {
  return {
    name,
    size: 12,
    type: "text/plain",
    arrayBuffer() {
      return buffer;
    }
  };
}

function createPicker(status) {
  return {
    loadGeneration: 0,
    status
  };
}

function createStatus() {
  return {
    textContent: "No subtitle file loaded.",
    dataset: {
      state: "normal"
    }
  };
}

function encode(value) {
  return new TextEncoder().encode(value).buffer;
}
