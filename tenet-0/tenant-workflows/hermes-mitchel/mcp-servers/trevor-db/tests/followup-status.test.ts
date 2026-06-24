import assert from "node:assert/strict";
import test from "node:test";
import { markFollowUpDraft } from "../src/followup.js";
import { draft, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("approves and discards drafts without sending outbound messages", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.drafts.push(draft({ id: 7, status: "draft" }));
  repo.drafts.push(draft({ id: 8, status: "draft" }));

  const approved = await markFollowUpDraft(repo, {
    draftId: 7,
    action: "approve",
    approvedBy: "Mitchel"
  });
  const discarded = await markFollowUpDraft(repo, {
    draftId: 8,
    action: "discard"
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.draftStatus, "approved");
  assert.equal(approved.outboundSent, false);
  assert.equal(discarded.status, "discarded");
  assert.equal(discarded.draftStatus, "discarded");
  assert.equal(discarded.outboundSent, false);
});

test("does not approve a discarded draft", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.drafts.push(draft({ id: 7, status: "discarded" }));

  const result = await markFollowUpDraft(repo, {
    draftId: 7,
    action: "approve",
    approvedBy: "Mitchel"
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.draftStatus, "discarded");
  assert.equal(result.outboundSent, false);
});
