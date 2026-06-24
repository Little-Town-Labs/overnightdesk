import { defaultSalesDay, generateDailyCallQueue } from "./queue.js";
import type {
  CadenceDigestInput,
  CadenceDigestResult,
  FollowUpApprovalItem,
  FollowUpDraftRecord,
  ProspectCandidate,
  QueueRepository,
  StaleWorkItem
} from "./types.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const STALE_DAYS = 30;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_LIMIT)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function validSalesDay(salesDay: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(salesDay) && !Number.isNaN(Date.parse(`${salesDay}T00:00:00.000Z`));
}

function displayName(candidate: ProspectCandidate | null, prospectId: number): string {
  const name = candidate?.name?.trim();
  const company = candidate?.company?.trim();
  if (name && company) return `${name} (${company})`;
  return name || company || `Prospect ${prospectId}`;
}

function daysBetween(salesDay: string, value: Date | null): number | null {
  if (!value) return null;
  const salesTime = Date.parse(`${salesDay}T00:00:00.000Z`);
  return Math.max(0, Math.floor((salesTime - value.getTime()) / (24 * 60 * 60 * 1000)));
}

function staleReason(candidate: ProspectCandidate, salesDay: string, daysStale: number | null): string {
  if (candidate.nextActionAt && candidate.nextActionAt.toISOString().slice(0, 10) < salesDay) {
    return `overdue ${candidate.nextActionType ?? "next action"}`;
  }
  if (daysStale !== null && daysStale >= STALE_DAYS) return `dormant for ${daysStale} days`;
  return "cadence review needed";
}

function staleNextStep(candidate: ProspectCandidate): string {
  if (candidate.doNotContact) return "Review contact status before any outreach.";
  if (candidate.nextActionType) return `Review and complete next action: ${candidate.nextActionType}.`;
  return "Review buyer context and decide whether reactivation is appropriate.";
}

function staleWorkItem(candidate: ProspectCandidate, salesDay: string): StaleWorkItem {
  const daysStale = daysBetween(salesDay, candidate.lastInteractionAt);
  return {
    prospectId: candidate.id,
    displayName: displayName(candidate, candidate.id),
    status: candidate.status,
    reason: staleReason(candidate, salesDay, daysStale),
    nextActionType: candidate.nextActionType,
    nextActionAt: candidate.nextActionAt,
    lastInteractionAt: candidate.lastInteractionAt,
    daysStale,
    reviewOnly: candidate.doNotContact,
    suggestedNextStep: staleNextStep(candidate)
  };
}

async function approvalItem(repo: QueueRepository, draft: FollowUpDraftRecord, salesDay: string): Promise<FollowUpApprovalItem> {
  const prospect = await repo.findProspectById(draft.prospectId);
  return {
    draftId: draft.id,
    prospectId: draft.prospectId,
    displayName: displayName(prospect, draft.prospectId),
    channel: draft.channel,
    status: "draft",
    subject: draft.subject,
    createdAt: draft.createdAt,
    ageDays: daysBetween(salesDay, draft.createdAt) ?? 0,
    reviewOnly: Boolean(prospect?.doNotContact)
  };
}

function needsInput(salesDay: string): CadenceDigestResult {
  return {
    status: "needs_input",
    generatedAt: new Date().toISOString(),
    salesDay,
    scheduled: false,
    persistedCallTasks: false,
    counts: {
      callRecommendations: 0,
      reviewNeeded: 0,
      staleItems: 0,
      followUpDrafts: 0,
      suppressed: 0,
      createdTasks: 0,
      reusedTasks: 0
    },
    callQueue: [],
    reviewNeeded: [],
    staleWork: [],
    followUpApprovals: [],
    warnings: ["sales_day must be a valid YYYY-MM-DD date."],
    sideEffects: {
      outboundSent: false,
      interactionsCreated: 0,
      followUpDraftsCreated: 0
    }
  };
}

export async function generateCadenceDigest(repo: QueueRepository, input: CadenceDigestInput = {}): Promise<CadenceDigestResult> {
  const salesDay = input.salesDay ?? defaultSalesDay();
  if (!validSalesDay(salesDay)) return needsInput(salesDay);

  const limit = normalizeLimit(input.limit);
  const persistCallTasks = input.persistCallTasks === true;
  const queue = await generateDailyCallQueue(repo, {
    salesDay,
    limit,
    persist: persistCallTasks,
    includeReviewNeeded: input.includeReviewNeeded,
    inventoryContext: input.inventoryContext
  });
  const staleCandidates = await repo.listStaleProspectCandidates(salesDay, limit, {
    includeDormant: input.includeDormant
  });
  const pendingDrafts = await repo.listPendingFollowUpDrafts(limit);
  const staleWork = staleCandidates.map((candidate) => staleWorkItem(candidate, salesDay));
  const followUpApprovals = await Promise.all(pendingDrafts.map((draft) => approvalItem(repo, draft, salesDay)));
  const warnings = [
    ...queue.warnings,
    "Scheduler is disabled by default; this digest was generated for validation unless scheduled=true is explicitly supplied."
  ];

  return {
    status: "generated",
    generatedAt: new Date().toISOString(),
    salesDay,
    scheduled: input.scheduled === true,
    persistedCallTasks: queue.persisted,
    counts: {
      callRecommendations: queue.counts.recommendations,
      reviewNeeded: queue.counts.reviewNeeded,
      staleItems: staleWork.length,
      followUpDrafts: followUpApprovals.length,
      suppressed: queue.counts.suppressed,
      createdTasks: queue.counts.createdTasks,
      reusedTasks: queue.counts.reusedTasks
    },
    callQueue: queue.recommendations,
    reviewNeeded: queue.reviewNeeded,
    staleWork,
    followUpApprovals,
    warnings,
    sideEffects: {
      outboundSent: false,
      interactionsCreated: 0,
      followUpDraftsCreated: 0
    }
  };
}

function dateToString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function cadenceDigestToMcp(result: CadenceDigestResult) {
  return {
    status: result.status,
    generated_at: result.generatedAt,
    sales_day: result.salesDay,
    scheduled: result.scheduled,
    persisted_call_tasks: result.persistedCallTasks,
    counts: {
      call_recommendations: result.counts.callRecommendations,
      review_needed: result.counts.reviewNeeded,
      stale_items: result.counts.staleItems,
      follow_up_drafts: result.counts.followUpDrafts,
      suppressed: result.counts.suppressed,
      created_tasks: result.counts.createdTasks,
      reused_tasks: result.counts.reusedTasks
    },
    call_queue: result.callQueue.map((item) => ({
      rank: item.rank,
      prospect_id: item.prospectId,
      task_id: item.taskId,
      display_name: item.displayName,
      reason: item.reason,
      call_objective: item.callObjective,
      buyer_context: item.buyerContext,
      suggested_opener: item.suggestedOpener,
      ranking_drivers: item.rankingDrivers,
      missing_context: item.missingContext,
      readiness: item.readiness
    })),
    review_needed: result.reviewNeeded.map((item) => ({
      prospect_id: item.prospectId,
      task_id: item.taskId,
      display_name: item.displayName,
      reason: item.reason,
      call_objective: item.callObjective,
      ranking_drivers: item.rankingDrivers,
      missing_context: item.missingContext
    })),
    stale_work: result.staleWork.map((item) => ({
      prospect_id: item.prospectId,
      display_name: item.displayName,
      status: item.status,
      reason: item.reason,
      next_action_type: item.nextActionType,
      next_action_at: dateToString(item.nextActionAt),
      last_interaction_at: dateToString(item.lastInteractionAt),
      days_stale: item.daysStale,
      review_only: item.reviewOnly,
      suggested_next_step: item.suggestedNextStep
    })),
    follow_up_approvals: result.followUpApprovals.map((item) => ({
      draft_id: item.draftId,
      prospect_id: item.prospectId,
      display_name: item.displayName,
      channel: item.channel,
      status: item.status,
      subject: item.subject,
      created_at: item.createdAt.toISOString(),
      age_days: item.ageDays,
      review_only: item.reviewOnly
    })),
    warnings: result.warnings,
    side_effects: {
      outbound_sent: result.sideEffects.outboundSent,
      interactions_created: result.sideEffects.interactionsCreated,
      follow_up_drafts_created: result.sideEffects.followUpDraftsCreated
    }
  };
}
