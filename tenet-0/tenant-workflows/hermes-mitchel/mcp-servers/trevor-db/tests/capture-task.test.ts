import assert from "node:assert/strict";
import test from "node:test";
import { capturePostCall } from "../src/capture.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("captures a task-anchored completed call without outbound side effects", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 10, name: "Task Buyer", nextActionType: "call" })
  ]);
  repo.tasks.push(task({ id: 55, prospectId: 10, status: "open" }));

  const result = await capturePostCall(repo, {
    taskId: 55,
    outcome: "interested",
    summary: "Buyer asked for a 2ct GIA round quote.",
    nextActionType: "quote",
    nextActionAt: "2026-06-25T15:00:00Z"
  });

  assert.equal(result.status, "captured");
  assert.equal(result.prospectId, 10);
  assert.equal(result.taskId, 55);
  assert.equal(result.interactionId, 1);
  assert.equal(result.taskStatus, "completed");
  assert.equal(result.outboundSent, false);
  assert.equal(repo.interactions.length, 1);
  assert.equal(repo.tasks[0]?.status, "completed");
  const updated = repo.candidates.find((candidate) => candidate.id === 10);
  assert.equal(updated?.lastOutcome, "interested");
  assert.equal(updated?.nextActionType, "quote");
  assert.equal(updated?.nextActionAt?.toISOString(), "2026-06-25T15:00:00.000Z");
});
