import assert from "node:assert/strict";
import test from "node:test";
import { logManualFollowUpSent } from "../src/followup.js";
import { draft, interaction, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("rejects unapproved, discarded, and missing drafts without writing interactions", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.interactions.push(interaction({ id: 1, prospectId: 1 }));
  repo.drafts.push(
    draft({ id: 1, status: "draft" }),
    draft({ id: 2, status: "discarded" })
  );

  const draftResult = await logManualFollowUpSent(repo, {
    draftId: 1,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel"
  });
  const discardedResult = await logManualFollowUpSent(repo, {
    draftId: 2,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel"
  });
  const missingResult = await logManualFollowUpSent(repo, {
    draftId: 99,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel"
  });

  assert.equal(draftResult.status, "blocked");
  assert.equal(discardedResult.status, "blocked");
  assert.equal(missingResult.status, "not_found");
  assert.equal(repo.interactions.length, 1);
});

test("requires audit-only reason for do-not-contact manual sent logging", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1, doNotContact: true, status: "do_not_contact" })]);
  repo.interactions.push(interaction({ id: 1, prospectId: 1 }));
  repo.drafts.push(draft({
    id: 7,
    prospectId: 1,
    status: "approved",
    approvedBy: "Mitchel",
    approvedAt: new Date("2026-06-24T18:30:00Z")
  }));

  const blocked = await logManualFollowUpSent(repo, {
    draftId: 7,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel"
  });
  const logged = await logManualFollowUpSent(repo, {
    draftId: 7,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel",
    auditOnlyReason: "Historical note for outreach that happened before DNC review."
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(logged.status, "logged");
  assert.equal(logged.auditOnly, true);
  assert.equal(repo.interactions.length, 2);
  assert.match(repo.interactions.at(-1)?.summary ?? "", /audit-only/i);
});
