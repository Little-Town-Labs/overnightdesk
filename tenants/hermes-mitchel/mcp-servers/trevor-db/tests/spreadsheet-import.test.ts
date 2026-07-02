import assert from "node:assert/strict";
import test from "node:test";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { importProspectSpreadsheetRows, prospectSpreadsheetImportToMcp } from "../src/spreadsheet-import.js";

test("imports normalized spreadsheet rows and seeds email enrichment queue", async () => {
  const repo = new FakeQueueRepository([
    prospect({
      id: 1,
      company: "Existing Jewelers",
      email: null,
      phone: "703-555-0100",
      notes: "Existing prospect"
    })
  ]);

  const result = await importProspectSpreadsheetRows(repo, {
    requestedBy: "Mitchel",
    sourceLabel: "AGS A-to-T spreadsheet",
    sourceBatch: "ags_2026_07_02",
    seedEmailEnrichment: true,
    rows: [
      {
        rowNumber: 2,
        company: "Existing Jewelers",
        phone: "703-555-0100",
        website: "https://existing.example",
        notes: "Known buyer from AGS sheet."
      },
      {
        rowNumber: 3,
        company: "New Diamond Buyer",
        phone: "703-555-0199",
        website: "https://new-buyer.example",
        notes: "Missing email; should enter queue."
      }
    ]
  });

  assert.equal(result.status, "imported");
  assert.equal(result.counts.created, 1);
  assert.equal(result.counts.updated, 1);
  assert.equal(result.counts.needsReview, 0);
  assert.equal(result.counts.rejected, 0);
  assert.equal(result.outboundSent, false);
  assert.equal(repo.candidates.length, 2);
  assert.match(repo.candidates[0]?.notes ?? "", /AGS A-to-T spreadsheet/);
  assert.match(repo.candidates[1]?.notes ?? "", /AGS A-to-T spreadsheet/);
  assert.equal(result.emailEnrichment?.insertedCount, 2);
  assert.equal(repo.emailEnrichment.length, 2);

  const mcp = prospectSpreadsheetImportToMcp(result);
  assert.equal(mcp.outbound_sent, false);
  assert.equal(mcp.email_enrichment?.inserted_count, 2);
  assert.equal(mcp.rows[0]?.status, "updated");
});

test("keeps ambiguous spreadsheet matches for review without writing a row", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "Twin Jewelers", phone: "703-555-0101", email: null }),
    prospect({ id: 2, company: "Twin Jewelers", phone: "703-555-0102", email: null })
  ]);

  const result = await importProspectSpreadsheetRows(repo, {
    sourceLabel: "AGS",
    sourceBatch: "ags_review",
    rows: [
      {
        rowNumber: 4,
        company: "Twin Jewelers",
        notes: "Ambiguous row from spreadsheet."
      }
    ]
  });

  assert.equal(result.status, "needs_review");
  assert.equal(result.counts.needsReview, 1);
  assert.equal(result.rows[0]?.status, "needs_review");
  assert.equal(repo.candidates.length, 2);
  assert.equal(repo.interactions.length, 0);
  assert.equal(result.outboundSent, false);
});
