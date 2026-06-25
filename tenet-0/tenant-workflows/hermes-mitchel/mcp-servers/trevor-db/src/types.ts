export type CallTaskStatus = "open" | "completed" | "snoozed" | "discarded";

export interface ProspectCandidate {
  id: number;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  notes: string | null;
  agiledContactId: string | null;
  preferredChannel: string | null;
  doNotContact: boolean;
  lastOutcome: string | null;
  nextActionType: string | null;
  nextActionAt: Date | null;
  priority: number;
  updatedAt: Date | null;
  lastInteractionAt: Date | null;
}

export interface ExistingCallTask {
  id: number;
  prospectId: number;
  status: CallTaskStatus;
  dueAt: Date | null;
}

export interface CallTaskRecord extends ExistingCallTask {
  priority: number;
  reason: string | null;
  callObjective: string | null;
}

export interface ProspectInteraction {
  id?: number;
  prospectId: number;
  channel: string | null;
  direction: string | null;
  summary: string | null;
  occurredAt: Date;
}

export type FollowUpChannel = "email" | "telegram" | "sms" | "linkedin" | "instagram";
export type FollowUpDraftStatus = "draft" | "approved" | "discarded" | "sent" | "manual_sent";

export interface FollowUpDraftRecord {
  id: number;
  prospectId: number;
  interactionId: number;
  channel: FollowUpChannel;
  subject: string | null;
  body: string;
  status: FollowUpDraftStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  sentBy: string | null;
  sentVia: string | null;
  externalMessageId: string | null;
  auditOnlyReason: string | null;
  sentInteractionId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUpContext {
  prospect: ProspectCandidate;
  interaction: ProspectInteraction & { id: number };
}

export interface GenerateFollowUpDraftInput {
  interactionId: number;
  channel: FollowUpChannel;
  tone?: string;
  regenerate?: boolean;
}

export interface MarkFollowUpDraftInput {
  draftId: number;
  action: "approve" | "discard";
  approvedBy?: string;
}

export interface FollowUpDraftWrite {
  prospectId: number;
  interactionId: number;
  channel: FollowUpChannel;
  subject: string | null;
  body: string;
}

export interface FollowUpDraftResult {
  status: "drafted" | "existing" | "approved" | "discarded" | "not_found" | "invalid";
  draftId: number | null;
  prospectId: number | null;
  interactionId: number | null;
  channel: FollowUpChannel | null;
  draftStatus: FollowUpDraftStatus | null;
  subject: string | null;
  body: string | null;
  warnings: string[];
  outboundSent: false;
}

export interface ListFollowUpsAwaitingSendInput {
  limit?: number;
  includeDoNotContact?: boolean;
}

export interface FollowUpSendQueueItem {
  draftId: number;
  prospectId: number;
  displayName: string;
  channel: FollowUpChannel;
  subject: string | null;
  approvedAt: Date | null;
  ageDays: number;
  reviewOnly: boolean;
  summary: string;
}

export interface FollowUpSendQueueResult {
  status: "ok";
  items: FollowUpSendQueueItem[];
  counts: {
    awaitingSend: number;
    reviewOnly: number;
  };
  warnings: string[];
}

export interface LogManualFollowUpSentInput {
  draftId: number;
  sentAt: string;
  confirmedBy: string;
  sentVia?: string;
  externalMessageId?: string;
  auditOnlyReason?: string;
}

export interface ManualFollowUpSentResult {
  status: "logged" | "blocked" | "needs_input" | "not_found";
  draftId: number;
  prospectId: number | null;
  interactionId: number | null;
  draftStatus: FollowUpDraftStatus | null;
  channel: FollowUpChannel | null;
  sentAt: Date | null;
  auditOnly: boolean;
  warnings: string[];
  outboundSent: false;
}

export interface ManualFollowUpSentWrite {
  draftId: number;
  sentAt: Date;
  confirmedBy: string;
  sentVia: string;
  externalMessageId: string | null;
  auditOnlyReason: string | null;
}

export type ProspectSource =
  | "browseract_google_maps"
  | "browseract_contact_finder"
  | "browseract_industry_radar"
  | "manual_import";

export type ProspectEnrichmentSource =
  | "camofox_website_recon"
  | "camofox_contact_enrichment"
  | "browseract_website_data_scrape";

export type ProspectCandidateReviewStatus = "recommended" | "needs_review" | "duplicate" | "rejected" | "approved";
export type ProspectCandidateDedupeStatus = "unique" | "possible_duplicate" | "duplicate";

export interface ProspectSourceCandidateInput {
  businessName: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  sourceUrl?: string | null;
  enrichmentUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  notes?: string | null;
}

export interface ProspectSourcingRunRecord {
  id: number;
  source: ProspectSource;
  enrichmentSource: ProspectEnrichmentSource | null;
  area: string;
  keyword: string | null;
  status: "staged" | "reviewed" | "promoted" | "failed" | "canceled";
  requestedBy: string | null;
  candidateCount: number;
  recommendedCount: number;
  warnings: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProspectSourceCandidateRecord {
  id: number;
  sourcingRunId: number;
  businessName: string;
  company: string | null;
  area: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  sourceUrl: string | null;
  enrichmentUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  buyerType: "retail_jeweler" | "wholesale_dealer" | "private_collector" | "broker";
  leadSource: ProspectSource;
  enrichmentSource: ProspectEnrichmentSource | null;
  qualityScore: number;
  reviewStatus: ProspectCandidateReviewStatus;
  dedupeStatus: ProspectCandidateDedupeStatus;
  dedupeReason: string | null;
  reviewNotes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  promotedProspectId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageProspectCandidatesInput {
  source: ProspectSource;
  enrichmentSource?: ProspectEnrichmentSource;
  area: string;
  keyword?: string;
  requestedBy?: string;
  candidates: ProspectSourceCandidateInput[];
}

export interface StageProspectCandidateWrite {
  businessName: string;
  company: string | null;
  area: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  sourceUrl: string | null;
  enrichmentUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  buyerType: "retail_jeweler";
  leadSource: ProspectSource;
  enrichmentSource: ProspectEnrichmentSource | null;
  qualityScore: number;
  reviewStatus: ProspectCandidateReviewStatus;
  dedupeStatus: ProspectCandidateDedupeStatus;
  dedupeReason: string | null;
  reviewNotes: string | null;
}

export interface StageProspectCandidatesWrite {
  source: ProspectSource;
  enrichmentSource: ProspectEnrichmentSource | null;
  area: string;
  keyword: string | null;
  requestedBy: string | null;
  warnings: string[];
  candidates: StageProspectCandidateWrite[];
}

export interface StageProspectCandidatesResult {
  status: "staged" | "rejected";
  sourcingRunId: number | null;
  stagedCount: number;
  candidates: ProspectSourceCandidateRecord[];
  warnings: string[];
  outboundSent: false;
}

export interface ReviewProspectCandidatesInput {
  sourcingRunId?: number;
  status?: ProspectCandidateReviewStatus;
  limit?: number;
}

export interface ReviewProspectCandidatesResult {
  status: "ok";
  items: ProspectSourceCandidateRecord[];
  counts: {
    recommended: number;
    needsReview: number;
    duplicate: number;
    rejected: number;
    approved: number;
  };
  warnings: string[];
  outboundSent: false;
}

export interface PromoteProspectCandidateInput {
  candidateId: number;
  approvedBy: string;
  createCallTask?: boolean;
  approvalNote?: string;
}

export interface PromoteProspectCandidateResult {
  status: "promoted" | "duplicate" | "rejected" | "needs_review" | "not_found";
  candidateId: number;
  prospectId: number | null;
  callTaskId: number | null;
  warnings: string[];
  outboundSent: false;
}

export interface PromoteProspectCandidateWrite {
  candidateId: number;
  approvedBy: string;
  createCallTask: boolean;
  approvalNote: string | null;
}

export interface CadenceDigestInput {
  salesDay?: string;
  limit?: number;
  persistCallTasks?: boolean;
  includeReviewNeeded?: boolean;
  includeDormant?: boolean;
  scheduled?: boolean;
  inventoryContext?: string;
}

export interface StaleWorkItem {
  prospectId: number;
  displayName: string;
  status: string | null;
  reason: string;
  nextActionType: string | null;
  nextActionAt: Date | null;
  lastInteractionAt: Date | null;
  daysStale: number | null;
  reviewOnly: boolean;
  suggestedNextStep: string;
}

export interface FollowUpApprovalItem {
  draftId: number;
  prospectId: number;
  displayName: string;
  channel: FollowUpChannel;
  status: "draft";
  subject: string | null;
  createdAt: Date;
  ageDays: number;
  reviewOnly: boolean;
}

export interface CadenceDigestResult {
  status: "generated" | "needs_input";
  generatedAt: string;
  salesDay: string;
  scheduled: boolean;
  persistedCallTasks: boolean;
  counts: {
    callRecommendations: number;
    reviewNeeded: number;
    staleItems: number;
    followUpDrafts: number;
    suppressed: number;
    createdTasks: number;
    reusedTasks: number;
  };
  callQueue: CallRecommendation[];
  reviewNeeded: QueueRunResult["reviewNeeded"];
  staleWork: StaleWorkItem[];
  followUpApprovals: FollowUpApprovalItem[];
  warnings: string[];
  sideEffects: {
    outboundSent: false;
    interactionsCreated: number;
    followUpDraftsCreated: number;
  };
}

export type PostCallOutcome =
  | "no_answer"
  | "left_voicemail"
  | "interested"
  | "quoted"
  | "follow_up_later"
  | "not_interested"
  | "sold"
  | "wrong_number"
  | "do_not_contact";

export type CaptureStatus = "captured" | "needs_input" | "duplicate" | "not_found";
export type AgiledNoteStatus = "created" | "skipped" | "failed" | "not_requested";

export interface PostCallCaptureInput {
  taskId?: number;
  prospectId?: number;
  outcome?: PostCallOutcome;
  summary?: string;
  nextActionType?: string;
  nextActionAt?: string;
  agiledNote?: boolean;
  agiledNoteStatus?: AgiledNoteStatus;
}

export interface PostCallCaptureWrite {
  prospectId: number;
  taskId: number | null;
  outcome: PostCallOutcome;
  summary: string;
  nextActionType: string | null;
  nextActionAt: Date | null;
}

export interface PostCallCaptureWriteResult {
  interactionId: number;
  prospectId: number;
  taskId: number | null;
  taskStatus: CallTaskStatus | null;
  prospectUpdates: string[];
}

export interface PostCallCaptureResult {
  status: CaptureStatus;
  missingFields: string[];
  interactionId: number | null;
  prospectId: number | null;
  taskId: number | null;
  prospectUpdates: string[];
  taskStatus: CallTaskStatus | null;
  agiledNote: {
    status: AgiledNoteStatus;
    reference: string | null;
    message: string | null;
  };
  warnings: string[];
  outboundSent: false;
}

export type BuyerIntakeSource =
  | "manual_entry"
  | "phone_call"
  | "referral"
  | "trade_show"
  | "browseract_google_maps"
  | "browseract_contact_finder"
  | "camofox_website_recon"
  | "mitchelbrown.com";

export type BuyerIntakeMode = "create_or_update" | "update_existing" | "validate_only";
export type BuyerIntakeChannel = "phone" | "in_person" | "email" | "text" | "website" | "social" | "referral" | "other";
export type BuyerIntakeOutcome =
  | "interested"
  | "quoted"
  | "follow_up_later"
  | "not_interested"
  | "sold"
  | "wrong_number"
  | "do_not_contact"
  | "info_only"
  | "new_lead";
export type BuyerIntakeNextActionType = "call" | "follow_up" | "draft_follow_up" | "review" | "none";
export type BuyerIntakeAgiledSync = "not_attempted" | "skip" | "link_only" | "create_or_update";
export type BuyerIntakeAgiledStatus = "not_attempted" | "skipped" | "linked" | "created" | "updated" | "failed";
export type BuyerIntakeStatus = "captured" | "updated" | "created" | "needs_review" | "duplicate" | "rejected" | "validation_only" | "error";
export type BuyerIntakeDedupeStatus = "unique" | "matched_existing" | "possible_duplicate" | "duplicate" | "needs_review";

export interface BuyerIntakeInput {
  requestedBy?: string;
  source: BuyerIntakeSource;
  intakeMode?: BuyerIntakeMode;
  prospectId?: number;
  agiledContactId?: string;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  area?: string;
  buyerType?: "retail_jeweler" | "wholesale_dealer" | "broker" | "private_collector" | "unknown";
  preferences?: string;
  conversationChannel?: BuyerIntakeChannel;
  conversationSummary?: string;
  outcome?: BuyerIntakeOutcome;
  nextActionType?: BuyerIntakeNextActionType;
  nextActionAt?: string;
  createCallTask?: boolean;
  createFollowUpDraft?: boolean;
  agiledSync?: BuyerIntakeAgiledSync;
  agiledSyncStatus?: BuyerIntakeAgiledStatus;
}

export interface BuyerIntakeDedupeMatch {
  source: "trevor" | "agiled";
  id: string;
  displayName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  matchReason: string;
  confidence: "exact" | "likely" | "possible";
}

export interface BuyerIntakeNextActionResult {
  type: "call_task" | "follow_up_draft";
  id: number | null;
  status: "created" | "reused" | "skipped" | "blocked" | "failed";
  reason: string | null;
}

export interface BuyerIntakeResult {
  status: BuyerIntakeStatus;
  missingFields: string[];
  prospectId: number | null;
  interactionId: number | null;
  callTaskId: number | null;
  followUpDraftId: number | null;
  dedupeStatus: BuyerIntakeDedupeStatus;
  dedupeMatches: BuyerIntakeDedupeMatch[];
  agiled: {
    status: BuyerIntakeAgiledStatus;
    reference: string | null;
    message: string | null;
  };
  nextActions: BuyerIntakeNextActionResult[];
  warnings: string[];
  outboundSent: false;
}

export interface BuyerIntakeProspectWrite {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  notes: string | null;
  agiledContactId: string | null;
  preferredChannel: string | null;
  doNotContact: boolean;
  lastOutcome: string | null;
  nextActionType: string | null;
  nextActionAt: Date | null;
  priority: number;
  leadSource: string;
}

export interface BuyerIntakeProspectUpdate {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  notes?: string | null;
  agiledContactId?: string | null;
  preferredChannel?: string | null;
  doNotContact?: boolean;
  lastOutcome?: string | null;
  nextActionType?: string | null;
  nextActionAt?: Date | null;
  leadSource?: string | null;
}

export interface BuyerIntakeInteractionWrite {
  prospectId: number;
  channel: string | null;
  direction: string | null;
  summary: string;
  occurredAt: Date;
}

export interface BuyerIntakeRecordWrite {
  prospectId: number | null;
  createProspect: BuyerIntakeProspectWrite | null;
  updateProspect: BuyerIntakeProspectUpdate | null;
  interaction: Omit<BuyerIntakeInteractionWrite, "prospectId">;
}

export interface BuyerIntakeRecordWriteResult {
  prospect: ProspectCandidate;
  interaction: ProspectInteraction & { id: number };
}

export interface BuyerIntakeLookup {
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  limit: number;
}

export type Readiness = "call_ready" | "review_needed";

export interface CallRecommendation {
  rank: number;
  prospectId: number;
  taskId: number | null;
  displayName: string;
  score: number;
  reason: string;
  callObjective: string;
  buyerContext: string;
  suggestedOpener: string;
  rankingDrivers: string[];
  missingContext: string[];
  readiness: Readiness;
}

export interface QueueRunResult {
  generatedAt: string;
  salesDay: string;
  persisted: boolean;
  counts: {
    recommendations: number;
    reviewNeeded: number;
    suppressed: number;
    createdTasks: number;
    reusedTasks: number;
  };
  recommendations: CallRecommendation[];
  reviewNeeded: Omit<CallRecommendation, "rank" | "score" | "suggestedOpener" | "buyerContext" | "readiness">[];
  warnings: string[];
}

export interface CallTaskListResult {
  tasks: Array<{
    taskId: number;
    prospectId: number;
    displayName: string;
    status: CallTaskStatus;
    priority: number;
    reason: string;
    callObjective: string | null;
    dueAt: Date | null;
    completedAt: Date | null;
  }>;
}

export interface CallTaskStatusResult {
  taskId: number;
  status: CallTaskStatus;
  updated: boolean;
  completedAt: Date | null;
}

export interface GenerateQueueOptions {
  salesDay?: string;
  limit?: number;
  persist?: boolean;
  includeReviewNeeded?: boolean;
  inventoryContext?: string;
}

export interface PreCallBriefLookup {
  taskId?: number;
  prospectId?: number;
  query?: string;
  inventoryContext?: string;
}

export type BriefLookupStatus = "found" | "not_found" | "ambiguous";

export interface BriefLookupResult {
  status: BriefLookupStatus;
  prospect: ProspectCandidate | null;
  task: CallTaskRecord | ExistingCallTask | null;
  matches: ProspectCandidate[];
}

export interface PreCallBriefResult {
  generatedAt: string;
  lookup: {
    taskId: number | null;
    prospectId: number | null;
    query: string | null;
    status: BriefLookupStatus;
  };
  prospect: {
    prospectId: number;
    displayName: string;
    company: string | null;
    status: string | null;
    phone: string | null;
    preferredChannel: string | null;
    agiledContactId: string | null;
  } | null;
  task: {
    taskId: number;
    status: CallTaskStatus;
    dueAt: Date | null;
    reason: string | null;
    callObjective: string | null;
  } | null;
  lastTouch: {
    occurredAt: Date;
    channel: string | null;
    direction: string | null;
    summary: string;
  } | null;
  brief: {
    recommendedAsk: string;
    suggestedOpener: string;
    buyerContext: string;
    followUpFallback: string;
    readiness: "call_ready" | "review_needed" | "do_not_contact";
  } | null;
  missingContext: string[];
  warnings: string[];
  disambiguation: Array<{
    prospectId: number;
    displayName: string;
    company: string | null;
    status: string | null;
  }>;
}

export interface QueueRepository {
  listProspectCandidates(salesDay: string, limit: number, options?: { callableOnly?: boolean }): Promise<ProspectCandidate[]>;
  findOpenCallTask(prospectId: number, salesDay: string): Promise<ExistingCallTask | null>;
  createCallTask(input: {
    prospectId: number;
    priority: number;
    reason: string;
    callObjective: string;
    dueAt: string;
  }): Promise<ExistingCallTask>;
  listCallTasks(status: CallTaskStatus, salesDay: string | undefined, limit: number): Promise<CallTaskListResult["tasks"]>;
  markCallTaskStatus(taskId: number, status: CallTaskStatus): Promise<CallTaskStatusResult>;
  findCallTaskById(taskId: number): Promise<CallTaskRecord | ExistingCallTask | null>;
  findProspectById(prospectId: number): Promise<ProspectCandidate | null>;
  searchProspects(query: string, limit: number): Promise<ProspectCandidate[]>;
  findBuyerIntakeMatches(input: BuyerIntakeLookup): Promise<ProspectCandidate[]>;
  createBuyerIntakeProspect(input: BuyerIntakeProspectWrite): Promise<ProspectCandidate>;
  updateBuyerIntakeProspect(prospectId: number, input: BuyerIntakeProspectUpdate): Promise<ProspectCandidate | null>;
  createBuyerIntakeInteraction(input: BuyerIntakeInteractionWrite): Promise<ProspectInteraction & { id: number }>;
  captureBuyerIntakeRecord(input: BuyerIntakeRecordWrite): Promise<BuyerIntakeRecordWriteResult>;
  findLatestInteraction(prospectId: number): Promise<ProspectInteraction | null>;
  resolvePreCallBriefLookup(lookup: PreCallBriefLookup): Promise<BriefLookupResult>;
  capturePostCall(input: PostCallCaptureWrite): Promise<PostCallCaptureWriteResult>;
  findFollowUpContext(interactionId: number): Promise<FollowUpContext | null>;
  findActiveFollowUpDraft(interactionId: number, channel: FollowUpChannel): Promise<FollowUpDraftRecord | null>;
  createFollowUpDraft(input: FollowUpDraftWrite): Promise<FollowUpDraftRecord>;
  findFollowUpDraftById(draftId: number): Promise<FollowUpDraftRecord | null>;
  markFollowUpDraft(draftId: number, status: "approved" | "discarded", approvedBy?: string): Promise<FollowUpDraftRecord | null>;
  listPendingFollowUpDrafts(limit: number): Promise<FollowUpDraftRecord[]>;
  listApprovedFollowUpDraftsAwaitingSend(limit: number, options?: { includeDoNotContact?: boolean }): Promise<Array<{ draft: FollowUpDraftRecord; prospect: ProspectCandidate | null }>>;
  logManualFollowUpSent(input: ManualFollowUpSentWrite): Promise<{ draft: FollowUpDraftRecord; prospect: ProspectCandidate | null; interactionId: number | null; blockedReason: string | null } | null>;
  listStaleProspectCandidates(salesDay: string, limit: number, options?: { includeDormant?: boolean }): Promise<ProspectCandidate[]>;
  stageProspectCandidates(input: StageProspectCandidatesWrite): Promise<{ run: ProspectSourcingRunRecord; candidates: ProspectSourceCandidateRecord[] }>;
  reviewProspectCandidates(input: ReviewProspectCandidatesInput): Promise<ReviewProspectCandidatesResult>;
  findProspectSourceCandidateById(candidateId: number): Promise<ProspectSourceCandidateRecord | null>;
  promoteProspectCandidate(input: PromoteProspectCandidateWrite): Promise<PromoteProspectCandidateResult>;
}
