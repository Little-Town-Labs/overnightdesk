import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendations } from "../src/queue.js";
import { prospect } from "./fixtures.js";

test("suppresses do-not-contact prospects from callable recommendations", () => {
  const result = buildRecommendations([
    prospect({ id: 1, doNotContact: true }),
    prospect({ id: 2, doNotContact: false })
  ], "2026-06-24");

  assert.equal(result.suppressed, 1);
  assert.deepEqual(result.recommendations.map((item) => item.prospectId), [2]);
});
