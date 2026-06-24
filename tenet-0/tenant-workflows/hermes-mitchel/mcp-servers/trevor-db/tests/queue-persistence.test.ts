import assert from "node:assert/strict";
import test from "node:test";
import { generateDailyCallQueue } from "../src/queue.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("persisted queue generation reuses existing same-day open call tasks", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, name: "Stable Buyer" })
  ]);

  const first = await generateDailyCallQueue(repo, { salesDay: "2026-06-24", persist: true });
  const second = await generateDailyCallQueue(repo, { salesDay: "2026-06-24", persist: true });

  assert.equal(first.counts.createdTasks, 1);
  assert.equal(second.counts.createdTasks, 0);
  assert.equal(second.counts.reusedTasks, 1);
  assert.equal(first.recommendations[0]?.taskId, second.recommendations[0]?.taskId);
  assert.equal(repo.tasks.length, 1);
});
