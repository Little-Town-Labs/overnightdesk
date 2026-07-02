import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { importProspectSpreadsheetFile } from "../src/spreadsheet-file-import.js";

test("imports a CSV file and seeds enrichment only for imported prospects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trevor-csv-import-"));
  const filePath = join(dir, "ags.csv");
  await writeFile(filePath, [
    "Company,Phone,Website,Notes",
    "New Diamond Buyer,703-555-0199,https://new-buyer.example,Missing email",
    "Existing Jewelers,703-555-0100,https://existing.example,Known buyer"
  ].join("\n"));

  const repo = new FakeQueueRepository([
    prospect({
      id: 1,
      company: "Existing Jewelers",
      email: null,
      phone: "703-555-0100",
      notes: "Existing prospect"
    }),
    prospect({
      id: 2,
      company: "Older AGS Similar",
      email: null,
      phone: "703-555-0111",
      notes: "Source: AGS A-to-T spreadsheet import"
    })
  ]);

  const result = await importProspectSpreadsheetFile(repo, {
    filePath,
    requestedBy: "Mitchel",
    sourceLabel: "AGS A-to-T spreadsheet",
    sourceBatch: "ags_2026_07_02",
    seedEmailEnrichment: true,
    createCallTasks: false
  });

  assert.equal(result.status, "imported");
  assert.equal(result.file.originalFilename, "ags.csv");
  assert.equal(result.parse.totalDataRows, 2);
  assert.equal(result.import.counts.created, 1);
  assert.equal(result.import.counts.updated, 1);
  assert.equal(result.import.emailEnrichment?.insertedCount, 2);
  assert.deepEqual(
    repo.emailEnrichment.map((item) => item.prospectId).sort((a, b) => a - b),
    [1, 3]
  );
});

test("rejects unsupported spreadsheet file types before import", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trevor-xlsx-import-"));
  const filePath = join(dir, "ags.xlsx");
  await writeFile(filePath, "not parsed in first slice");

  const repo = new FakeQueueRepository([]);
  const result = await importProspectSpreadsheetFile(repo, {
    filePath,
    sourceLabel: "AGS A-to-T spreadsheet",
    seedEmailEnrichment: true
  });

  assert.equal(result.status, "rejected");
  assert.match(result.warnings.join("\n"), /Only CSV files are supported/);
  assert.equal(repo.candidates.length, 0);
  assert.equal(repo.emailEnrichment.length, 0);
});
