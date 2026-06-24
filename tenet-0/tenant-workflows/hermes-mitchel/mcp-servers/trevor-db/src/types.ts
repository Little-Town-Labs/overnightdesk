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
}
