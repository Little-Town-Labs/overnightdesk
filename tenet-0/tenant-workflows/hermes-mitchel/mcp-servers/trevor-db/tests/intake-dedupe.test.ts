import assert from "node:assert/strict";
import test from "node:test";
import { captureBuyerIntake } from "../src/intake.js";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";

test("updates an existing buyer on exact phone or email match", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 9, name: "Existing Buyer", company: "Existing Jewelers", phone: "703-555-0199", email: "buyer@example.test" })
  ]);

  const result = await captureBuyerIntake(repo, {
    source: "referral",
    name: "Existing Buyer",
    company: "Existing Jewelers",
    phone: "(703) 555-0199",
    conversationSummary: "Buyer is now looking for matching earrings.",
    outcome: "follow_up_later",
    agiledSync: "link_only"
  });

  assert.equal(result.status, "updated");
  assert.equal(result.dedupeStatus, "matched_existing");
  assert.equal(result.prospectId, 9);
  assert.equal(result.interactionId, 1);
  assert.equal(result.agiled.status, "linked");
  assert.equal(repo.candidates.length, 1);
  assert.equal(repo.interactions[0]?.prospectId, 9);
});

test("returns needs_review for ambiguous name and company matches without writing", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 3, name: "Alex Smith", company: "Capital Jewelers", phone: "703-555-0100", email: null }),
    prospect({ id: 4, name: "Alexandra Smith", company: "Capital Jewelers", phone: "703-555-0111", email: null })
  ]);

  const result = await captureBuyerIntake(repo, {
    source: "manual_entry",
    name: "Alex Smith",
    company: "Capital Jewelers",
    conversationSummary: "Asked for a later review."
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.dedupeStatus, "needs_review");
  assert.equal(result.dedupeMatches.length, 2);
  assert.equal(result.interactionId, null);
  assert.equal(repo.interactions.length, 0);
});

test("reports Agiled failure without rolling back local Trevor intake", async () => {
  const repo = new FakeQueueRepository([]);

  const result = await captureBuyerIntake(repo, {
    source: "trade_show",
    company: "Show Floor Diamonds",
    email: "buyer@show.example",
    conversationSummary: "Asked for available parcel pricing.",
    agiledSync: "create_or_update",
    agiledSyncStatus: "failed"
  });

  assert.equal(result.status, "created");
  assert.equal(result.prospectId, 1);
  assert.equal(result.interactionId, 1);
  assert.equal(result.agiled.status, "failed");
  assert.match(result.warnings[0] ?? "", /Agiled/);
});
