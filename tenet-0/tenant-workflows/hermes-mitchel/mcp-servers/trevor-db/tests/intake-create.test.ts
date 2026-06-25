import assert from "node:assert/strict";
import test from "node:test";
import { captureBuyerIntake, buyerIntakeToMcp } from "../src/intake.js";
import { FakeQueueRepository } from "./test-repo.js";

test("captures a new buyer conversation into Trevor without outbound side effects", async () => {
  const repo = new FakeQueueRepository([]);

  const result = await captureBuyerIntake(repo, {
    requestedBy: "Mitchel",
    source: "phone_call",
    name: "Dana Buyer",
    company: "Dana Fine Jewelry",
    phone: "703-555-0101",
    email: "dana@example.test",
    preferences: "Looking for GIA round diamonds, 1.5ct to 2ct.",
    conversationChannel: "phone",
    conversationSummary: "Dana asked for pricing on 1.5ct and 2ct GIA round stones. Follow up next Tuesday.",
    outcome: "interested"
  });

  assert.equal(result.status, "created");
  assert.equal(result.dedupeStatus, "unique");
  assert.equal(result.prospectId, 1);
  assert.equal(result.interactionId, 1);
  assert.equal(result.outboundSent, false);
  assert.equal(repo.candidates.length, 1);
  assert.equal(repo.candidates[0]?.company, "Dana Fine Jewelry");
  assert.equal(repo.candidates[0]?.lastOutcome, "interested");
  assert.match(repo.candidates[0]?.notes ?? "", /Source: phone_call/);
  assert.equal(repo.interactions.length, 1);
  assert.match(repo.interactions[0]?.summary ?? "", /Dana asked for pricing/);

  const mcp = buyerIntakeToMcp(result);
  assert.equal(mcp.outbound_sent, false);
  assert.equal(mcp.prospect_id, 1);
});

test("returns missing fields before writing anonymous durable buyer records", async () => {
  const repo = new FakeQueueRepository([]);

  const result = await captureBuyerIntake(repo, {
    source: "manual_entry",
    conversationSummary: "Met someone who may buy later."
  });

  assert.equal(result.status, "rejected");
  assert.deepEqual(result.missingFields, ["identity_or_contact"]);
  assert.equal(result.prospectId, null);
  assert.equal(result.interactionId, null);
  assert.equal(result.outboundSent, false);
  assert.equal(repo.candidates.length, 0);
  assert.equal(repo.interactions.length, 0);
});
