import test from "node:test";
import assert from "node:assert/strict";
import { stagedCandidate, sourceCandidate } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { promoteProspectCandidate, stageProspectCandidates } from "../src/sourcing.js";

test("redacts secret-like scraped notes before staging", async () => {
  const repo = new FakeQueueRepository([]);
  const result = await stageProspectCandidates(repo, {
    source: "browseract_google_maps",
    area: "Tysons Corner, Virginia",
    candidates: [
      sourceCandidate({
        notes: "Great lead. Authorization: Bearer app-abc123456789SECRET and CAMOFOX_API_KEY=abcdef1234567890abcdef1234567890"
      })
    ]
  });

  assert.doesNotMatch(result.candidates[0]?.reviewNotes ?? "", /app-abc|abcdef123/);
  assert.match(result.candidates[0]?.reviewNotes ?? "", /\[redacted\]/);
});

test("blocks promotion without an approver", async () => {
  const repo = new FakeQueueRepository([]);
  repo.sourcingCandidates.push(stagedCandidate({ id: 9 }));

  const result = await promoteProspectCandidate(repo, {
    candidateId: 9,
    approvedBy: "",
    createCallTask: true
  });

  assert.equal(result.status, "needs_review");
  assert.equal(repo.candidates.length, 0);
  assert.equal(repo.tasks.length, 0);
});

test("does not promote rejected or duplicate candidates", async () => {
  const repo = new FakeQueueRepository([]);
  repo.sourcingCandidates.push(stagedCandidate({ id: 9, reviewStatus: "duplicate", dedupeStatus: "duplicate" }));

  const result = await promoteProspectCandidate(repo, {
    candidateId: 9,
    approvedBy: "Mitchel",
    createCallTask: true
  });

  assert.equal(result.status, "duplicate");
  assert.equal(repo.candidates.length, 0);
  assert.equal(repo.tasks.length, 0);
});
