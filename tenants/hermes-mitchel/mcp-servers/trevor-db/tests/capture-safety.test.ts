import assert from "node:assert/strict";
import test from "node:test";
import { capturePostCall } from "../src/capture.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("does not duplicate capture for an already completed task", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.tasks.push(task({ id: 55, prospectId: 1, status: "completed" }));

  const result = await capturePostCall(repo, {
    taskId: 55,
    outcome: "no_answer"
  });

  assert.equal(result.status, "duplicate");
  assert.equal(result.outboundSent, false);
  assert.equal(repo.interactions.length, 0);
});

test("marks do-not-contact outcomes and does not send follow-up", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.tasks.push(task({ id: 56, prospectId: 1 }));

  const result = await capturePostCall(repo, {
    taskId: 56,
    outcome: "do_not_contact",
    summary: "Buyer asked not to be contacted again."
  });

  assert.equal(result.status, "captured");
  assert.equal(result.outboundSent, false);
  const updated = repo.candidates[0];
  assert.equal(updated?.doNotContact, true);
  assert.equal(updated?.status, "do_not_contact");
  assert.ok(result.prospectUpdates.includes("do_not_contact"));
});
