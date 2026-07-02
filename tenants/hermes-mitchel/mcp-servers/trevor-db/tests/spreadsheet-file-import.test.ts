import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { importProspectSpreadsheetFile } from "../src/spreadsheet-file-import.js";

const XLSX_FIXTURE_BASE64 = "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";

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

test("imports an XLSX file and seeds enrichment only for imported prospects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trevor-xlsx-import-"));
  const filePath = join(dir, "ags.xlsx");
  await writeFile(filePath, Buffer.from(XLSX_FIXTURE_BASE64, "base64"));

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
    sourceBatch: "ags_2026_07_02_xlsx",
    seedEmailEnrichment: true,
    createCallTasks: false
  });

  assert.equal(result.status, "imported");
  assert.equal(result.file.originalFilename, "ags.xlsx");
  assert.equal(result.parse.totalDataRows, 2);
  assert.equal(result.import.counts.created, 1);
  assert.equal(result.import.counts.updated, 1);
  assert.deepEqual(
    repo.emailEnrichment.map((item) => item.prospectId).sort((a, b) => a - b),
    [1, 3]
  );
});

test("rejects legacy XLS files before import", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trevor-xls-import-"));
  const filePath = join(dir, "ags.xls");
  await writeFile(filePath, "legacy binary excel not parsed");

  const repo = new FakeQueueRepository([]);
  const result = await importProspectSpreadsheetFile(repo, {
    filePath,
    sourceLabel: "AGS A-to-T spreadsheet",
    seedEmailEnrichment: true
  });

  assert.equal(result.status, "rejected");
  assert.match(result.warnings.join("\n"), /Only CSV and XLSX files are supported/);
  assert.equal(repo.candidates.length, 0);
  assert.equal(repo.emailEnrichment.length, 0);
});
