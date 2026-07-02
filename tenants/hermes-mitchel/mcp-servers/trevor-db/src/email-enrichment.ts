import type {
  EmailEnrichmentApplyInput,
  EmailEnrichmentApplyResult,
  EmailEnrichmentClaimInput,
  EmailEnrichmentClaimResult,
  EmailEnrichmentQueueRepository,
  EmailEnrichmentSeedInput,
  EmailEnrichmentSeedResult,
  EmailEnrichmentStatus,
  EmailEnrichmentSummaryResult,
  ProspectImportBatchLookupResult
} from "./types.js";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function clean(value: string | null | undefined, max: number): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = clean(value, 320)?.toLowerCase() ?? null;
  return email && EMAIL_PATTERN.test(email) ? email : null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const candidate = clean(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isTerminal(status: EmailEnrichmentStatus): boolean {
  return status === "email_found" || status === "no_email_found" || status === "needs_review" || status === "skipped";
}

export async function seedProspectEmailEnrichmentQueue(
  repo: EmailEnrichmentQueueRepository,
  input: EmailEnrichmentSeedInput = {}
): Promise<EmailEnrichmentSeedResult> {
  return repo.seedEmailEnrichmentQueue({
    sourceBatch: clean(input.sourceBatch, 120) ?? "ags_prospect_import",
    sourceLabel: clean(input.sourceLabel, 80) ?? "AGS",
    resetClaimedOlderThanMinutes: input.resetClaimedOlderThanMinutes
  });
}

export async function claimProspectEmailEnrichmentBatch(
  repo: EmailEnrichmentQueueRepository,
  input: EmailEnrichmentClaimInput = {}
): Promise<EmailEnrichmentClaimResult> {
  return repo.claimEmailEnrichmentBatch({
    limit: normalizeLimit(input.limit),
    claimedBy: clean(input.claimedBy, 120) ?? "hermes-mitchel",
    sourceBatch: clean(input.sourceBatch, 120) ?? null,
    includeNeedsReview: input.includeNeedsReview ?? false
  });
}

export async function applyProspectEmailEnrichmentResult(
  repo: EmailEnrichmentQueueRepository,
  input: EmailEnrichmentApplyInput
): Promise<EmailEnrichmentApplyResult> {
  const status = input.status;
  const verifiedEmail = normalizeEmail(input.verifiedEmail);
  const evidenceSourceUrl = normalizeUrl(input.evidenceSourceUrl);
  const candidateWebsite = normalizeUrl(input.candidateWebsite);
  const contactPageUrl = normalizeUrl(input.contactPageUrl);
  const evidenceNote = clean(input.evidenceNote, 1200);
  const lastError = clean(input.lastError, 800);
  const confidence = input.confidence ?? (status === "email_found" ? "unknown" : null);

  const warnings: string[] = [];
  if (status === "email_found") {
    if (!verifiedEmail) warnings.push("A valid verified_email is required for email_found.");
    if (!evidenceSourceUrl) warnings.push("A public evidence_source_url is required for email_found.");
    if (confidence !== "official" && confidence !== "likely") warnings.push("email_found requires official or likely confidence.");
  }
  if (!isTerminal(status) && status !== "website_found" && status !== "error") {
    warnings.push(`Unsupported enrichment terminal status: ${status}.`);
  }
  if (warnings.length) {
    return {
      status: "rejected",
      prospectId: input.prospectId,
      queueId: null,
      prospectEmailUpdated: false,
      warnings,
      outboundSent: false
    };
  }

  return repo.applyEmailEnrichmentResult({
    prospectId: input.prospectId,
    status,
    verifiedEmail,
    confidence,
    candidateWebsite,
    contactPageUrl,
    evidenceSourceUrl,
    evidenceNote,
    lastError
  });
}

export async function getProspectEmailEnrichmentSummary(
  repo: EmailEnrichmentQueueRepository,
  sourceBatch?: string
): Promise<EmailEnrichmentSummaryResult> {
  return repo.getEmailEnrichmentSummary(clean(sourceBatch, 120));
}

export async function getLatestProspectImportBatch(
  repo: EmailEnrichmentQueueRepository
): Promise<ProspectImportBatchLookupResult> {
  return repo.getLatestEmailEnrichmentBatch();
}

export function emailEnrichmentSeedToMcp(result: EmailEnrichmentSeedResult) {
  return {
    status: result.status,
    inserted_count: result.insertedCount,
    already_queued_count: result.alreadyQueuedCount,
    synced_existing_email_count: result.syncedExistingEmailCount,
    reset_claimed_count: result.resetClaimedCount,
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function emailEnrichmentClaimToMcp(result: EmailEnrichmentClaimResult) {
  return {
    status: result.status,
    claimed_count: result.claimedCount,
    items: result.items.map((item) => ({
      queue_id: item.queueId,
      prospect_id: item.prospectId,
      display_name: item.displayName,
      company: item.company,
      phone: item.phone,
      current_email: item.currentEmail,
      notes_excerpt: item.notesExcerpt,
      candidate_website: item.candidateWebsite,
      contact_page_url: item.contactPageUrl,
      attempt_count: item.attemptCount
    })),
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function emailEnrichmentApplyToMcp(result: EmailEnrichmentApplyResult) {
  return {
    status: result.status,
    queue_id: result.queueId,
    prospect_id: result.prospectId,
    prospect_email_updated: result.prospectEmailUpdated,
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function emailEnrichmentSummaryToMcp(result: EmailEnrichmentSummaryResult) {
  return {
    status: result.status,
    source_batch: result.sourceBatch,
    total: result.total,
    counts: {
      pending: result.counts.pending,
      claimed: result.counts.claimed,
      website_found: result.counts.websiteFound,
      email_found: result.counts.emailFound,
      no_email_found: result.counts.noEmailFound,
      needs_review: result.counts.needsReview,
      error: result.counts.error,
      skipped: result.counts.skipped
    },
    remaining_count: result.remainingCount,
    completed_once_count: result.completedOnceCount,
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function emailEnrichmentLatestBatchToMcp(result: ProspectImportBatchLookupResult) {
  return {
    status: result.status,
    source_batch: result.sourceBatch,
    queued_count: result.queuedCount,
    imported: {
      created: result.imported.created,
      updated: result.imported.updated,
      needs_review: result.imported.needsReview,
      rejected: result.imported.rejected
    },
    counts: {
      pending: result.counts.pending,
      claimed: result.counts.claimed,
      website_found: result.counts.websiteFound,
      email_found: result.counts.emailFound,
      no_email_found: result.counts.noEmailFound,
      needs_review: result.counts.needsReview,
      error: result.counts.error,
      skipped: result.counts.skipped
    },
    remaining_count: result.remainingCount,
    completed_once_count: result.completedOnceCount,
    latest_queued_at: result.latestQueuedAt?.toISOString() ?? null,
    suggested_telegram_command: result.suggestedTelegramCommand,
    warnings: result.warnings,
    outbound_sent: false
  };
}
