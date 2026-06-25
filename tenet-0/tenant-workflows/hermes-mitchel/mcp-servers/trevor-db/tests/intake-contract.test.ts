import assert from "node:assert/strict";
import test from "node:test";
import { captureBuyerIntake, buyerIntakeToMcp } from "../src/intake.js";
import { FakeQueueRepository } from "./test-repo.js";

test("accepts future mitchelbrown.com website source through the same intake contract", async () => {
  const repo = new FakeQueueRepository([]);

  const result = await captureBuyerIntake(repo, {
    source: "mitchelbrown.com",
    name: "Website Buyer",
    email: "website@example.test",
    website: "https://buyer.example",
    conversationChannel: "website",
    conversationSummary: "Interested in diamond buying options.",
    intakeMode: "validate_only"
  });

  assert.equal(result.status, "validation_only");
  assert.equal(result.prospectId, null);
  assert.equal(result.interactionId, null);
  assert.equal(result.outboundSent, false);

  const mcp = buyerIntakeToMcp(result);
  assert.equal(mcp.status, "validation_only");
  assert.equal(mcp.outbound_sent, false);
});

test("rejects incomplete website-style inquiries without creating call work", async () => {
  const repo = new FakeQueueRepository([]);

  const result = await captureBuyerIntake(repo, {
    source: "mitchelbrown.com",
    conversationChannel: "website",
    conversationSummary: "I am interested."
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.prospectId, null);
  assert.equal(result.callTaskId, null);
  assert.equal(result.followUpDraftId, null);
  assert.equal(repo.candidates.length, 0);
  assert.equal(repo.tasks.length, 0);
});
