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
  findLatestInteraction(prospectId: number): Promise<ProspectInteraction | null>;
  resolvePreCallBriefLookup(lookup: PreCallBriefLookup): Promise<BriefLookupResult>;
  capturePostCall(input: PostCallCaptureWrite): Promise<PostCallCaptureWriteResult>;
}
