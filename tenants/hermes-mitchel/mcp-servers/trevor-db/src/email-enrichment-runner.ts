import { enrichProspectUrlWithCamoFox, type TrevorCamoFoxEnrichResult } from "./camofox.js";
import {
  applyProspectEmailEnrichmentResult,
  claimProspectEmailEnrichmentBatch,
  getProspectEmailEnrichmentSummary
} from "./email-enrichment.js";
import type {
  EmailEnrichmentApplyInput,
  EmailEnrichmentConfidence,
  EmailEnrichmentQueueRepository,
  EmailEnrichmentRecord
} from "./types.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CONTACT_HINT_RE = /contact|about|team|staff|leadership|locations?/i;
const LOW_VALUE_EMAIL_RE = /^(privacy|legal|abuse|admin|webmaster|noreply|no-reply)@/i;

export interface EmailEnrichmentRunnerInput {
  sourceBatch?: string;
  limit?: number;
  claimedBy?: string;
  enrichUrl?: (url: string, item: EmailEnrichmentRecord) => Promise<TrevorCamoFoxEnrichResult>;
}

export interface EmailEnrichmentRunnerItem {
  prospectId: number;
  displayName: string;
  status: EmailEnrichmentApplyInput["status"];
  evidenceSourceUrl: string | null;
  verifiedEmail: string | null;
  confidence: EmailEnrichmentConfidence | null;
  searchLocationNote: string | null;
  warnings: string[];
}

export interface EmailEnrichmentRunnerResult {
  status: "ok";
  sourceBatch: string | null;
  claimedCount: number;
  processedCount: number;
  counts: {
    emailFound: number;
    noEmailFound: number;
    needsReview: number;
    errors: number;
  };
  remainingCount: number;
  items: EmailEnrichmentRunnerItem[];
  telegramSummary: string;
  warnings: string[];
  outboundSent: false;
}

function normalizeLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function clean(value: string | null | undefined, max: number): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function normalizePublicUrl(value: string | null | undefined, base?: string | null): string | null {
  const candidate = clean(value, 500);
  if (!candidate) return null;
  try {
    const url = base ? new URL(candidate, base) : new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function hostname(value: string | null | undefined): string | null {
  try {
    const host = value ? new URL(value).hostname.toLowerCase() : "";
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase().replace(/^www\./, "") ?? "";
}

function uniqueEmails(text: string | null | undefined): string[] {
  const values = new Set<string>();
  for (const match of text?.matchAll(EMAIL_RE) ?? []) {
    const email = match[0]?.toLowerCase();
    if (!email || LOW_VALUE_EMAIL_RE.test(email)) continue;
    values.add(email);
  }
  return [...values].slice(0, 5);
}

function findContactUrl(result: TrevorCamoFoxEnrichResult, fallbackBase: string): string | null {
  for (const link of result.links) {
    const label = [link.text, link.href].filter(Boolean).join(" ");
    if (!CONTACT_HINT_RE.test(label)) continue;
    const normalized = normalizePublicUrl(link.href, result.finalUrl ?? fallbackBase);
    if (normalized) return normalized;
  }
  return null;
}

function confidenceForEmail(email: string, evidenceUrl: string | null): EmailEnrichmentConfidence {
  const sourceHost = hostname(evidenceUrl);
  const domain = emailDomain(email);
  if (sourceHost && (sourceHost === domain || sourceHost.endsWith(`.${domain}`) || domain.endsWith(`.${sourceHost}`))) {
    return "official";
  }
  return "likely";
}

function inspectedUrls(pages: TrevorCamoFoxEnrichResult[]): string[] {
  const urls = new Set<string>();
  for (const page of pages) {
    const url = normalizePublicUrl(page.finalUrl) ?? normalizePublicUrl(page.url);
    if (url) urls.add(url);
  }
  return [...urls];
}

function searchLocationNote(parts: {
  inspected: string[];
  discoveredContactUrl?: string | null;
  emailEvidenceUrl?: string | null;
  outcome: "email_found" | "multiple_emails" | "no_email_found" | "needs_review" | "error";
}): string {
  const inspected = parts.inspected.length ? parts.inspected.join(" and ") : "no public page";
  const details = [`inspected ${inspected}`];
  if (parts.discoveredContactUrl) details.push(`contact page located at ${parts.discoveredContactUrl}`);
  if (parts.emailEvidenceUrl) details.push(`email located on ${parts.emailEvidenceUrl}`);
  if (parts.outcome === "multiple_emails") details.push("multiple emails were located across inspected text");
  if (parts.outcome === "no_email_found") details.push("no public email was located in inspected text");
  if (parts.outcome === "needs_review") details.push("no website/contact URL was available for inspection");
  if (parts.outcome === "error") details.push("inspection failed before a reliable result was located");
  return details.join("; ");
}

async function inspectUrl(
  enrichUrl: (url: string, item: EmailEnrichmentRecord) => Promise<TrevorCamoFoxEnrichResult>,
  url: string,
  item: EmailEnrichmentRecord
): Promise<TrevorCamoFoxEnrichResult> {
  return enrichUrl(url, item);
}

async function buildApplyInput(
  item: EmailEnrichmentRecord,
  enrichUrl: (url: string, item: EmailEnrichmentRecord) => Promise<TrevorCamoFoxEnrichResult>
): Promise<EmailEnrichmentApplyInput> {
  const startUrl = normalizePublicUrl(item.contactPageUrl) ?? normalizePublicUrl(item.candidateWebsite);
  if (!startUrl) {
    return {
      prospectId: item.prospectId,
      status: "needs_review",
      lastError: "No website or contact page is available for automated CamoFox research.",
      evidenceNote: "Runner did not guess a website or email.",
      searchLocationNote: searchLocationNote({ inspected: [], outcome: "needs_review" })
    };
  }

  const first = await inspectUrl(enrichUrl, startUrl, item);
  if (first.status !== "ok") {
    return {
      prospectId: item.prospectId,
      status: "error",
      candidateWebsite: normalizePublicUrl(item.candidateWebsite) ?? startUrl,
      contactPageUrl: normalizePublicUrl(item.contactPageUrl),
      evidenceSourceUrl: startUrl,
      lastError: first.warnings.join(" ") || `CamoFox returned ${first.status}.`,
      searchLocationNote: searchLocationNote({ inspected: [startUrl], outcome: "error" })
    };
  }

  const inspected = [first];
  const discoveredContactUrl = item.contactPageUrl ? normalizePublicUrl(item.contactPageUrl) : findContactUrl(first, startUrl);
  const shouldInspectContact = discoveredContactUrl && discoveredContactUrl !== (first.finalUrl ?? first.url);
  if (shouldInspectContact) {
    const contact = await inspectUrl(enrichUrl, discoveredContactUrl, item);
    inspected.push(contact);
  }

  const okPages = inspected.filter((page) => page.status === "ok");
  const emailSources = okPages.flatMap((page) =>
    uniqueEmails(page.text).map((email) => ({
      email,
      url: normalizePublicUrl(page.finalUrl) ?? normalizePublicUrl(page.url) ?? startUrl
    }))
  );
  const unique = new Map<string, string>();
  for (const source of emailSources) unique.set(source.email, source.url);

  const candidateWebsite = normalizePublicUrl(item.candidateWebsite) ?? normalizePublicUrl(first.finalUrl) ?? startUrl;
  const contactPageUrl = discoveredContactUrl ?? null;
  const inspectedPageUrls = inspectedUrls(okPages);
  if (unique.size === 1) {
    const [[email, evidenceSourceUrl]] = [...unique.entries()];
    return {
      prospectId: item.prospectId,
      status: "email_found",
      verifiedEmail: email,
      confidence: confidenceForEmail(email, evidenceSourceUrl),
      candidateWebsite,
      contactPageUrl,
      evidenceSourceUrl,
      evidenceNote: "CamoFox found one public email on an inspected website/contact page.",
      searchLocationNote: searchLocationNote({
        inspected: inspectedPageUrls,
        discoveredContactUrl: contactPageUrl,
        emailEvidenceUrl: evidenceSourceUrl,
        outcome: "email_found"
      })
    };
  }

  if (unique.size > 1) {
    return {
      prospectId: item.prospectId,
      status: "needs_review",
      candidateWebsite,
      contactPageUrl,
      evidenceSourceUrl: normalizePublicUrl(first.finalUrl) ?? startUrl,
      evidenceNote: `CamoFox found multiple public emails: ${[...unique.keys()].join(", ")}.`,
      searchLocationNote: searchLocationNote({
        inspected: inspectedPageUrls,
        discoveredContactUrl: contactPageUrl,
        emailEvidenceUrl: normalizePublicUrl(first.finalUrl) ?? startUrl,
        outcome: "multiple_emails"
      }),
      lastError: "Multiple public emails require review before writing prospect.email."
    };
  }

  return {
    prospectId: item.prospectId,
    status: "no_email_found",
    candidateWebsite,
    contactPageUrl,
    evidenceSourceUrl: contactPageUrl ?? normalizePublicUrl(first.finalUrl) ?? startUrl,
    confidence: "unknown",
    evidenceNote: "CamoFox inspected the available website/contact page and found no public email.",
    searchLocationNote: searchLocationNote({
      inspected: inspectedPageUrls,
      discoveredContactUrl: contactPageUrl,
      outcome: "no_email_found"
    })
  };
}

function summarize(result: Omit<EmailEnrichmentRunnerResult, "telegramSummary">): string {
  return [
    `Processed ${result.processedCount}/${result.claimedCount} claimed enrichment rows.`,
    `found ${result.counts.emailFound}`,
    `no email found ${result.counts.noEmailFound}`,
    `needs review ${result.counts.needsReview}`,
    `errors ${result.counts.errors}`,
    `remaining ${result.remainingCount}`
  ].join("; ");
}

export async function runProspectEmailEnrichmentBatch(
  repo: EmailEnrichmentQueueRepository,
  input: EmailEnrichmentRunnerInput = {}
): Promise<EmailEnrichmentRunnerResult> {
  const sourceBatch = clean(input.sourceBatch, 120);
  const claimed = await claimProspectEmailEnrichmentBatch(repo, {
    sourceBatch: sourceBatch ?? undefined,
    limit: normalizeLimit(input.limit),
    claimedBy: clean(input.claimedBy, 120) ?? "hermes-mitchel-enrichment-runner"
  });
  const enrichUrl = input.enrichUrl ?? ((url: string) => enrichProspectUrlWithCamoFox({ url, includeLinks: true }));
  const items: EmailEnrichmentRunnerItem[] = [];
  const warnings = [...claimed.warnings];
  const counts = {
    emailFound: 0,
    noEmailFound: 0,
    needsReview: 0,
    errors: 0
  };

  for (const item of claimed.items) {
    try {
      const applyInput = await buildApplyInput(item, enrichUrl);
      const applied = await applyProspectEmailEnrichmentResult(repo, applyInput);
      warnings.push(...applied.warnings);
      if (applyInput.status === "email_found" && applied.status === "applied") counts.emailFound += 1;
      if (applyInput.status === "no_email_found" && applied.status === "applied") counts.noEmailFound += 1;
      if (applyInput.status === "needs_review" && applied.status === "applied") counts.needsReview += 1;
      if (applyInput.status === "error" || applied.status !== "applied") counts.errors += 1;
      items.push({
        prospectId: item.prospectId,
        displayName: item.displayName,
        status: applyInput.status,
        evidenceSourceUrl: applyInput.evidenceSourceUrl ?? null,
        verifiedEmail: applyInput.verifiedEmail ?? null,
        confidence: applyInput.confidence ?? null,
        searchLocationNote: applyInput.searchLocationNote ?? null,
        warnings: applied.warnings
      });
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      const applied = await applyProspectEmailEnrichmentResult(repo, {
        prospectId: item.prospectId,
        status: "error",
        lastError
      });
      counts.errors += 1;
      warnings.push(...applied.warnings);
      items.push({
        prospectId: item.prospectId,
        displayName: item.displayName,
        status: "error",
        evidenceSourceUrl: null,
        verifiedEmail: null,
        confidence: null,
        searchLocationNote: null,
        warnings: applied.warnings
      });
    }
  }

  const summary = await getProspectEmailEnrichmentSummary(repo, sourceBatch ?? undefined);
  const result = {
    status: "ok" as const,
    sourceBatch,
    claimedCount: claimed.claimedCount,
    processedCount: items.length,
    counts,
    remainingCount: summary.remainingCount,
    items,
    warnings,
    outboundSent: false as const
  };
  return {
    ...result,
    telegramSummary: summarize(result)
  };
}

export function emailEnrichmentRunnerToMcp(result: EmailEnrichmentRunnerResult) {
  return {
    status: result.status,
    source_batch: result.sourceBatch,
    claimed_count: result.claimedCount,
    processed_count: result.processedCount,
    counts: {
      email_found: result.counts.emailFound,
      no_email_found: result.counts.noEmailFound,
      needs_review: result.counts.needsReview,
      errors: result.counts.errors
    },
    remaining_count: result.remainingCount,
    telegram_summary: result.telegramSummary,
    items: result.items.map((item) => ({
      prospect_id: item.prospectId,
      display_name: item.displayName,
      status: item.status,
      evidence_source_url: item.evidenceSourceUrl,
      verified_email: item.verifiedEmail,
      confidence: item.confidence,
      search_location_note: item.searchLocationNote,
      warnings: item.warnings
    })),
    warnings: result.warnings,
    outbound_sent: false
  };
}
