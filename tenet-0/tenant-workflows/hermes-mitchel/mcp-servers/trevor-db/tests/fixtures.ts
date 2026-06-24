import type {
  ExistingCallTask,
  FollowUpDraftRecord,
  ProspectCandidate,
  ProspectInteraction,
  ProspectSourceCandidateInput,
  ProspectSourceCandidateRecord,
  ProspectSourcingRunRecord
} from "../src/types.js";

export function prospect(overrides: Partial<ProspectCandidate>): ProspectCandidate {
  return {
    id: 1,
    name: "Default Buyer",
    company: "Default Co",
    email: "buyer@example.test",
    phone: "555-0100",
    status: "active",
    notes: "Prefers GIA round stones.",
    agiledContactId: "agiled-1",
    preferredChannel: "phone",
    doNotContact: false,
    lastOutcome: null,
    nextActionType: "call",
    nextActionAt: new Date("2026-06-24T14:00:00Z"),
    priority: 1,
    updatedAt: new Date("2026-06-23T14:00:00Z"),
    lastInteractionAt: null,
    ...overrides
  };
}

export function task(overrides: Partial<ExistingCallTask>): ExistingCallTask {
  return {
    id: 100,
    prospectId: 1,
    status: "open",
    dueAt: new Date("2026-06-24T15:00:00Z"),
    ...overrides
  };
}

export function interaction(overrides: Partial<ProspectInteraction>): ProspectInteraction {
  return {
    id: 1,
    prospectId: 1,
    channel: "phone",
    direction: "outbound",
    summary: "Discussed ideal GIA round stone and asked to follow up next week.",
    occurredAt: new Date("2026-06-20T16:00:00Z"),
    ...overrides
  };
}

export function draft(overrides: Partial<FollowUpDraftRecord>): FollowUpDraftRecord {
  return {
    id: 1,
    prospectId: 1,
    interactionId: 1,
    channel: "email",
    subject: "Following up from our call",
    body: "Thanks for taking the time to speak today.",
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    sentAt: null,
    sentBy: null,
    sentVia: null,
    externalMessageId: null,
    auditOnlyReason: null,
    sentInteractionId: null,
    createdAt: new Date("2026-06-24T18:00:00Z"),
    updatedAt: new Date("2026-06-24T18:00:00Z"),
    ...overrides
  };
}

export function sourceCandidate(overrides: Partial<ProspectSourceCandidateInput>): ProspectSourceCandidateInput {
  return {
    businessName: "Independent Jewelers",
    company: "Independent Jewelers",
    phone: "555-0199",
    email: null,
    website: "https://independent.example",
    sourceUrl: "https://maps.example/independent",
    enrichmentUrl: "https://independent.example/contact",
    rating: 4.8,
    reviewCount: 120,
    notes: "Independent retail jeweler with bridal inventory.",
    ...overrides
  };
}

export function sourcingRun(overrides: Partial<ProspectSourcingRunRecord>): ProspectSourcingRunRecord {
  return {
    id: 1,
    source: "browseract_google_maps",
    enrichmentSource: "camofox_contact_enrichment",
    area: "Tysons Corner, Virginia",
    keyword: "jewelry stores diamond dealers",
    status: "staged",
    requestedBy: "Mitchel",
    candidateCount: 1,
    recommendedCount: 1,
    warnings: [],
    createdAt: new Date("2026-06-24T20:00:00Z"),
    updatedAt: new Date("2026-06-24T20:00:00Z"),
    ...overrides
  };
}

export function stagedCandidate(overrides: Partial<ProspectSourceCandidateRecord>): ProspectSourceCandidateRecord {
  return {
    id: 1,
    sourcingRunId: 1,
    businessName: "Independent Jewelers",
    company: "Independent Jewelers",
    area: "Tysons Corner, Virginia",
    phone: "555-0199",
    email: null,
    website: "https://independent.example",
    sourceUrl: "https://maps.example/independent",
    enrichmentUrl: "https://independent.example/contact",
    rating: 4.8,
    reviewCount: 120,
    buyerType: "retail_jeweler",
    leadSource: "browseract_google_maps",
    enrichmentSource: "camofox_contact_enrichment",
    qualityScore: 90,
    reviewStatus: "recommended",
    dedupeStatus: "unique",
    dedupeReason: null,
    reviewNotes: "Independent retail jeweler with bridal inventory.",
    approvedBy: null,
    approvedAt: null,
    promotedProspectId: null,
    createdAt: new Date("2026-06-24T20:00:00Z"),
    updatedAt: new Date("2026-06-24T20:00:00Z"),
    ...overrides
  };
}
