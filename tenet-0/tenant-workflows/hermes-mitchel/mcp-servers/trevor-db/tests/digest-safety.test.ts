import assert from "node:assert/strict";
import test from "node:test";
import { generateCadenceDigest } from "../src/digest.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("labels do-not-contact stale records as review-only and suppresses outreach", async () => {
  const repo = new FakeQueueRepository([
    prospect({
      id: 99,
      name: "Blocked Buyer",
      doNotContact: true,
      notes: "Private notes must not be exported in digest.",
      nextActionAt: new Date("2026-06-01T14:00:00Z"),
      lastInteractionAt: new Date("2026-05-01T14:00:00Z")
    })
  ]);

  const result = await generateCadenceDigest(repo, { salesDay: "2026-06-24" });

  assert.equal(result.callQueue.some((item) => item.prospectId === 99), false);
  const stale = result.staleWork.find((item) => item.prospectId === 99);
  assert.ok(stale);
  assert.equal(stale.reviewOnly, true);
  assert.ok(stale.suggestedNextStep.includes("Review contact status"));
  assert.equal(JSON.stringify(result).includes("Private notes"), false);
});
