import type {
  CallRecommendation,
  CallTaskListResult,
  CallTaskStatus,
  CallTaskStatusResult,
  GenerateQueueOptions,
  ProspectCandidate,
  QueueRepository,
  QueueRunResult
} from "./types.js";
import { noteSummary } from "./safety.js";

const HOT_STATUSES = new Set(["quoted", "negotiating", "interested", "active", "hot"]);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const REVIEW_FETCH_LIMIT = 25;

export function defaultSalesDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_LIMIT)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function isDue(candidate: ProspectCandidate, salesDay: string): boolean {
  if (!candidate.nextActionAt) return false;
  return candidate.nextActionAt.toISOString().slice(0, 10) <= salesDay;
}

function isStale(candidate: ProspectCandidate, salesDay: string): boolean {
  if (!candidate.lastInteractionAt) return true;
  const salesTime = Date.parse(`${salesDay}T00:00:00.000Z`);
  const ageMs = salesTime - candidate.lastInteractionAt.getTime();
  return ageMs >= 30 * 24 * 60 * 60 * 1000;
}

function displayName(candidate: ProspectCandidate): string {
  const name = candidate.name?.trim();
  const company = candidate.company?.trim();
  if (name && company) return `${name} (${company})`;
  return name || company || `Prospect ${candidate.id}`;
}

function missingContext(candidate: ProspectCandidate): string[] {
  const missing: string[] = [];
  if (!candidate.phone) missing.push("phone");
  if (!candidate.agiledContactId) missing.push("agiled_contact");
  if (!candidate.preferredChannel) missing.push("preferred_channel");
  return missing;
}

function rankingDrivers(candidate: ProspectCandidate, salesDay: string, hasInventoryContext: boolean): string[] {
  const drivers: string[] = [];
  if (isDue(candidate, salesDay)) {
    drivers.push(candidate.nextActionAt?.toISOString().slice(0, 10) === salesDay ? "due_today" : "overdue_next_action");
  }
  if (candidate.priority >= 3) drivers.push("high_priority");
  if (isStale(candidate, salesDay)) drivers.push("stale_relationship");
  if (candidate.status && HOT_STATUSES.has(candidate.status.toLowerCase())) drivers.push("hot_status");
  if (hasInventoryContext) drivers.push("inventory_context_available");
  return drivers;
}

function scoreCandidate(candidate: ProspectCandidate, salesDay: string, hasInventoryContext: boolean): number {
  let score = candidate.priority * 10;
  const due = isDue(candidate, salesDay);
  if (due) {
    score += candidate.nextActionAt?.toISOString().slice(0, 10) === salesDay ? 80 : 100;
  }
  if (isStale(candidate, salesDay)) score += 30;
  if (candidate.status && HOT_STATUSES.has(candidate.status.toLowerCase())) score += 20;
  if (hasInventoryContext) score += 5;
  return score;
}

function buildReason(candidate: ProspectCandidate, drivers: string[]): string {
  if (drivers.includes("overdue_next_action")) return "Next action is overdue.";
  if (drivers.includes("due_today")) return "Next action is due today.";
  if (drivers.includes("high_priority")) return "Prospect is marked high priority.";
  if (drivers.includes("stale_relationship")) return "Relationship appears stale and should be reviewed.";
  if (drivers.includes("hot_status")) return `Status is ${candidate.status}.`;
  return "Prospect is a reasonable review candidate for today's call block.";
}

function buildObjective(candidate: ProspectCandidate): string {
  if (candidate.nextActionType) return `Complete next action: ${candidate.nextActionType}.`;
  if (candidate.lastOutcome) return `Follow up on last outcome: ${candidate.lastOutcome}.`;
  return "Confirm current buying interest and identify the next concrete action.";
}

function buildBuyerContext(candidate: ProspectCandidate): string {
  const parts = [
    candidate.status ? `status ${candidate.status}` : null,
    candidate.preferredChannel ? `prefers ${candidate.preferredChannel}` : null,
    noteSummary(candidate.notes)
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "No buyer context beyond the prospect record.";
}

function buildOpener(candidate: ProspectCandidate, hasInventoryContext: boolean): string {
  const name = candidate.name?.split(/\s+/)[0] || "there";
  if (hasInventoryContext) {
    return `Hi ${name}, I wanted to check in because we may have availability worth reviewing against what you usually buy.`;
  }
  if (candidate.lastOutcome) {
    return `Hi ${name}, I wanted to follow up on ${candidate.lastOutcome} and see what would be useful next.`;
  }
  return `Hi ${name}, I wanted to check in and see what you are looking for this week.`;
}

interface RankedRecommendation extends CallRecommendation {
  priority: number;
  nextActionAt: Date | null;
  updatedAt: Date | null;
}

export function buildRecommendations(
  candidates: ProspectCandidate[],
  salesDay: string,
  options: Pick<GenerateQueueOptions, "limit" | "includeReviewNeeded" | "inventoryContext"> = {}
): { recommendations: CallRecommendation[]; reviewNeeded: CallRecommendation[]; suppressed: number } {
  const limit = normalizeLimit(options.limit);
  const hasInventoryContext = Boolean(options.inventoryContext?.trim());
  const callable: RankedRecommendation[] = [];
  const reviewNeeded: RankedRecommendation[] = [];
  let suppressed = 0;

  for (const candidate of candidates) {
    if (candidate.doNotContact) {
      suppressed += 1;
      continue;
    }

    const missing = missingContext(candidate);
    const readiness = candidate.phone ? "call_ready" : "review_needed";
    const drivers = rankingDrivers(candidate, salesDay, hasInventoryContext);
    const recommendation: CallRecommendation = {
      rank: 0,
      prospectId: candidate.id,
      taskId: null,
      displayName: displayName(candidate),
      score: scoreCandidate(candidate, salesDay, hasInventoryContext),
      reason: buildReason(candidate, drivers),
      callObjective: buildObjective(candidate),
      buyerContext: buildBuyerContext(candidate),
      suggestedOpener: buildOpener(candidate, hasInventoryContext),
      rankingDrivers: drivers,
      missingContext: missing,
      readiness
    };
    const rankedRecommendation = {
      ...recommendation,
      priority: candidate.priority,
      nextActionAt: candidate.nextActionAt,
      updatedAt: candidate.updatedAt
    };

    if (readiness === "call_ready") {
      callable.push(rankedRecommendation);
    } else if (options.includeReviewNeeded !== false) {
      reviewNeeded.push(rankedRecommendation);
    }
  }

  const timeValue = (date: Date | null, nullsLast = true) => date?.getTime() ?? (nullsLast ? Number.POSITIVE_INFINITY : 0);
  const sortRecommendations = (a: RankedRecommendation, b: RankedRecommendation) =>
    b.score - a.score ||
    b.priority - a.priority ||
    timeValue(a.nextActionAt) - timeValue(b.nextActionAt) ||
    timeValue(b.updatedAt, false) - timeValue(a.updatedAt, false) ||
    a.prospectId - b.prospectId;

  callable.sort(sortRecommendations);
  reviewNeeded.sort(sortRecommendations);

  return {
    recommendations: callable.slice(0, limit).map(({ priority: _priority, nextActionAt: _next, updatedAt: _updated, ...item }, index) => ({ ...item, rank: index + 1 })),
    reviewNeeded: reviewNeeded.slice(0, limit).map(({ priority: _priority, nextActionAt: _next, updatedAt: _updated, ...item }, index) => ({ ...item, rank: index + 1 })),
    suppressed
  };
}

export async function generateDailyCallQueue(
  repo: QueueRepository,
  options: GenerateQueueOptions = {}
): Promise<QueueRunResult> {
  const salesDay = options.salesDay ?? defaultSalesDay();
  const limit = normalizeLimit(options.limit);
  const persist = options.persist !== false;
  const callableCandidates = await repo.listProspectCandidates(salesDay, limit, { callableOnly: true });
  const reviewCandidates = options.includeReviewNeeded === false
    ? []
    : await repo.listProspectCandidates(salesDay, REVIEW_FETCH_LIMIT);
  const suppressed = reviewCandidates.filter((candidate) => candidate.doNotContact).length;
  const reviewOnlyCandidates = reviewCandidates.filter((candidate) =>
    !candidate.doNotContact &&
    !candidate.phone &&
    !callableCandidates.some((callable) => callable.id === candidate.id)
  );
  const built = buildRecommendations([...callableCandidates, ...reviewOnlyCandidates], salesDay, options);
  let createdTasks = 0;
  let reusedTasks = 0;

  const recommendations: CallRecommendation[] = [];
  for (const recommendation of built.recommendations) {
    let taskId: number | null = null;
    if (persist) {
      const existing = await repo.findOpenCallTask(recommendation.prospectId, salesDay);
      if (existing) {
        taskId = existing.id;
        reusedTasks += 1;
      } else {
        const created = await repo.createCallTask({
          prospectId: recommendation.prospectId,
          priority: Math.round(recommendation.score),
          reason: recommendation.reason,
          callObjective: recommendation.callObjective,
          dueAt: `${salesDay}T15:00:00.000Z`
        });
        taskId = created.id;
        createdTasks += 1;
      }
    }
    recommendations.push({ ...recommendation, taskId });
  }

  return {
    generatedAt: new Date().toISOString(),
    salesDay,
    persisted: persist,
    counts: {
      recommendations: recommendations.length,
      reviewNeeded: built.reviewNeeded.length,
      suppressed,
      createdTasks,
      reusedTasks
    },
    recommendations,
    reviewNeeded: built.reviewNeeded.map(({ rank: _rank, score: _score, suggestedOpener: _opener, buyerContext: _context, readiness: _readiness, ...rest }) => rest),
    warnings: options.inventoryContext?.trim()
      ? ["Inventory context was used for ranking explanation only and was not stored."]
      : ["Inventory context unavailable; ranked from Trevor cadence data only."]
  };
}

export async function listCallTasks(
  repo: QueueRepository,
  status: CallTaskStatus = "open",
  salesDay?: string,
  limit = 20
) {
  return { tasks: await repo.listCallTasks(status, salesDay, Math.max(1, Math.min(50, Math.trunc(limit)))) };
}

export async function markCallTaskStatus(repo: QueueRepository, taskId: number, status: CallTaskStatus) {
  return repo.markCallTaskStatus(taskId, status);
}

function recommendationToMcp(item: CallRecommendation) {
  return {
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
  };
}

function reviewNeededToMcp(item: QueueRunResult["reviewNeeded"][number]) {
  return {
    prospect_id: item.prospectId,
    task_id: item.taskId,
    display_name: item.displayName,
    reason: item.reason,
    call_objective: item.callObjective,
    ranking_drivers: item.rankingDrivers,
    missing_context: item.missingContext
  };
}

export function queueRunToMcp(result: QueueRunResult) {
  return {
    generated_at: result.generatedAt,
    sales_day: result.salesDay,
    persisted: result.persisted,
    counts: {
      recommendations: result.counts.recommendations,
      review_needed: result.counts.reviewNeeded,
      suppressed: result.counts.suppressed,
      created_tasks: result.counts.createdTasks,
      reused_tasks: result.counts.reusedTasks
    },
    recommendations: result.recommendations.map(recommendationToMcp),
    review_needed: result.reviewNeeded.map(reviewNeededToMcp),
    warnings: result.warnings
  };
}

export function callTasksToMcp(result: CallTaskListResult) {
  return {
    tasks: result.tasks.map((task) => ({
      task_id: task.taskId,
      prospect_id: task.prospectId,
      display_name: task.displayName,
      status: task.status,
      priority: task.priority,
      reason: task.reason,
      call_objective: task.callObjective,
      due_at: task.dueAt?.toISOString() ?? null,
      completed_at: task.completedAt?.toISOString() ?? null
    }))
  };
}

export function taskStatusToMcp(result: CallTaskStatusResult) {
  return {
    task_id: result.taskId,
    status: result.status,
    updated: result.updated,
    completed_at: result.completedAt?.toISOString() ?? null
  };
}
