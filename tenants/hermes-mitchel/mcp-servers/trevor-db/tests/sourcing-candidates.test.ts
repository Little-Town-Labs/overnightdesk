import test from "node:test";
import assert from "node:assert/strict";
import { prospect, sourceCandidate } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { stageProspectCandidates, stageProspectCandidatesToMcp } from "../src/sourcing.js";

test("stages BrowserAct candidates with CamoFox enrichment attribution", async () => {
  const repo = new FakeQueueRepository([]);

  const result = await stageProspectCandidates(repo, {
    source: "browseract_google_maps",
    enrichmentSource: "camofox_contact_enrichment",
    area: "Tysons Corner, Virginia",
    keyword: "jewelry stores diamond dealers",
    requestedBy: "Mitchel",
    candidates: [sourceCandidate({ businessName: "Eravos Jewelers" })]
  });

  assert.equal(result.status, "staged");
  assert.equal(result.stagedCount, 1);
  assert.equal(result.candidates[0]?.leadSource, "browseract_google_maps");
  assert.equal(result.candidates[0]?.enrichmentSource, "camofox_contact_enrichment");
  assert.equal(result.candidates[0]?.reviewStatus, "recommended");
  assert.equal(repo.candidates.length, 0);

  const mcp = stageProspectCandidatesToMcp(result);
  assert.equal(mcp.candidates[0]?.lead_source, "browseract_google_maps");
  assert.equal(mcp.candidates[0]?.enrichment_source, "camofox_contact_enrichment");
});

test("flags chain stores and existing Trevor prospects during staging", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, name: "Existing Buyer", company: "Existing Jewelers" })
  ]);

  const result = await stageProspectCandidates(repo, {
    source: "browseract_google_maps",
    area: "Fairfax, Virginia",
    candidates: [
      sourceCandidate({ businessName: "KAY Jewelers", company: "KAY Jewelers" }),
      sourceCandidate({ businessName: "Existing Jewelers", company: "Existing Jewelers" })
    ]
  });

  assert.equal(result.stagedCount, 2);
  assert.equal(result.candidates[0]?.reviewStatus, "rejected");
  assert.equal(result.candidates[0]?.dedupeStatus, "duplicate");
  assert.match(result.candidates[0]?.dedupeReason ?? "", /chain/i);
  assert.equal(result.candidates[1]?.reviewStatus, "duplicate");
  assert.equal(result.candidates[1]?.dedupeStatus, "duplicate");
});
