import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendations } from "../src/queue.js";
import { prospect } from "./fixtures.js";

test("missing phone moves prospect to review_needed instead of callable queue", () => {
  const result = buildRecommendations([
    prospect({ id: 1, phone: null, name: "Needs Phone" }),
    prospect({ id: 2, phone: "555-2222", name: "Ready" })
  ], "2026-06-24");

  assert.deepEqual(result.recommendations.map((item) => item.prospectId), [2]);
  assert.deepEqual(result.reviewNeeded.map((item) => item.prospectId), [1]);
  assert.ok(result.reviewNeeded[0]?.missingContext.includes("phone"));
});
