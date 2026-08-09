import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldAlert } from "../src/lib/alerts";

test("alerts on a transition into a low-supply state", () => {
  assert.equal(shouldAlert("AVAILABLE", "LOW_STOCK"), true);
  assert.equal(shouldAlert("LOW_STOCK", "CRITICAL"), true);
  assert.equal(shouldAlert("AVAILABLE", "OUT_OF_STOCK"), true);
});

test("never alerts when the status stays the same", () => {
  assert.equal(shouldAlert("LOW_STOCK", "LOW_STOCK"), false);
  assert.equal(shouldAlert("OUT_OF_STOCK", "OUT_OF_STOCK"), false);
});

test("never alerts on recovery", () => {
  assert.equal(shouldAlert("CRITICAL", "AVAILABLE"), false);
  assert.equal(shouldAlert("OUT_OF_STOCK", "LOW_STOCK"), false);
});
