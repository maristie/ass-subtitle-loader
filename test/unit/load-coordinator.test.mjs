import assert from "node:assert/strict";
import test from "node:test";

import { createSubtitleLoadCoordinator } from "../../src/content/load-coordinator.js";

test("a new intent cancels an older load that already entered attachment", () => {
  const canceled = [];
  const coordinator = createSubtitleLoadCoordinator({
    onCancelPending(revision) {
      canceled.push(revision);
    }
  });

  const oldRevision = coordinator.begin();
  assert.equal(coordinator.start(oldRevision), true);
  const newRevision = coordinator.begin();

  assert.deepEqual(canceled, [oldRevision]);
  assert.equal(coordinator.isCurrent(oldRevision), false);
  assert.equal(coordinator.isCurrent(newRevision), true);
  assert.equal(coordinator.start(oldRevision), false);
  assert.equal(coordinator.start(newRevision), true);
});

test("starting a new read does not discard a completed subtitle", () => {
  const canceled = [];
  const coordinator = createSubtitleLoadCoordinator({
    onCancelPending(revision) {
      canceled.push(revision);
    }
  });

  const loadedRevision = coordinator.begin();
  assert.equal(coordinator.start(loadedRevision), true);
  coordinator.complete(loadedRevision);
  const nextRevision = coordinator.begin();

  assert.deepEqual(canceled, []);
  assert.equal(coordinator.isCurrent(nextRevision), true);
});

test("closing a picker invalidates its read before attachment starts", () => {
  const coordinator = createSubtitleLoadCoordinator();
  const revision = coordinator.begin();

  assert.equal(coordinator.cancel(revision), true);
  assert.equal(coordinator.isCurrent(revision), false);
  assert.equal(coordinator.start(revision), false);
  assert.equal(coordinator.cancel(revision), false);
});
