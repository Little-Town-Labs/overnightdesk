import assert from "node:assert/strict";
import test from "node:test";
import { capturePostCall } from "../src/capture.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("asks only for missing outcome and writes no partial records", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.tasks.push(task({ id: 55, prospectId: 1 }));

  const result = await capturePostCall(repo, { taskId: 55 });

  assert.equal(result.status, "needs_input");
  assert.deepEqual(result.missingFields, ["outcome"]);
  assert.equal(repo.interactions.length, 0);
  assert.equal(repo.tasks[0]?.status, "open");
});

test("asks for a call target when task and prospect are missing", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);

  const result = await capturePostCall(repo, {
    outcome: "no_answer"
  });

  assert.equal(result.status, "needs_input");
  assert.deepEqual(result.missingFields, ["task_id_or_prospect_id"]);
  assert.equal(repo.interactions.length, 0);
});

test("rejects an invalid next action timestamp without writing records", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.tasks.push(task({ id: 57, prospectId: 1 }));

  const result = await capturePostCall(repo, {
    taskId: 57,
    outcome: "left_voicemail",
    nextActionType: "call",
    nextActionAt: "not-a-date"
  });

  assert.equal(result.status, "needs_input");
  assert.deepEqual(result.missingFields, ["valid_next_action_at"]);
  assert.equal(repo.interactions.length, 0);
});
