import assert from "node:assert/strict";
import test from "node:test";
import { generateFollowUpDraft } from "../src/followup.js";
import { interaction, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("generates copy-ready drafts for Telegram, SMS, LinkedIn, and Instagram", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1, name: "Copy Buyer" })]);
  repo.interactions.push(interaction({ id: 2, prospectId: 1, summary: "Asked for oval options." }));

  for (const channel of ["telegram", "sms", "linkedin", "instagram"] as const) {
    const result = await generateFollowUpDraft(repo, { interactionId: 2, channel, regenerate: true });
    assert.equal(result.status, "drafted");
    assert.equal(result.channel, channel);
    assert.equal(result.subject, null);
    assert.ok(result.body?.includes("oval options"));
    assert.equal(result.outboundSent, false);
  }

  assert.equal(repo.drafts.length, 4);
});

test("rejects unsupported channels without writing a draft", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1 })]);
  repo.interactions.push(interaction({ id: 2, prospectId: 1 }));

  const result = await generateFollowUpDraft(repo, {
    interactionId: 2,
    channel: "fax" as never
  });

  assert.equal(result.status, "invalid");
  assert.ok(result.warnings.some((warning) => warning.includes("Unsupported channel")));
  assert.equal(repo.drafts.length, 0);
});

test("warns and avoids persuasive copy for do-not-contact prospects", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 1, doNotContact: true })]);
  repo.interactions.push(interaction({ id: 2, prospectId: 1 }));

  const result = await generateFollowUpDraft(repo, { interactionId: 2, channel: "email" });

  assert.equal(result.status, "drafted");
  assert.ok(result.warnings.some((warning) => warning.includes("do-not-contact")));
  assert.ok(result.body?.includes("Do not send"));
  assert.equal(result.outboundSent, false);
});
