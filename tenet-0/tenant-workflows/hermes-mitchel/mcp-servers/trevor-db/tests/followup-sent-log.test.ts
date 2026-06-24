import assert from "node:assert/strict";
import test from "node:test";
import { logManualFollowUpSent } from "../src/followup.js";
import { draft, interaction, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("logs an approved draft as manually sent without outbound delivery", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 10, name: "Sent Buyer" })]);
  repo.interactions.push(interaction({ id: 77, prospectId: 10 }));
  repo.drafts.push(draft({
    id: 5,
    prospectId: 10,
    interactionId: 77,
    status: "approved",
    approvedBy: "Mitchel",
    approvedAt: new Date("2026-06-24T18:30:00Z")
  }));

  const result = await logManualFollowUpSent(repo, {
    draftId: 5,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel",
    externalMessageId: "gmail-msg-123"
  });

  assert.equal(result.status, "logged");
  assert.equal(result.draftId, 5);
  assert.equal(result.prospectId, 10);
  assert.equal(result.draftStatus, "manual_sent");
  assert.equal(result.sentAt?.toISOString(), "2026-06-24T19:00:00.000Z");
  assert.equal(result.outboundSent, false);
  assert.equal(result.interactionId, 1);
  assert.equal(repo.interactions.length, 2);
  assert.equal(repo.interactions.at(-1)?.direction, "outbound");
  assert.equal(repo.interactions.at(-1)?.channel, "email");
  assert.match(repo.interactions.at(-1)?.summary ?? "", /manual follow-up sent/i);
  assert.equal(repo.drafts[0]?.status, "manual_sent");
});

test("manual sent confirmation is idempotent for an already completed draft", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 10 })]);
  repo.interactions.push(interaction({ id: 77, prospectId: 10 }));
  repo.drafts.push(draft({
    id: 5,
    prospectId: 10,
    interactionId: 77,
    status: "approved",
    approvedBy: "Mitchel",
    approvedAt: new Date("2026-06-24T18:30:00Z")
  }));

  const first = await logManualFollowUpSent(repo, {
    draftId: 5,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel"
  });
  const second = await logManualFollowUpSent(repo, {
    draftId: 5,
    sentAt: "2026-06-24T19:00:00Z",
    confirmedBy: "Mitchel"
  });

  assert.equal(first.status, "logged");
  assert.equal(second.status, "logged");
  assert.equal(second.interactionId, first.interactionId);
  assert.equal(repo.interactions.length, 2);
});
