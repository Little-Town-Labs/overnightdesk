import assert from "node:assert/strict";
import test from "node:test";
import { generateFollowUpDraft } from "../src/followup.js";
import { draft, interaction, prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("generates and stores an email follow-up draft from a captured interaction", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 10, name: "Email Buyer", notes: "Prefers GIA round stones." })
  ]);
  repo.interactions.push(interaction({
    id: 22,
    prospectId: 10,
    summary: "Buyer asked for a 2ct GIA round quote."
  }));

  const result = await generateFollowUpDraft(repo, {
    interactionId: 22,
    channel: "email"
  });

  assert.equal(result.status, "drafted");
  assert.equal(result.draftId, 1);
  assert.equal(result.prospectId, 10);
  assert.equal(result.interactionId, 22);
  assert.equal(result.channel, "email");
  assert.equal(result.draftStatus, "draft");
  assert.ok(result.subject);
  assert.ok(result.body?.includes("2ct GIA round quote"));
  assert.equal(result.outboundSent, false);
  assert.equal(repo.drafts.length, 1);
});

test("returns an existing active draft for the same interaction and channel", async () => {
  const repo = new FakeQueueRepository([prospect({ id: 10 })]);
  repo.interactions.push(interaction({ id: 22, prospectId: 10 }));
  repo.drafts.push(draft({ id: 7, prospectId: 10, interactionId: 22, channel: "email" }));

  const result = await generateFollowUpDraft(repo, {
    interactionId: 22,
    channel: "email"
  });

  assert.equal(result.status, "existing");
  assert.equal(result.draftId, 7);
  assert.equal(repo.drafts.length, 1);
});
