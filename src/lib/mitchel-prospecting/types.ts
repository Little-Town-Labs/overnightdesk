export type SectionStatusValue = "ok" | "empty" | "unavailable";

export interface SectionStatus {
  status: SectionStatusValue;
  count: number;
  message: string;
  lastUpdatedAt: string | null;
}

export interface ProspectSummary {
  prospectId: number;
  displayName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  status: string;
  priority: string | null;
  agiledContactId: string | null;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  reviewFlags: string[];
}

export interface StagedCandidateSummary {
  candidateId: number;
  businessName: string;
  area: string | null;
  phone: string | null;
  website: string | null;
  reviewStatus: "recommended" | "needs_review" | "duplicate" | "rejected" | "approved";
  dedupeStatus: string;
  dedupeReason: string | null;
  leadSource: string;
  enrichmentSource: string | null;
  qualityScore: number | null;
  sourceUrl: string | null;
  warnings: string[];
}

export interface CallTaskSummary {
  callTaskId: number;
  prospectId: number;
  displayName: string;
  company: string | null;
  phone: string | null;
  dueAt: string | null;
  priority: string | null;
  readiness: string;
  reason: string | null;
  status: string;
}

export interface ReviewItem {
  itemType: "candidate" | "prospect" | "call_task" | "follow_up_draft";
  itemId: string;
  title: string;
  reason: string;
  source: string;
  recommendedNextStep: string | null;
  blockingFlags: string[];
}

export interface FollowUpDraftSummary {
  draftId: number;
  prospectId: number;
  displayName: string;
  channel: string;
  status: string;
  createdAt: string | null;
  summary: string | null;
  requiresApproval: boolean;
}

export interface MitchelProspectingSummary {
  tenantId: "hermes-mitchel";
  generatedAt: string;
  sections: {
    prospects: SectionStatus;
    stagedCandidates: SectionStatus;
    callTasks: SectionStatus;
    reviewItems: SectionStatus;
    followUpDrafts: SectionStatus;
  };
  prospects: ProspectSummary[];
  stagedCandidates: StagedCandidateSummary[];
  callTasks: CallTaskSummary[];
  reviewItems: ReviewItem[];
  followUpDrafts: FollowUpDraftSummary[];
  warnings: string[];
  outboundSent: false;
}
