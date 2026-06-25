import assert from "node:assert/strict";
import test from "node:test";
import { generateCadenceDigest } from "../src/digest.js";
import { draft, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("includes only draft follow-ups awaiting approval", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1, name: "Draft Buyer" })]);
  repo.drafts.push(draft({ id: 1, prospectId: 1, status: "draft", body: "Full body should stay out of digest." }));
  repo.drafts.push(draft({ id: 2, prospectId: 1, status: "approved" }));
  repo.drafts.push(draft({ id: 3, prospectId: 1, status: "discarded" }));

  const result = await generateCadenceDigest(repo, { salesDay: "2026-06-24" });

  assert.equal(result.followUpApprovals.length, 1);
  assert.equal(result.followUpApprovals[0].draftId, 1);
  assert.equal(result.followUpApprovals[0].status, "draft");
  assert.equal("body" in result.followUpApprovals[0], false);
});

test("includes stale and dormant work with bounded next-step summaries", async () => {
  const repo = new FakeQueueRepository([
    prospect({
      id: 10,
      name: "Overdue Buyer",
      nextActionType: "follow_up",
      nextActionAt: new Date("2026-06-01T14:00:00Z"),
      lastInteractionAt: new Date("2026-05-01T14:00:00Z")
    }),
    prospect({
      id: 11,
      name: "Dormant Buyer",
      nextActionType: null,
      nextActionAt: null,
      lastInteractionAt: new Date("2026-03-01T14:00:00Z")
    })
  ]);

  const result = await generateCadenceDigest(repo, { salesDay: "2026-06-24", includeDormant: true });

  assert.ok(result.staleWork.some((item) => item.prospectId === 10 && item.reason.includes("overdue")));
  assert.ok(result.staleWork.some((item) => item.prospectId === 11 && item.reason.includes("dormant")));
  assert.ok(result.staleWork.every((item) => item.suggestedNextStep.length > 0));
});
