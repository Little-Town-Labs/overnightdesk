import { noteSummary } from "./safety.js";
import type {
  FollowUpChannel,
  FollowUpDraftRecord,
  FollowUpDraftResult,
  FollowUpDraftStatus,
  FollowUpSendQueueResult,
  GenerateFollowUpDraftInput,
  ListFollowUpsAwaitingSendInput,
  LogManualFollowUpSentInput,
  ManualFollowUpSentResult,
  MarkFollowUpDraftInput,
  ProspectCandidate,
  ProspectInteraction,
  QueueRepository
} from "./types.js";

const VALID_CHANNELS = new Set<string>(["email", "telegram", "sms", "linkedin", "instagram"]);
const MAX_OPERATOR_LENGTH = 120;
const MAX_EXTERNAL_REF_LENGTH = 240;
const MAX_AUDIT_REASON_LENGTH = 1000;

function emptyResult(
  status: FollowUpDraftResult["status"],
  input: Partial<Pick<FollowUpDraftResult, "draftId" | "prospectId" | "interactionId" | "channel" | "draftStatus">>,
  warnings: string[] = []
): FollowUpDraftResult {
  return {
    status,
    draftId: input.draftId ?? null,
    prospectId: input.prospectId ?? null,
    interactionId: input.interactionId ?? null,
    channel: input.channel ?? null,
    draftStatus: input.draftStatus ?? null,
    subject: null,
    body: null,
    warnings,
    outboundSent: false
  };
}

function draftResult(status: FollowUpDraftResult["status"], draft: FollowUpDraftRecord, warnings: string[] = []): FollowUpDraftResult {
  return {
    status,
    draftId: draft.id,
    prospectId: draft.prospectId,
    interactionId: draft.interactionId,
    channel: draft.channel,
    draftStatus: draft.status,
    subject: draft.subject,
    body: draft.body,
    warnings,
    outboundSent: false
  };
}

function manualSentResult(
  status: ManualFollowUpSentResult["status"],
  draft: FollowUpDraftRecord | null,
  input: Pick<LogManualFollowUpSentInput, "draftId">,
  interactionId: number | null,
  warnings: string[] = [],
  prospect: ProspectCandidate | null = null
): ManualFollowUpSentResult {
  return {
    status,
    draftId: draft?.id ?? input.draftId,
    prospectId: draft?.prospectId ?? prospect?.id ?? null,
    interactionId,
    draftStatus: draft?.status ?? null,
    channel: draft?.channel ?? null,
    sentAt: draft?.sentAt ?? null,
    auditOnly: Boolean(prospect?.doNotContact || draft?.auditOnlyReason),
    warnings,
    outboundSent: false
  };
}

function displayName(prospect: ProspectCandidate): string {
  const name = prospect.name?.trim();
  const company = prospect.company?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  return company || `Prospect ${prospect.id}`;
}

function displayFullName(prospect: ProspectCandidate | null, draft: FollowUpDraftRecord): string {
  const name = prospect?.name?.trim();
  const company = prospect?.company?.trim();
  return name || company || `Prospect ${draft.prospectId}`;
}

function clean(value: string | null | undefined, fallback: string): string {
  return noteSummary(value) || fallback;
}

function channelLabel(channel: FollowUpChannel): string {
  if (channel === "sms") return "SMS";
  if (channel === "linkedin") return "LinkedIn";
  return channel[0].toUpperCase() + channel.slice(1);
}

function subjectFor(channel: FollowUpChannel, prospect: ProspectCandidate): string | null {
  if (channel !== "email") return null;
  const company = prospect.company?.trim();
  return company ? `Following up on ${company}` : "Following up from our call";
}

function dncBody(prospect: ProspectCandidate, interaction: ProspectInteraction): string {
  const summary = clean(interaction.summary, "Recent call outcome was captured without a detailed summary.");
  return [
    "Do not send this follow-up unless Mitchel confirms the do-not-contact status has changed.",
    `Prospect: ${prospect.name?.trim() || prospect.company?.trim() || `Prospect ${prospect.id}`}.`,
    `Captured context: ${summary}`
  ].join("\n\n");
}

function draftBody(channel: FollowUpChannel, prospect: ProspectCandidate, interaction: ProspectInteraction, tone: string | undefined): string {
  if (prospect.doNotContact) return dncBody(prospect, interaction);

  const firstName = displayName(prospect);
  const summary = clean(interaction.summary, "the items we discussed");
  const notes = clean(prospect.notes, "No additional buyer notes are available.");
  const toneLine = tone?.trim() ? `Tone: ${tone.trim()}.` : null;

  if (channel === "email") {
    return [
      `Hi ${firstName},`,
      `Thanks for taking the time to speak today. I wanted to follow up on ${summary}`,
      `Buyer context: ${notes}`,
      "If helpful, I can send the next option set for you to compare.",
      toneLine
    ].filter(Boolean).join("\n\n");
  }

  return [
    `Hi ${firstName} - following up on ${summary}`,
    `Context: ${notes}`,
    `Copy-ready ${channelLabel(channel)} draft only; review before sending.`,
    toneLine
  ].filter(Boolean).join("\n");
}

function validateChannel(channel: FollowUpChannel): channel is FollowUpChannel {
  return VALID_CHANNELS.has(channel);
}

function normalizedLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(25, Math.trunc(limit ?? 10)));
}

function ageDays(from: Date | null, now = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function trimBounded(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function parseSentAt(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function generateFollowUpDraft(
  repo: QueueRepository,
  input: GenerateFollowUpDraftInput
): Promise<FollowUpDraftResult> {
  if (!validateChannel(input.channel)) {
    return emptyResult("invalid", {
      interactionId: input.interactionId,
      channel: null
    }, [`Unsupported channel: ${String(input.channel)}`]);
  }

  const context = await repo.findFollowUpContext(input.interactionId);
  if (!context) {
    return emptyResult("not_found", {
      interactionId: input.interactionId,
      channel: input.channel
    }, ["Captured interaction was not found."]);
  }

  const warnings = context.prospect.doNotContact
    ? ["Prospect is marked do-not-contact; generated draft is a review note and must not be sent."]
    : [];

  if (!input.regenerate) {
    const existing = await repo.findActiveFollowUpDraft(input.interactionId, input.channel);
    if (existing) return draftResult("existing", existing, warnings);
  }

  const draft = await repo.createFollowUpDraft({
    prospectId: context.prospect.id,
    interactionId: context.interaction.id,
    channel: input.channel,
    subject: subjectFor(input.channel, context.prospect),
    body: draftBody(input.channel, context.prospect, context.interaction, input.tone)
  });

  return draftResult("drafted", draft, warnings);
}

export async function markFollowUpDraft(repo: QueueRepository, input: MarkFollowUpDraftInput): Promise<FollowUpDraftResult> {
  const existing = await repo.findFollowUpDraftById(input.draftId);
  if (!existing) return emptyResult("not_found", { draftId: input.draftId }, ["Follow-up draft was not found."]);

  if (existing.status === "discarded" && input.action === "approve") {
    return emptyResult("invalid", {
      draftId: existing.id,
      prospectId: existing.prospectId,
      interactionId: existing.interactionId,
      channel: existing.channel,
      draftStatus: existing.status
    }, ["Discarded drafts cannot be approved."]);
  }

  if (input.action === "approve" && !input.approvedBy?.trim()) {
    return emptyResult("invalid", {
      draftId: existing.id,
      prospectId: existing.prospectId,
      interactionId: existing.interactionId,
      channel: existing.channel,
      draftStatus: existing.status
    }, ["approved_by is required when approving a draft."]);
  }

  const nextStatus: Extract<FollowUpDraftStatus, "approved" | "discarded"> = input.action === "approve" ? "approved" : "discarded";
  const updated = await repo.markFollowUpDraft(existing.id, nextStatus, input.approvedBy?.trim());
  if (!updated) return emptyResult("not_found", { draftId: input.draftId }, ["Follow-up draft was not found."]);
  return draftResult(input.action === "approve" ? "approved" : "discarded", updated);
}

export async function listFollowUpsAwaitingSend(
  repo: QueueRepository,
  input: ListFollowUpsAwaitingSendInput = {}
): Promise<FollowUpSendQueueResult> {
  const items = await repo.listApprovedFollowUpDraftsAwaitingSend(normalizedLimit(input.limit), {
    includeDoNotContact: input.includeDoNotContact
  });
  const queueItems = items.map(({ draft, prospect }) => {
    const reviewOnly = Boolean(prospect?.doNotContact);
    const summary = [
      reviewOnly ? "Review-only approved follow-up; prospect is marked do-not-contact." : "Approved follow-up awaiting manual send confirmation.",
      `Channel: ${channelLabel(draft.channel)}.`,
      draft.subject ? `Subject: ${noteSummary(draft.subject)}.` : null,
      draft.approvedBy ? `Approved by ${noteSummary(draft.approvedBy)}.` : null
    ].filter(Boolean).join(" ");
    return {
      draftId: draft.id,
      prospectId: draft.prospectId,
      displayName: displayFullName(prospect, draft),
      channel: draft.channel,
      subject: draft.subject,
      approvedAt: draft.approvedAt,
      ageDays: ageDays(draft.approvedAt),
      reviewOnly,
      summary
    };
  });
  return {
    status: "ok",
    items: queueItems,
    counts: {
      awaitingSend: queueItems.length,
      reviewOnly: queueItems.filter((item) => item.reviewOnly).length
    },
    warnings: []
  };
}

export async function logManualFollowUpSent(
  repo: QueueRepository,
  input: LogManualFollowUpSentInput
): Promise<ManualFollowUpSentResult> {
  const existing = await repo.findFollowUpDraftById(input.draftId);
  if (!existing) return manualSentResult("not_found", null, input, null, ["Follow-up draft was not found."]);

  const confirmedBy = trimBounded(input.confirmedBy, MAX_OPERATOR_LENGTH);
  if (!confirmedBy) {
    return manualSentResult("needs_input", existing, input, existing.sentInteractionId, ["confirmed_by is required."]);
  }

  const sentAt = parseSentAt(input.sentAt);
  if (!sentAt) {
    return manualSentResult("needs_input", existing, input, existing.sentInteractionId, ["sent_at must be a valid date or timestamp."]);
  }

  const sentVia = trimBounded(input.sentVia, 80) ?? existing.channel;
  const result = await repo.logManualFollowUpSent({
    draftId: existing.id,
    sentAt,
    confirmedBy,
    sentVia,
    externalMessageId: trimBounded(input.externalMessageId, MAX_EXTERNAL_REF_LENGTH),
    auditOnlyReason: trimBounded(input.auditOnlyReason, MAX_AUDIT_REASON_LENGTH)
  });

  if (!result) return manualSentResult("not_found", null, input, null, ["Follow-up draft was not found."]);
  if (result.blockedReason) {
    return manualSentResult("blocked", result.draft, input, result.interactionId, [result.blockedReason], result.prospect);
  }
  return manualSentResult("logged", result.draft, input, result.interactionId, [], result.prospect);
}

export function followUpDraftToMcp(result: FollowUpDraftResult) {
  return {
    status: result.status,
    draft_id: result.draftId,
    prospect_id: result.prospectId,
    interaction_id: result.interactionId,
    channel: result.channel,
    draft_status: result.draftStatus,
    subject: result.subject,
    body: result.body,
    warnings: result.warnings,
    outbound_sent: result.outboundSent
  };
}

export function followUpSendQueueToMcp(result: FollowUpSendQueueResult) {
  return {
    status: result.status,
    items: result.items.map((item) => ({
      draft_id: item.draftId,
      prospect_id: item.prospectId,
      display_name: item.displayName,
      channel: item.channel,
      subject: item.subject,
      approved_at: item.approvedAt?.toISOString() ?? null,
      age_days: item.ageDays,
      review_only: item.reviewOnly,
      summary: item.summary
    })),
    counts: {
      awaiting_send: result.counts.awaitingSend,
      review_only: result.counts.reviewOnly
    },
    warnings: result.warnings
  };
}

export function manualFollowUpSentToMcp(result: ManualFollowUpSentResult) {
  return {
    status: result.status,
    draft_id: result.draftId,
    prospect_id: result.prospectId,
    interaction_id: result.interactionId,
    draft_status: result.draftStatus,
    channel: result.channel,
    sent_at: result.sentAt?.toISOString() ?? null,
    audit_only: result.auditOnly,
    warnings: result.warnings,
    outbound_sent: result.outboundSent
  };
}
