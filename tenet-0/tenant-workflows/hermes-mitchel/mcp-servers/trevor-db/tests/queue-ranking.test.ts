import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendations } from "../src/queue.js";
import { prospect } from "./fixtures.js";

test("ranks overdue high-priority prospects first", () => {
  const result = buildRecommendations([
    prospect({ id: 1, name: "Low Due", priority: 1, nextActionAt: new Date("2026-06-24T12:00:00Z") }),
    prospect({ id: 2, name: "High Overdue", priority: 5, nextActionAt: new Date("2026-06-20T12:00:00Z") }),
    prospect({ id: 3, name: "Future", priority: 10, nextActionAt: new Date("2026-07-01T12:00:00Z") })
  ], "2026-06-24", { limit: 3 });

  assert.equal(result.recommendations[0]?.prospectId, 2);
  assert.deepEqual(result.recommendations.map((item) => item.rank), [1, 2, 3]);
  assert.ok(result.recommendations[0]?.rankingDrivers.includes("overdue_next_action"));
});

test("breaks equal-score ties by priority, next action, updated time, then prospect id", () => {
  const result = buildRecommendations([
    prospect({
      id: 4,
      priority: 2,
      nextActionAt: new Date("2026-06-24T16:00:00Z"),
      updatedAt: new Date("2026-06-23T12:00:00Z")
    }),
    prospect({
      id: 3,
      priority: 2,
      nextActionAt: new Date("2026-06-24T14:00:00Z"),
      updatedAt: new Date("2026-06-22T12:00:00Z")
    }),
    prospect({
      id: 2,
      priority: 2,
      nextActionAt: new Date("2026-06-24T14:00:00Z"),
      updatedAt: new Date("2026-06-23T12:00:00Z")
    })
  ], "2026-06-24", { limit: 3 });

  assert.deepEqual(result.recommendations.map((item) => item.prospectId), [2, 3, 4]);
});
