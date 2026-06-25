import assert from "node:assert/strict";
import test from "node:test";
import { captureBuyerIntake } from "../src/intake.js";
import { prospect, task } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("creates or reuses a call task for a valid requested next action", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 12, phone: "703-555-0120", email: null })
  ]);

  const result = await captureBuyerIntake(repo, {
    source: "phone_call",
    prospectId: 12,
    conversationSummary: "Buyer wants another call tomorrow.",
    outcome: "follow_up_later",
    nextActionType: "call",
    nextActionAt: "2026-06-25T15:00:00Z",
    createCallTask: true
  });

  assert.equal(result.status, "updated");
  assert.equal(result.callTaskId, 1001);
  assert.equal(result.nextActions[0]?.type, "call_task");
  assert.equal(result.nextActions[0]?.status, "created");
  assert.equal(result.outboundSent, false);

  const repeated = await captureBuyerIntake(repo, {
    source: "phone_call",
    prospectId: 12,
    conversationSummary: "Confirmed same callback.",
    outcome: "follow_up_later",
    nextActionType: "call",
    nextActionAt: "2026-06-25T17:00:00Z",
    createCallTask: true
  });

  assert.equal(repeated.callTaskId, 1001);
  assert.equal(repeated.nextActions[0]?.status, "reused");
  assert.equal(repo.tasks.length, 1);
});

test("creates a follow-up draft from intake without sending outbound", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 20, email: "buyer@example.test", preferredChannel: "email" })
  ]);

  const result = await captureBuyerIntake(repo, {
    source: "phone_call",
    prospectId: 20,
    conversationSummary: "Buyer requested a written recap of emerald cut options.",
    outcome: "interested",
    createFollowUpDraft: true
  });

  assert.equal(result.status, "updated");
  assert.equal(result.followUpDraftId, 1);
  assert.equal(result.nextActions[0]?.type, "follow_up_draft");
  assert.equal(result.nextActions[0]?.status, "created");
  assert.equal(result.outboundSent, false);
  assert.equal(repo.drafts[0]?.status, "draft");
});

test("suppresses call tasks and persuasive drafts for do-not-contact buyers", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 30, doNotContact: true, status: "do_not_contact", email: "blocked@example.test" })
  ]);
  repo.tasks.push(task({ id: 45, prospectId: 30, status: "discarded" }));

  const result = await captureBuyerIntake(repo, {
    source: "manual_entry",
    prospectId: 30,
    conversationSummary: "Do not contact again.",
    outcome: "do_not_contact",
    nextActionType: "call",
    nextActionAt: "2026-06-25T15:00:00Z",
    createCallTask: true,
    createFollowUpDraft: true
  });

  assert.equal(result.status, "updated");
  assert.equal(result.callTaskId, null);
  assert.equal(result.followUpDraftId, null);
  assert.equal(result.nextActions.length, 2);
  assert.equal(result.nextActions.every((item) => item.status === "blocked"), true);
  assert.equal(result.outboundSent, false);
  assert.equal(repo.tasks.filter((item) => item.status === "open").length, 0);
  assert.equal(repo.drafts.length, 0);
});

test("does not clear existing do-not-contact status during a normal update", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 31, doNotContact: true, status: "do_not_contact", email: "blocked@example.test" })
  ]);

  const result = await captureBuyerIntake(repo, {
    source: "manual_entry",
    prospectId: 31,
    conversationSummary: "Historical note only; keep suppression in place.",
    outcome: "info_only",
    nextActionType: "call",
    nextActionAt: "2026-06-25T15:00:00Z",
    createCallTask: true
  });

  assert.equal(result.status, "updated");
  assert.equal(repo.candidates[0]?.doNotContact, true);
  assert.equal(result.callTaskId, null);
  assert.equal(result.nextActions[0]?.status, "blocked");
  assert.equal(result.outboundSent, false);
});
