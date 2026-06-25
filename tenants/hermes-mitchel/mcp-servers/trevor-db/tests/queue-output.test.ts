import assert from "node:assert/strict";
import test from "node:test";
import { generateDailyCallQueue, queueRunToMcp } from "../src/queue.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("generate_daily_call_queue returns required recommendation fields without persistence", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 10, name: "Mitchel Buyer", company: "Diamond Co", priority: 4 })
  ]);

  const result = await generateDailyCallQueue(repo, {
    salesDay: "2026-06-24",
    persist: false
  });

  assert.equal(result.persisted, false);
  assert.equal(result.counts.recommendations, 1);
  assert.equal(result.recommendations[0]?.taskId, null);
  assert.match(result.recommendations[0]?.reason ?? "", /next action|priority|review/i);
  assert.ok(result.recommendations[0]?.callObjective);
  assert.ok(result.recommendations[0]?.buyerContext);
  assert.ok(result.recommendations[0]?.suggestedOpener);
});

test("maps queue output to the documented MCP snake_case contract", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 10, name: "Mitchel Buyer", company: "Diamond Co", priority: 4 })
  ]);

  const result = queueRunToMcp(await generateDailyCallQueue(repo, {
    salesDay: "2026-06-24",
    persist: true
  }));

  assert.equal(result.sales_day, "2026-06-24");
  assert.equal(result.counts.created_tasks, 1);
  assert.equal(result.recommendations[0]?.prospect_id, 10);
  assert.equal(result.recommendations[0]?.task_id, 1001);
  assert.ok(result.recommendations[0]?.call_objective);
  assert.ok(!("salesDay" in result));
});
