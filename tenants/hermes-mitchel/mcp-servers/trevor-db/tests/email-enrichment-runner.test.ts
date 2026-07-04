import test from "node:test";
import assert from "node:assert/strict";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import { seedProspectEmailEnrichmentQueue } from "../src/email-enrichment.js";
import { runProspectEmailEnrichmentBatch } from "../src/email-enrichment-runner.js";
import type { TrevorCamoFoxEnrichResult } from "../src/camofox.js";

function camofoxResult(overrides: Partial<TrevorCamoFoxEnrichResult>): TrevorCamoFoxEnrichResult {
  return {
    status: "ok",
    url: "https://buyer.example",
    finalUrl: "https://buyer.example",
    title: "Buyer",
    text: null,
    links: [],
    enrichmentSource: "camofox_website_recon",
    warnings: [],
    outboundSent: false,
    ...overrides
  };
}

test("runs a conservative CamoFox batch and applies a verified official email", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });
  repo.emailEnrichment[0]!.candidateWebsite = "https://ags-one.example";

  const result = await runProspectEmailEnrichmentBatch(repo, {
    sourceBatch: "ags",
    limit: 5,
    claimedBy: "test-runner",
    enrichUrl: async (url) => camofoxResult({
      url,
      finalUrl: url,
      text: "Contact us at sales@ags-one.example for buying inquiries.",
      links: [{ text: "Contact", href: "https://ags-one.example/contact" }]
    })
  });

  assert.equal(result.claimedCount, 1);
  assert.equal(result.counts.emailFound, 1);
  assert.equal(result.counts.noEmailFound, 0);
  assert.equal(result.counts.needsReview, 0);
  assert.equal(repo.candidates[0]?.email, "sales@ags-one.example");
  assert.equal(repo.emailEnrichment[0]?.status, "email_found");
  assert.equal(repo.emailEnrichment[0]?.evidenceSourceUrl, "https://ags-one.example/contact");
  assert.equal(repo.emailEnrichment[0]?.confidence, "official");
  assert.match(repo.emailEnrichment[0]?.evidenceNote ?? "", /Search location:/);
  assert.match(repo.emailEnrichment[0]?.evidenceNote ?? "", /email located on https:\/\/ags-one\.example\/contact/);
  assert.equal(result.items[0]?.confidence, "official");
  assert.match(result.items[0]?.searchLocationNote ?? "", /email located on https:\/\/ags-one\.example\/contact/);
  assert.match(result.telegramSummary, /found 1/);
  assert.equal(result.outboundSent, false);
});

test("discovers a contact link and records no_email_found when no public email exists", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });
  repo.emailEnrichment[0]!.candidateWebsite = "https://ags-one.example";

  const visited: string[] = [];
  const result = await runProspectEmailEnrichmentBatch(repo, {
    sourceBatch: "ags",
    limit: 5,
    claimedBy: "test-runner",
    enrichUrl: async (url) => {
      visited.push(url);
      if (url.endsWith("/contact")) {
        return camofoxResult({ url, finalUrl: url, text: "Call us for diamond buying appointments." });
      }
      return camofoxResult({
        url,
        finalUrl: url,
        text: "Independent jeweler.",
        links: [{ text: "Contact", href: "https://ags-one.example/contact" }]
      });
    }
  });

  assert.deepEqual(visited, ["https://ags-one.example/", "https://ags-one.example/contact"]);
  assert.equal(result.counts.noEmailFound, 1);
  assert.equal(repo.candidates[0]?.email, null);
  assert.equal(repo.emailEnrichment[0]?.status, "no_email_found");
  assert.equal(repo.emailEnrichment[0]?.contactPageUrl, "https://ags-one.example/contact");
  assert.match(repo.emailEnrichment[0]?.evidenceNote ?? "", /Search location:/);
  assert.match(repo.emailEnrichment[0]?.evidenceNote ?? "", /inspected https:\/\/ags-one\.example\/ and https:\/\/ags-one\.example\/contact/);
});

test("marks missing website rows as needs_review without guessing", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });

  const result = await runProspectEmailEnrichmentBatch(repo, {
    sourceBatch: "ags",
    limit: 5,
    claimedBy: "test-runner",
    enrichUrl: async () => {
      throw new Error("should not inspect without a URL");
    }
  });

  assert.equal(result.counts.needsReview, 1);
  assert.equal(repo.emailEnrichment[0]?.status, "needs_review");
  assert.equal(result.items[0]?.evidenceSourceUrl, null);
});

test("marks ambiguous multiple public emails as needs_review", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS A-to-T spreadsheet import" })
  ]);
  await seedProspectEmailEnrichmentQueue(repo, { sourceBatch: "ags", sourceLabel: "AGS" });
  repo.emailEnrichment[0]!.candidateWebsite = "https://ags-one.example";

  const result = await runProspectEmailEnrichmentBatch(repo, {
    sourceBatch: "ags",
    limit: 5,
    claimedBy: "test-runner",
    enrichUrl: async (url) => camofoxResult({
      url,
      finalUrl: url,
      text: "Email buying@ags-one.example or support@ags-one.example."
    })
  });

  assert.equal(result.counts.needsReview, 1);
  assert.equal(repo.candidates[0]?.email, null);
  assert.equal(repo.emailEnrichment[0]?.status, "needs_review");
});
