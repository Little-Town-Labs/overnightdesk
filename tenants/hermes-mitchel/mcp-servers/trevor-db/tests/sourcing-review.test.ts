import test from "node:test";
import assert from "node:assert/strict";
import { stagedCandidate } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { reviewProspectCandidates, reviewProspectCandidatesToMcp } from "../src/sourcing.js";

test("reviews staged candidates with bounded counts", async () => {
  const repo = new FakeQueueRepository([]);
  repo.sourcingCandidates.push(
    stagedCandidate({ id: 1, reviewStatus: "recommended" }),
    stagedCandidate({ id: 2, businessName: "Needs Phone", phone: null, reviewStatus: "needs_review" }),
    stagedCandidate({ id: 3, businessName: "Duplicate", reviewStatus: "duplicate", dedupeStatus: "duplicate" })
  );

  const result = await reviewProspectCandidates(repo, { limit: 10 });

  assert.equal(result.status, "ok");
  assert.equal(result.counts.recommended, 1);
  assert.equal(result.counts.needsReview, 1);
  assert.equal(result.counts.duplicate, 1);
  assert.equal(result.items.length, 3);

  const mcp = reviewProspectCandidatesToMcp(result);
  assert.equal(mcp.counts.needs_review, 1);
  assert.equal(mcp.items[0]?.review_status, "recommended");
});
