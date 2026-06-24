import assert from "node:assert/strict";
import test from "node:test";
import { cadenceDigestToMcp, generateCadenceDigest } from "../src/digest.js";
import { draft, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("maps cadence digest output to the documented snake_case MCP contract", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 3, name: "Contract Buyer", nextActionAt: new Date("2026-06-24T14:00:00Z") })
  ]);
  repo.drafts.push(draft({ id: 30, prospectId: 3, status: "draft" }));

  const result = cadenceDigestToMcp(await generateCadenceDigest(repo, {
    salesDay: "2026-06-24",
    scheduled: true
  }));

  assert.equal(result.status, "generated");
  assert.equal(result.sales_day, "2026-06-24");
  assert.equal(result.scheduled, true);
  assert.equal(result.persisted_call_tasks, false);
  assert.equal(result.counts.follow_up_drafts, 1);
  assert.ok(Array.isArray(result.call_queue));
  assert.ok(Array.isArray(result.review_needed));
  assert.ok(Array.isArray(result.stale_work));
  assert.ok(Array.isArray(result.follow_up_approvals));
  assert.equal(result.side_effects.outbound_sent, false);
  assert.equal(result.side_effects.interactions_created, 0);
  assert.equal(result.side_effects.follow_up_drafts_created, 0);
});
