import test from "node:test";
import assert from "node:assert/strict";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import {
  applyProspectEmailEnrichmentResult,
  claimProspectEmailEnrichmentBatch,
  emailEnrichmentApplyToMcp,
  emailEnrichmentLatestBatchToMcp,
  getLatestProspectImportBatch,
  getProspectEmailEnrichmentSummary,
  seedProspectEmailEnrichmentQueue
} from "../src/email-enrichment.js";

test("seeds one queue row per AGS prospect without duplicating existing rows", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" }),
    prospect({ id: 2, company: "AGS Two", email: "buyer@example.test", notes: "Source: AGS A-to-T spreadsheet import" }),
    prospect({ id: 3, company: "Other", email: null, notes: "Manual lead" })
  ]);

  const first = await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });
  const second = await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });

  assert.equal(first.insertedCount, 2);
  assert.equal(second.insertedCount, 0);
  assert.equal(second.alreadyQueuedCount, 2);

  const summary = await getProspectEmailEnrichmentSummary(repo, "ags");
  assert.equal(summary.total, 2);
  assert.equal(summary.counts.pending, 1);
  assert.equal(summary.counts.emailFound, 1);
});

test("claims bounded pending work and skips prospects that already have email", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" }),
    prospect({ id: 2, company: "AGS Two", email: null, notes: "Source: AGS A-to-T spreadsheet import" }),
    prospect({ id: 3, company: "AGS Three", email: "buyer@example.test", notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });

  const claimed = await claimProspectEmailEnrichmentBatch(repo, {
    sourceBatch: "ags",
    limit: 1,
    claimedBy: "test-worker"
  });

  assert.equal(claimed.claimedCount, 1);
  assert.equal(claimed.items[0]?.prospectId, 1);
  assert.equal(repo.emailEnrichment.find((item) => item.prospectId === 1)?.status, "claimed");
  assert.equal(repo.emailEnrichment.find((item) => item.prospectId === 3)?.status, "email_found");
});

test("rejects email_found without a valid email and evidence source", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });

  const result = await applyProspectEmailEnrichmentResult(repo, {
    prospectId: 1,
    status: "email_found",
    verifiedEmail: "not-an-email",
    evidenceSourceUrl: "",
    confidence: "possible"
  });

  assert.equal(result.status, "rejected");
  assert.equal(repo.candidates[0]?.email, null);
  assert.equal(result.prospectEmailUpdated, false);
  assert.match(result.warnings.join(" "), /valid verified_email/);
});

test("applies a verified email once and reports idempotent reapply without duplicate prospect writes", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });
  await claimProspectEmailEnrichmentBatch(repo, { sourceBatch: "ags", limit: 1, claimedBy: "test-worker" });

  const first = await applyProspectEmailEnrichmentResult(repo, {
    prospectId: 1,
    status: "email_found",
    verifiedEmail: "BUYER@EXAMPLE.TEST",
    evidenceSourceUrl: "https://ags-one.example/contact",
    candidateWebsite: "https://ags-one.example",
    confidence: "official",
    evidenceNote: "Public contact page lists this email."
  });
  const second = await applyProspectEmailEnrichmentResult(repo, {
    prospectId: 1,
    status: "email_found",
    verifiedEmail: "buyer@example.test",
    evidenceSourceUrl: "https://ags-one.example/contact",
    confidence: "official",
    evidenceNote: "Public contact page lists this email."
  });

  assert.equal(first.status, "applied");
  assert.equal(first.prospectEmailUpdated, true);
  assert.equal(second.status, "applied");
  assert.equal(second.prospectEmailUpdated, false);
  assert.equal(repo.candidates[0]?.email, "buyer@example.test");
  assert.equal((repo.candidates[0]?.notes ?? "").match(/Email enrichment/g)?.length, 1);

  const mcp = emailEnrichmentApplyToMcp(first);
  assert.equal(mcp.outbound_sent, false);
  assert.equal(mcp.prospect_email_updated, true);
});

test("records no-email result as completed once without writing prospect email", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });

  const result = await applyProspectEmailEnrichmentResult(repo, {
    prospectId: 1,
    status: "no_email_found",
    evidenceSourceUrl: "https://ags-one.example/contact",
    confidence: "unknown",
    evidenceNote: "Website and contact page did not list a public email."
  });

  assert.equal(result.status, "applied");
  assert.equal(result.prospectEmailUpdated, false);
  assert.equal(repo.candidates[0]?.email, null);

  const summary = await getProspectEmailEnrichmentSummary(repo, "ags");
  assert.equal(summary.remainingCount, 0);
  assert.equal(summary.completedOnceCount, 1);
});

test("counts website_found as worked once for first-pass completion", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });

  await applyProspectEmailEnrichmentResult(repo, {
    prospectId: 1,
    status: "website_found",
    candidateWebsite: "https://ags-one.example",
    evidenceSourceUrl: "https://ags-one.example",
    confidence: "unknown",
    evidenceNote: "Official website identified; public email still needs stronger evidence before writing."
  });

  const summary = await getProspectEmailEnrichmentSummary(repo, "ags");
  assert.equal(summary.counts.websiteFound, 1);
  assert.equal(summary.remainingCount, 0);
  assert.equal(summary.completedOnceCount, 1);
});

test("returns the latest source batch from the enrichment queue with progress counts", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "Old One", email: null, notes: "Source: Old AGS import" }),
    prospect({ id: 2, company: "Latest One", email: null, notes: "Source: Latest AGS import" }),
    prospect({ id: 3, company: "Latest Two", email: "buyer@example.test", notes: "Source: Latest AGS import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags_2026_07_01", sourceLabel: "Old AGS" });
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags_2026_07_02", sourceLabel: "Latest AGS" });

  const result = await getLatestProspectImportBatch(repo);

  assert.equal(result.status, "found");
  assert.equal(result.sourceBatch, "ags_2026_07_02");
  assert.equal(result.queuedCount, 2);
  assert.equal(result.counts.pending, 1);
  assert.equal(result.counts.emailFound, 1);
  assert.equal(result.remainingCount, 1);
  assert.equal(result.suggestedTelegramCommand, "continue enrichment batch ags_2026_07_02, 10 rows");
  assert.match(result.warnings.join(" "), /Import created\/updated row counts are not yet tracked/);

  const mcp = emailEnrichmentLatestBatchToMcp(result);
  assert.equal(mcp.source_batch, "ags_2026_07_02");
  assert.equal(mcp.queued_count, 2);
  assert.equal(mcp.suggested_telegram_command, "continue enrichment batch ags_2026_07_02, 10 rows");
  assert.equal(mcp.outbound_sent, false);
});
