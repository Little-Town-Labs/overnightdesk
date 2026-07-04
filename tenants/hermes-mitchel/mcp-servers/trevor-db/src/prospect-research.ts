import type {
  EmailEnrichmentConfidence,
  ProspectResearchEvidenceInput,
  ProspectResearchEvidenceListInput,
  ProspectResearchEvidenceListResult,
  ProspectResearchEvidenceStoreResult,
  ProspectResearchEvidenceWrite,
  ProspectResearchRepository,
  ProspectResearchSourceType
} from "./types.js";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_PROMOTABLE_SOURCES: ProspectResearchSourceType[] = [
  "official_site",
  "contact_page",
  "city_directory",
  "chamber_directory",
  "business_listing"
];

function clean(value: string | null | undefined, max: number): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function normalizeLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
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
    url.hash = "";
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isEmailPromotable(sourceType: ProspectResearchSourceType, foundEmail: string | null, confidence: EmailEnrichmentConfidence): boolean {
  return Boolean(
    foundEmail &&
    EMAIL_PROMOTABLE_SOURCES.includes(sourceType) &&
    (confidence === "official" || confidence === "likely")
  );
}

function normalizeInput(input: ProspectResearchEvidenceInput): { write: ProspectResearchEvidenceWrite | null; warnings: string[] } {
  const warnings: string[] = [];
  const sourceUrl = normalizeUrl(input.sourceUrl);
  const foundEmail = normalizeEmail(input.foundEmail);
  const sourceTitle = clean(input.sourceTitle, 300);
  const foundPhone = clean(input.foundPhone, 80);
  const businessContextNote = clean(input.businessContextNote, 1200);
  const searchLocationNote = clean(input.searchLocationNote, 800);
  const evidenceNote = clean(input.evidenceNote, 1200);
  const confidence = input.confidence ?? "unknown";

  if (input.sourceUrl && !sourceUrl) warnings.push("source_url must be a public http(s) URL.");
  if (input.foundEmail && !foundEmail) warnings.push("found_email was ignored because it is not a valid email address.");
  if (input.sourceType === "rdap_whois" && foundEmail) {
    warnings.push("RDAP/WHOIS evidence is domain verification only and is not email-promotable.");
  }
  if (!sourceUrl && !foundEmail && !foundPhone && !businessContextNote && !searchLocationNote) {
    warnings.push("At least one public source URL, found value, business context note, or search location note is required.");
  }
  if (warnings.some((warning) => warning.startsWith("source_url")) || warnings.some((warning) => warning.startsWith("At least one"))) {
    return { write: null, warnings };
  }

  return {
    write: {
      prospectId: input.prospectId,
      researchRunId: input.researchRunId ?? null,
      sourceType: input.sourceType,
      sourceUrl,
      sourceTitle,
      foundEmail,
      foundPhone,
      businessContextNote,
      searchLocationNote,
      evidenceNote,
      confidence
    },
    warnings
  };
}

export async function storeProspectResearchEvidence(
  repo: ProspectResearchRepository,
  input: ProspectResearchEvidenceInput
): Promise<ProspectResearchEvidenceStoreResult> {
  const prospect = await repo.findProspectById(input.prospectId);
  if (!prospect) {
    return {
      status: "not_found",
      evidenceId: null,
      prospectId: input.prospectId,
      reviewStatus: null,
      emailPromotable: false,
      warnings: ["No Trevor prospect exists for this prospect_id."],
      outboundSent: false
    };
  }

  const normalized = normalizeInput(input);
  if (!normalized.write) {
    return {
      status: "rejected",
      evidenceId: null,
      prospectId: input.prospectId,
      reviewStatus: null,
      emailPromotable: false,
      warnings: normalized.warnings,
      outboundSent: false
    };
  }

  const record = await repo.storeProspectResearchEvidence(normalized.write);
  return {
    status: "stored",
    evidenceId: record.evidenceId,
    prospectId: record.prospectId,
    reviewStatus: record.reviewStatus,
    emailPromotable: isEmailPromotable(record.sourceType, record.foundEmail, record.confidence),
    warnings: normalized.warnings,
    outboundSent: false
  };
}

export async function listProspectResearchEvidence(
  repo: ProspectResearchRepository,
  input: ProspectResearchEvidenceListInput = {}
): Promise<ProspectResearchEvidenceListResult> {
  return repo.listProspectResearchEvidence({
    prospectId: input.prospectId ?? null,
    reviewStatus: input.reviewStatus ?? null,
    limit: normalizeLimit(input.limit)
  });
}

export function prospectResearchEvidenceStoreToMcp(result: ProspectResearchEvidenceStoreResult) {
  return {
    status: result.status,
    evidence_id: result.evidenceId,
    prospect_id: result.prospectId,
    review_status: result.reviewStatus,
    email_promotable: result.emailPromotable,
    warnings: result.warnings,
    outbound_sent: false
  };
}

export function prospectResearchEvidenceListToMcp(result: ProspectResearchEvidenceListResult) {
  return {
    status: result.status,
    items: result.items.map((item) => ({
      evidence_id: item.evidenceId,
      prospect_id: item.prospectId,
      source_type: item.sourceType,
      source_url: item.sourceUrl,
      source_title: item.sourceTitle,
      found_email: item.foundEmail,
      found_phone: item.foundPhone,
      business_context_note: item.businessContextNote,
      search_location_note: item.searchLocationNote,
      evidence_note: item.evidenceNote,
      confidence: item.confidence,
      review_status: item.reviewStatus,
      email_promotable: isEmailPromotable(item.sourceType, item.foundEmail, item.confidence),
      created_at: item.createdAt.toISOString()
    })),
    warnings: result.warnings,
    outbound_sent: false
  };
}
