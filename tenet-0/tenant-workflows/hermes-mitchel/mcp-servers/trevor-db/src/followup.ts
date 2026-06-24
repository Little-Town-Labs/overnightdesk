import { noteSummary } from "./safety.js";
import type {
  FollowUpChannel,
  FollowUpDraftRecord,
  FollowUpDraftResult,
  FollowUpDraftStatus,
  GenerateFollowUpDraftInput,
  MarkFollowUpDraftInput,
  ProspectCandidate,
  ProspectInteraction,
  QueueRepository
} from "./types.js";

const VALID_CHANNELS = new Set<string>(["email", "telegram", "sms", "linkedin", "instagram"]);

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

function displayName(prospect: ProspectCandidate): string {
  const name = prospect.name?.trim();
  const company = prospect.company?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  return company || `Prospect ${prospect.id}`;
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
