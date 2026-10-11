import assert from "node:assert/strict";
import test from "node:test";

import {
  getSubtitleAdjustmentFields,
  normalizeSubtitleAdjustments
} from "../../src/shared/settings.js";

test("opacity supports a minimum of zero", () => {
  const opacityField = getSubtitleAdjustmentFields().find((field) => field.key === "opacity");

  assert.equal(opacityField.minValue, 0);
  assert.equal(opacityField.inputMin, 0);
  assert.equal(normalizeSubtitleAdjustments({ opacity: 0 }).opacity, 0);
  assert.equal(normalizeSubtitleAdjustments({ opacity: -1 }).opacity, 0);
});
