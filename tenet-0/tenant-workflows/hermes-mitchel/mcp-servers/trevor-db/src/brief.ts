import { noteSummary } from "./safety.js";
import type {
  CallTaskRecord,
  ExistingCallTask,
  PreCallBriefLookup,
  PreCallBriefResult,
  ProspectCandidate,
  ProspectInteraction,
  QueueRepository
} from "./types.js";

function displayName(candidate: ProspectCandidate): string {
  const name = candidate.name?.trim();
  const company = candidate.company?.trim();
  if (name && company) return `${name} (${company})`;
  return name || company || `Prospect ${candidate.id}`;
}

function taskReason(task: CallTaskRecord | ExistingCallTask | null): string | null {
  return "reason" in (task ?? {}) ? (task as CallTaskRecord).reason : null;
}

function taskObjective(task: CallTaskRecord | ExistingCallTask | null): string | null {
  return "callObjective" in (task ?? {}) ? (task as CallTaskRecord).callObjective : null;
}

function compactSummary(value: string | null | undefined): string | null {
  const summary = noteSummary(value);
  return summary || null;
}

function missingContext(
  candidate: ProspectCandidate,
  interaction: ProspectInteraction | null,
  inventoryContext: string | undefined
): string[] {
  const missing: string[] = [];
  if (!candidate.phone) missing.push("phone");
  if (!candidate.preferredChannel) missing.push("preferred_channel");
  if (!candidate.agiledContactId) missing.push("agiled_contact");
  if (!interaction) missing.push("recent_interaction");
  if (!inventoryContext?.trim()) missing.push("inventory_context");
  return missing;
}

function warnings(candidate: ProspectCandidate, inventoryContext: string | undefined): string[] {
  const items: string[] = [];
  if (candidate.doNotContact) items.push("Prospect is marked do-not-contact; do not call.");
  if (!candidate.agiledContactId) items.push("Agiled context missing; brief uses Trevor data only.");
  if (!inventoryContext?.trim()) items.push("Inventory context unavailable; do not claim an inventory match.");
  return items;
}

function readiness(candidate: ProspectCandidate): NonNullable<PreCallBriefResult["brief"]>["readiness"] {
  if (candidate.doNotContact) return "do_not_contact";
  if (!candidate.phone) return "review_needed";
  return "call_ready";
}

function recommendedAsk(candidate: ProspectCandidate, task: CallTaskRecord | ExistingCallTask | null): string {
  const objective = taskObjective(task);
  if (objective) return objective;
  if (candidate.nextActionType) return `Complete next action: ${candidate.nextActionType}.`;
  if (candidate.lastOutcome) return `Follow up on last outcome: ${candidate.lastOutcome}.`;
  return "Confirm current buying interest and agree on the next concrete action.";
}

function buyerContext(candidate: ProspectCandidate, interaction: ProspectInteraction | null): string {
  const parts = [
    candidate.status ? `status ${candidate.status}` : null,
    candidate.preferredChannel ? `prefers ${candidate.preferredChannel}` : null,
    compactSummary(candidate.notes),
    interaction?.summary ? `last touch: ${compactSummary(interaction.summary)}` : null
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "No buyer context beyond the prospect record.";
}

function suggestedOpener(candidate: ProspectCandidate, interaction: ProspectInteraction | null, inventoryContext: string | undefined): string {
  const firstName = candidate.name?.trim().split(/\s+/)[0] || "there";
  if (inventoryContext?.trim()) {
    return `Hi ${firstName}, I wanted to check in because we may have availability worth comparing against what you usually buy.`;
  }
  if (interaction?.summary) {
    return `Hi ${firstName}, I wanted to follow up on our last conversation and see what would be useful next.`;
  }
  if (candidate.lastOutcome) {
    return `Hi ${firstName}, I wanted to follow up on ${candidate.lastOutcome} and see where things stand.`;
  }
  return `Hi ${firstName}, I wanted to check in and see what you are looking for this week.`;
}

function followUpFallback(candidate: ProspectCandidate): string {
  if (candidate.doNotContact) return "Do not leave a follow-up message unless Mitchel confirms the contact status changed.";
  return "If there is no answer, note the attempt and use post-call capture to decide whether a follow-up draft is needed.";
}

function disambiguation(matches: ProspectCandidate[]) {
  return matches.map((candidate) => ({
    prospectId: candidate.id,
    displayName: displayName(candidate),
    company: candidate.company,
    status: candidate.status
  }));
}

export async function generatePreCallBrief(
  repo: QueueRepository,
  lookup: PreCallBriefLookup
): Promise<PreCallBriefResult> {
  const resolved = await repo.resolvePreCallBriefLookup(lookup);
  const prospect = resolved.prospect;
  const task = resolved.task;
  const interaction = prospect ? await repo.findLatestInteraction(prospect.id) : null;

  return {
    generatedAt: new Date().toISOString(),
    lookup: {
      taskId: lookup.taskId ?? null,
      prospectId: lookup.prospectId ?? prospect?.id ?? null,
      query: lookup.query ?? null,
      status: resolved.status
    },
    prospect: prospect ? {
      prospectId: prospect.id,
      displayName: displayName(prospect),
      company: prospect.company,
      status: prospect.status,
      phone: prospect.phone,
      preferredChannel: prospect.preferredChannel,
      agiledContactId: prospect.agiledContactId
    } : null,
    task: task ? {
      taskId: task.id,
      status: task.status,
      dueAt: task.dueAt,
      reason: taskReason(task),
      callObjective: taskObjective(task)
    } : null,
    lastTouch: interaction ? {
      occurredAt: interaction.occurredAt,
      channel: interaction.channel,
      direction: interaction.direction,
      summary: compactSummary(interaction.summary) ?? "Recent interaction summary unavailable."
    } : null,
    brief: prospect ? {
      recommendedAsk: recommendedAsk(prospect, task),
      suggestedOpener: suggestedOpener(prospect, interaction, lookup.inventoryContext),
      buyerContext: buyerContext(prospect, interaction),
      followUpFallback: followUpFallback(prospect),
      readiness: readiness(prospect)
    } : null,
    missingContext: prospect ? missingContext(prospect, interaction, lookup.inventoryContext) : [],
    warnings: prospect ? warnings(prospect, lookup.inventoryContext) : [],
    disambiguation: disambiguation(resolved.matches)
  };
}

export function preCallBriefToMcp(result: PreCallBriefResult) {
  return {
    generated_at: result.generatedAt,
    lookup: {
      task_id: result.lookup.taskId,
      prospect_id: result.lookup.prospectId,
      query: result.lookup.query,
      status: result.lookup.status
    },
    prospect: result.prospect ? {
      prospect_id: result.prospect.prospectId,
      display_name: result.prospect.displayName,
      company: result.prospect.company,
      status: result.prospect.status,
      phone: result.prospect.phone,
      preferred_channel: result.prospect.preferredChannel,
      agiled_contact_id: result.prospect.agiledContactId
    } : null,
    task: result.task ? {
      task_id: result.task.taskId,
      status: result.task.status,
      due_at: result.task.dueAt?.toISOString() ?? null,
      reason: result.task.reason,
      call_objective: result.task.callObjective
    } : null,
    last_touch: result.lastTouch ? {
      occurred_at: result.lastTouch.occurredAt.toISOString(),
      channel: result.lastTouch.channel,
      direction: result.lastTouch.direction,
      summary: result.lastTouch.summary
    } : null,
    brief: result.brief ? {
      recommended_ask: result.brief.recommendedAsk,
      suggested_opener: result.brief.suggestedOpener,
      buyer_context: result.brief.buyerContext,
      follow_up_fallback: result.brief.followUpFallback,
      readiness: result.brief.readiness
    } : null,
    missing_context: result.missingContext,
    warnings: result.warnings,
    disambiguation: result.disambiguation.map((candidate) => ({
      prospect_id: candidate.prospectId,
      display_name: candidate.displayName,
      company: candidate.company,
      status: candidate.status
    }))
  };
}
