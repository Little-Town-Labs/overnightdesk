import assert from "node:assert/strict";
import test from "node:test";
import { generateCadenceDigest } from "../src/digest.js";
import { draft, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("generates an on-demand cadence digest with all required sections", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, name: "Call Buyer", nextActionAt: new Date("2026-06-24T14:00:00Z"), priority: 3 }),
    prospect({ id: 2, name: "Stale Buyer", lastInteractionAt: new Date("2026-04-01T14:00:00Z"), priority: 2 })
  ]);
  repo.drafts.push(draft({ id: 20, prospectId: 1, status: "draft", createdAt: new Date("2026-06-20T18:00:00Z") }));

  const result = await generateCadenceDigest(repo, {
    salesDay: "2026-06-24",
    persistCallTasks: false,
    scheduled: false
  });

  assert.equal(result.status, "generated");
  assert.equal(result.salesDay, "2026-06-24");
  assert.equal(result.scheduled, false);
  assert.equal(result.persistedCallTasks, false);
  assert.ok(result.callQueue.length > 0);
  assert.ok(Array.isArray(result.reviewNeeded));
  assert.ok(result.staleWork.length > 0);
  assert.equal(result.followUpApprovals.length, 1);
  assert.equal(result.counts.followUpDrafts, 1);
  assert.equal(result.sideEffects.outboundSent, false);
  assert.equal(result.sideEffects.interactionsCreated, 0);
  assert.equal(result.sideEffects.followUpDraftsCreated, 0);
});

test("does not write call tasks by default", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, name: "No Write Buyer", nextActionAt: new Date("2026-06-24T14:00:00Z") })
  ]);

  const result = await generateCadenceDigest(repo, { salesDay: "2026-06-24" });

  assert.equal(result.persistedCallTasks, false);
  assert.equal(repo.created, 0);
  assert.equal(repo.captured, 0);
  assert.equal(repo.drafts.length, 0);
  assert.equal(result.counts.createdTasks, 0);
});
