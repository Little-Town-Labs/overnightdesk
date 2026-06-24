import test from "node:test";
import assert from "node:assert/strict";
import { stagedCandidate } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { promoteProspectCandidate, promoteProspectCandidateToMcp } from "../src/sourcing.js";

test("promotes explicitly approved candidates into prospects and initial call tasks", async () => {
  const repo = new FakeQueueRepository([]);
  repo.sourcingCandidates.push(stagedCandidate({ id: 7, reviewStatus: "recommended" }));

  const result = await promoteProspectCandidate(repo, {
    candidateId: 7,
    approvedBy: "Mitchel",
    createCallTask: true
  });

  assert.equal(result.status, "promoted");
  assert.equal(result.prospectId, 1);
  assert.equal(result.callTaskId, 1001);
  assert.equal(repo.candidates[0]?.company, "Independent Jewelers");
  assert.equal(repo.candidates[0]?.status, "active");
  assert.equal(repo.tasks.length, 1);
  assert.equal(result.outboundSent, false);

  const mcp = promoteProspectCandidateToMcp(result);
  assert.equal(mcp.prospect_id, 1);
  assert.equal(mcp.outbound_sent, false);
});

test("does not duplicate call tasks on repeated promotion", async () => {
  const repo = new FakeQueueRepository([]);
  repo.sourcingCandidates.push(stagedCandidate({ id: 7, reviewStatus: "approved", promotedProspectId: 3 }));
  repo.candidates.push({
    id: 3,
    name: "Independent Jewelers",
    company: "Independent Jewelers",
    email: null,
    phone: "555-0199",
    status: "active",
    notes: "Existing promoted prospect.",
    agiledContactId: null,
    preferredChannel: "phone",
    doNotContact: false,
    lastOutcome: null,
    nextActionType: "initial_outreach",
    nextActionAt: null,
    priority: 1,
    updatedAt: new Date("2026-06-24T20:00:00Z"),
    lastInteractionAt: null
  });
  repo.tasks.push({ id: 44, prospectId: 3, status: "open", dueAt: new Date("2026-06-24T20:00:00Z") });

  const result = await promoteProspectCandidate(repo, {
    candidateId: 7,
    approvedBy: "Mitchel",
    createCallTask: true
  });

  assert.equal(result.status, "promoted");
  assert.equal(result.prospectId, 3);
  assert.equal(result.callTaskId, 44);
  assert.equal(repo.tasks.length, 1);
});
