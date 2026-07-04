import test from "node:test";
import assert from "node:assert/strict";
import { prospect } from "./fixtures.js";
import { FakeQueueRepository } from "./test-repo.js";
import {
  claimProspectResearchBatch,
  prospectResearchClaimToMcp,
  listProspectResearchEvidence,
  prospectResearchEvidenceListToMcp,
  prospectResearchEvidenceStoreToMcp,
  storeProspectResearchEvidence
} from "../src/prospect-research.js";

test("stores public research evidence without updating prospect email", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS" })
  ]);

  const result = await storeProspectResearchEvidence(repo, {
    prospectId: 1,
    sourceType: "contact_page",
    sourceUrl: "https://ags-one.example/contact",
    sourceTitle: "Contact AGS One",
    foundEmail: "BUYING@AGS-ONE.EXAMPLE",
    businessContextNote: "Contact page says the store buys diamonds by appointment.",
    searchLocationNote: "Email located on the public contact page.",
    evidenceNote: "Official contact page lists a public buying email.",
    confidence: "official"
  });

  assert.equal(result.status, "stored");
  assert.equal(result.prospectId, 1);
  assert.equal(result.reviewStatus, "pending_review");
  assert.equal(result.emailPromotable, true);
  assert.equal(result.outboundSent, false);
  assert.equal(repo.candidates[0]?.email, null);

  const list = await listProspectResearchEvidence(repo, { prospectId: 1 });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0]?.foundEmail, "buying@ags-one.example");

  const mcp = prospectResearchEvidenceStoreToMcp(result);
  assert.equal(mcp.outbound_sent, false);
  assert.equal(mcp.email_promotable, true);
});

test("treats RDAP WHOIS as domain verification only", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS" })
  ]);

  const result = await storeProspectResearchEvidence(repo, {
    prospectId: 1,
    sourceType: "rdap_whois",
    sourceUrl: "https://rdap.example/domain/ags-one.example",
    foundEmail: "registrar-abuse@example-registrar.test",
    businessContextNote: "RDAP confirms the domain is registered and active.",
    searchLocationNote: "RDAP domain record only.",
    evidenceNote: "Domain verification only; registrar contact is not an outreach address.",
    confidence: "possible"
  });

  assert.equal(result.status, "stored");
  assert.equal(result.emailPromotable, false);
  assert.match(result.warnings.join(" "), /domain verification only/);
  assert.equal(repo.candidates[0]?.email, null);
});

test("deduplicates repeated prospect research evidence", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS" })
  ]);

  const input = {
    prospectId: 1,
    sourceType: "chamber_directory" as const,
    sourceUrl: "https://chamber.example/members/ags-one",
    businessContextNote: "Chamber member listing identifies AGS One as a local jeweler.",
    searchLocationNote: "Chamber member profile.",
    confidence: "likely" as const
  };
  const first = await storeProspectResearchEvidence(repo, input);
  const second = await storeProspectResearchEvidence(repo, input);
  const list = await listProspectResearchEvidence(repo, { prospectId: 1 });

  assert.equal(first.status, "stored");
  assert.equal(second.status, "stored");
  assert.equal(first.evidenceId, second.evidenceId);
  assert.equal(list.items.length, 1);
});

test("lists pending review evidence with bounded MCP output", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 1, company: "AGS One", email: null, notes: "Source: AGS" }),
    prospect({ id: 2, company: "AGS Two", email: "hello@ags-two.example", notes: "Source: AGS" })
  ]);
  await storeProspectResearchEvidence(repo, {
    prospectId: 1,
    sourceType: "news_story",
    sourceUrl: "https://news.example/ags-one-expands",
    businessContextNote: "Local news says AGS One expanded its buying counter.",
    searchLocationNote: "Local news business article.",
    confidence: "possible"
  });
  await storeProspectResearchEvidence(repo, {
    prospectId: 2,
    sourceType: "official_site",
    sourceUrl: "https://ags-two.example",
    businessContextNote: "Official site lists estate jewelry buying.",
    searchLocationNote: "Official homepage.",
    confidence: "official"
  });

  const result = await listProspectResearchEvidence(repo, {
    reviewStatus: "pending_review",
    limit: 1
  });
  const mcp = prospectResearchEvidenceListToMcp(result);

  assert.equal(result.items.length, 1);
  assert.equal(mcp.items.length, 1);
  assert.equal(mcp.outbound_sent, false);
  assert.equal(mcp.items[0]?.review_status, "pending_review");
});

test("claims missing-email prospects before existing-email research candidates", async () => {
  const repo = new FakeQueueRepository([
    prospect({
      id: 1,
      company: "Has Email Jewelers",
      email: "buyer@has-email.example",
      phone: "555-0101",
      notes: "Official site: https://has-email.example"
    }),
    prospect({
      id: 2,
      company: "Missing Email With Site",
      email: null,
      phone: "555-0102",
      notes: "Website: https://missing-with-site.example/contact"
    }),
    prospect({
      id: 3,
      company: "Missing Email No Site",
      email: null,
      phone: null,
      notes: "Imported from AGS list."
    }),
    prospect({
      id: 4,
      company: "Missing Email With Phone",
      email: null,
      phone: "555-0104",
      notes: "Imported from AGS list."
    })
  ]);

  const result = await claimProspectResearchBatch(repo, { limit: 4 });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.items.map((item) => item.prospectId), [2, 4, 3, 1]);
  assert.equal(result.items[0]?.missingEmail, true);
  assert.equal(result.items[0]?.hasPublicClue, true);
  assert.match(result.items[0]?.researchReason ?? "", /missing email/i);
  assert.equal(result.outboundSent, false);
});

test("claim prospect research batch is bounded and maps to snake_case MCP output", async () => {
  const repo = new FakeQueueRepository([
    prospect({ id: 10, company: "Missing One", email: null, phone: "555-0110" }),
    prospect({ id: 11, company: "Missing Two", email: null, phone: null }),
    prospect({ id: 12, company: "Existing Email", email: "buyer@example.test", phone: "555-0112" })
  ]);

  const result = await claimProspectResearchBatch(repo, { limit: 2 });
  const mcp = prospectResearchClaimToMcp(result);

  assert.equal(result.items.length, 2);
  assert.deepEqual(mcp.items.map((item) => item.prospect_id), [10, 11]);
  assert.equal(mcp.items[0]?.missing_email, true);
  assert.equal(mcp.items[0]?.has_public_clue, true);
  assert.equal(mcp.outbound_sent, false);
});
