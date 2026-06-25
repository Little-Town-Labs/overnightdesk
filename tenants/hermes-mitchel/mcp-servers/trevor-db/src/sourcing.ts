import { noteSummary } from "./safety.js";
import type {
  PromoteProspectCandidateInput,
  PromoteProspectCandidateResult,
  ProspectCandidateDedupeStatus,
  ProspectCandidateReviewStatus,
  ProspectSourceCandidateInput,
  ProspectSourceCandidateRecord,
  QueueRepository,
  ReviewProspectCandidatesInput,
  ReviewProspectCandidatesResult,
  StageProspectCandidateWrite,
  StageProspectCandidatesInput,
  StageProspectCandidatesResult
} from "./types.js";

const MAX_STAGE_CANDIDATES = 50;
const DEFAULT_REVIEW_LIMIT = 15;
const MAX_REVIEW_LIMIT = 50;
const CHAIN_PATTERNS = [
  "kay jewelers",
  "kay outlet",
  "jared",
  "jared vault",
  "helzberg diamonds",
  "reeds jewelers",
  "blue nile",
  "zales",
  "diamonds direct",
  "shane co",
  "tiffany",
  "cartier"
];

function clean(value: string | null | undefined, max = 500): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return redactSecrets(trimmed).slice(0, max);
}

function normalizeBusinessName(candidate: ProspectSourceCandidateInput): string {
  return clean(candidate.businessName, 200) ?? "Unnamed business";
}

function canonical(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isChainStore(candidate: ProspectSourceCandidateInput): boolean {
  const haystack = canonical(`${candidate.businessName} ${candidate.company ?? ""}`);
  return CHAIN_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function scoreCandidate(candidate: ProspectSourceCandidateInput, chain: boolean): number {
  if (chain) return 0;
  let score = 35;
  if ((candidate.rating ?? 0) >= 4.5) score += 20;
  if ((candidate.reviewCount ?? 0) >= 50) score += 20;
  if (clean(candidate.phone, 80)) score += 15;
  if (clean(candidate.website, 500)) score += 10;
  return Math.min(100, score);
}

function contactReady(candidate: ProspectSourceCandidateInput): boolean {
  return Boolean(clean(candidate.phone, 80) || clean(candidate.email, 200) || clean(candidate.website, 500));
}

function redactSecrets(value: string): string {
  return value
    .replace(/app-[A-Za-z0-9]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._:-]{8,}/gi, "Bearer [redacted]")
    .replace(/(CAMOFOX_API_KEY|BROWSERACT_API_KEY|AGILED_API_KEY|TREVOR_DB_URL)\s*=\s*\S+/gi, "$1=[redacted]")
    .replace(/[A-Fa-f0-9]{32,}/g, "[redacted]");
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_REVIEW_LIMIT)) return DEFAULT_REVIEW_LIMIT;
  return Math.max(1, Math.min(MAX_REVIEW_LIMIT, Math.trunc(limit ?? DEFAULT_REVIEW_LIMIT)));
}

function displayName(candidate: ProspectSourceCandidateRecord): string {
  return candidate.company ?? candidate.businessName;
}

async function duplicateReason(repo: QueueRepository, candidate: ProspectSourceCandidateInput): Promise<string | null> {
  const query = clean(candidate.company, 200) ?? clean(candidate.businessName, 200);
  if (!query) return null;
  const matches = await repo.searchProspects(query, 5);
  const normalizedBusiness = canonical(candidate.company ?? candidate.businessName);
  const normalizedPhone = canonical(candidate.phone ?? null);
  const match = matches.find((prospect) => {
    const prospectName = canonical(prospect.company ?? prospect.name);
    const prospectPhone = canonical(prospect.phone);
    return (
      (normalizedBusiness && prospectName && (prospectName === normalizedBusiness || prospectName.includes(normalizedBusiness) || normalizedBusiness.includes(prospectName))) ||
      (normalizedPhone && prospectPhone && normalizedPhone === prospectPhone)
    );
  });
  return match ? `Matches existing Trevor prospect ${match.id}.` : null;
}

async function toStageWrite(
  repo: QueueRepository,
  input: StageProspectCandidatesInput,
  candidate: ProspectSourceCandidateInput
): Promise<StageProspectCandidateWrite> {
  const chain = isChainStore(candidate);
  const duplicate = chain ? "Known chain store is not a target buyer." : await duplicateReason(repo, candidate);
  const qualityScore = scoreCandidate(candidate, chain);
  let reviewStatus: ProspectCandidateReviewStatus = "recommended";
  let dedupeStatus: ProspectCandidateDedupeStatus = "unique";
  if (chain) {
    reviewStatus = "rejected";
    dedupeStatus = "duplicate";
  } else if (duplicate) {
    reviewStatus = "duplicate";
    dedupeStatus = "duplicate";
  } else if (!contactReady(candidate) || qualityScore < 65) {
    reviewStatus = "needs_review";
    dedupeStatus = "possible_duplicate";
  }

  return {
    businessName: normalizeBusinessName(candidate),
    company: clean(candidate.company, 200) ?? normalizeBusinessName(candidate),
    area: clean(input.area, 120) ?? "Unknown area",
    phone: clean(candidate.phone, 80),
    email: clean(candidate.email, 200),
    website: clean(candidate.website, 500),
    sourceUrl: clean(candidate.sourceUrl, 500),
    enrichmentUrl: clean(candidate.enrichmentUrl, 500),
    rating: candidate.rating ?? null,
    reviewCount: candidate.reviewCount ?? null,
    buyerType: "retail_jeweler",
    leadSource: input.source,
    enrichmentSource: input.enrichmentSource ?? null,
    qualityScore,
    reviewStatus,
    dedupeStatus,
    dedupeReason: duplicate,
    reviewNotes: noteSummary(clean(candidate.notes, 1000))
  };
}

export async function stageProspectCandidates(
  repo: QueueRepository,
  input: StageProspectCandidatesInput
): Promise<StageProspectCandidatesResult> {
  const warnings: string[] = [];
  const area = clean(input.area, 120);
  if (!area) {
    return {
      status: "rejected",
      sourcingRunId: null,
      stagedCount: 0,
      candidates: [],
      warnings: ["area is required."],
      outboundSent: false
    };
  }
  const rawCandidates = input.candidates.slice(0, MAX_STAGE_CANDIDATES);
  if (input.candidates.length > MAX_STAGE_CANDIDATES) {
    warnings.push(`Candidate list truncated to ${MAX_STAGE_CANDIDATES}.`);
  }
  const candidates = [];
  for (const candidate of rawCandidates) {
    candidates.push(await toStageWrite(repo, { ...input, area }, candidate));
  }
  const staged = await repo.stageProspectCandidates({
    source: input.source,
    enrichmentSource: input.enrichmentSource ?? null,
    area,
    keyword: clean(input.keyword, 160),
    requestedBy: clean(input.requestedBy, 120),
    warnings,
    candidates
  });
  return {
    status: "staged",
    sourcingRunId: staged.run.id,
    stagedCount: staged.candidates.length,
    candidates: staged.candidates,
    warnings,
    outboundSent: false
  };
}

export async function reviewProspectCandidates(
  repo: QueueRepository,
  input: ReviewProspectCandidatesInput = {}
): Promise<ReviewProspectCandidatesResult> {
  return repo.reviewProspectCandidates({
    ...input,
    limit: normalizeLimit(input.limit)
  });
}

export async function promoteProspectCandidate(
  repo: QueueRepository,
  input: PromoteProspectCandidateInput
): Promise<PromoteProspectCandidateResult> {
  const approvedBy = clean(input.approvedBy, 120);
  if (!approvedBy) {
    return {
      status: "needs_review",
      candidateId: input.candidateId,
      prospectId: null,
      callTaskId: null,
      warnings: ["approved_by is required before promotion."],
      outboundSent: false
    };
  }
  const candidate = await repo.findProspectSourceCandidateById(input.candidateId);
  if (!candidate) {
    return {
      status: "not_found",
      candidateId: input.candidateId,
      prospectId: null,
      callTaskId: null,
      warnings: ["candidate not found."],
      outboundSent: false
    };
  }
  if (candidate.reviewStatus === "duplicate" || candidate.dedupeStatus === "duplicate") {
    return {
      status: "duplicate",
      candidateId: input.candidateId,
      prospectId: null,
      callTaskId: null,
      warnings: [candidate.dedupeReason ?? "candidate is duplicate."],
      outboundSent: false
    };
  }
  if (candidate.reviewStatus === "rejected") {
    return {
      status: "rejected",
      candidateId: input.candidateId,
      prospectId: null,
      callTaskId: null,
      warnings: [candidate.dedupeReason ?? "candidate is rejected."],
      outboundSent: false
    };
  }
  return repo.promoteProspectCandidate({
    candidateId: input.candidateId,
    approvedBy,
    createCallTask: input.createCallTask !== false,
    approvalNote: clean(input.approvalNote, 500)
  });
}

export function stageProspectCandidatesToMcp(result: StageProspectCandidatesResult) {
  return {
    status: result.status,
    sourcing_run_id: result.sourcingRunId,
    staged_count: result.stagedCount,
    candidates: result.candidates.map(candidateToMcp),
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function reviewProspectCandidatesToMcp(result: ReviewProspectCandidatesResult) {
  return {
    status: result.status,
    items: result.items.map(candidateToMcp),
    counts: {
      recommended: result.counts.recommended,
      needs_review: result.counts.needsReview,
      duplicate: result.counts.duplicate,
      rejected: result.counts.rejected,
      approved: result.counts.approved
    },
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function promoteProspectCandidateToMcp(result: PromoteProspectCandidateResult) {
  return {
    status: result.status,
    candidate_id: result.candidateId,
    prospect_id: result.prospectId,
    call_task_id: result.callTaskId,
    warnings: result.warnings,
    outbound_sent: false
  };
}

function candidateToMcp(candidate: ProspectSourceCandidateRecord) {
  return {
    candidate_id: candidate.id,
    sourcing_run_id: candidate.sourcingRunId,
    business_name: candidate.businessName,
    display_name: displayName(candidate),
    area: candidate.area,
    phone: candidate.phone,
    website: candidate.website,
    review_status: candidate.reviewStatus,
    dedupe_status: candidate.dedupeStatus,
    dedupe_reason: candidate.dedupeReason,
    lead_source: candidate.leadSource,
    enrichment_source: candidate.enrichmentSource,
    quality_score: candidate.qualityScore,
    promoted_prospect_id: candidate.promotedProspectId
  };
}
