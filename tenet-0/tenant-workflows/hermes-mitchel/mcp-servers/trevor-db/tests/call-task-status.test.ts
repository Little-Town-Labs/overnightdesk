import assert from "node:assert/strict";
import test from "node:test";
import { listCallTasks, markCallTaskStatus } from "../src/queue.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("lists and marks call task status without creating interactions", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.tasks.push(task({ id: 55, prospectId: 1 }));

  const listed = await listCallTasks(repo, "open", "2026-06-24", 10);
  assert.equal(listed.tasks[0]?.taskId, 55);

  const marked = await markCallTaskStatus(repo, 55, "completed");
  assert.equal(marked.updated, true);
  assert.equal(marked.status, "completed");
  assert.ok(marked.completedAt);
});

test("rejects reopening a call task for a do-not-contact prospect", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1, doNotContact: true })]);
  repo.tasks.push(task({ id: 56, prospectId: 1, status: "snoozed" }));

  await assert.rejects(
    () => markCallTaskStatus(repo, 56, "open"),
    /do-not-contact/
  );
});
