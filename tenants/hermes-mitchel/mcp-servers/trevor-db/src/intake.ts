import { boundedNote } from "./safety.js";
import type {
  BuyerIntakeAgiledStatus,
  BuyerIntakeDedupeMatch,
  BuyerIntakeInput,
  BuyerIntakeNextActionResult,
  BuyerIntakeOutcome,
  BuyerIntakeProspectUpdate,
  BuyerIntakeResult,
  FollowUpChannel,
  ProspectCandidate,
  QueueRepository
} from "./types.js";

const MAX_DEDUPE_MATCHES = 5;

function clean(value: string | null | undefined, max = 500): string | null {
  const bounded = boundedNote(value, max);
  return bounded && bounded.length ? bounded : null;
}

function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

function emailKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function displayName(prospect: ProspectCandidate): string {
  return prospect.name?.trim() || prospect.company?.trim() || `Prospect ${prospect.id}`;
}

function missingFields(input: BuyerIntakeInput): string[] {
  const hasKnownProspect = Boolean(input.prospectId);
  const hasContact = Boolean(clean(input.phone, 80) || clean(input.email, 200) || clean(input.website, 500));
  const hasCompany = Boolean(clean(input.company, 200));
  const hasNameWithContext = Boolean(clean(input.name, 200) && clean(input.source, 120));
  return hasKnownProspect || hasContact || hasCompany || hasNameWithContext ? [] : ["identity_or_contact"];
}

function summaryFor(input: BuyerIntakeInput): string {
  const parts = [
    clean(input.conversationSummary, 1000),
    input.preferences ? `Preferences: ${clean(input.preferences, 500)}` : null,
    input.outcome ? `Outcome: ${input.outcome}.` : null,
    `Source: ${input.source}.`
  ].filter(Boolean);
  return parts.join(" ").slice(0, 1000);
}

function notesFor(input: BuyerIntakeInput): string {
  return [
    `Source: ${input.source}.`,
    clean(input.area, 120) ? `Area: ${clean(input.area, 120)}.` : null,
    clean(input.website, 500) ? `Website: ${clean(input.website, 500)}.` : null,
    clean(input.address, 300) ? `Address: ${clean(input.address, 300)}.` : null,
    clean(input.preferences, 500) ? `Preferences: ${clean(input.preferences, 500)}.` : null
  ].filter(Boolean).join(" ");
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function statusForOutcome(outcome: BuyerIntakeOutcome | undefined): string | null {
  if (outcome === "do_not_contact") return "do_not_contact";
  if (outcome === "wrong_number") return "needs_contact_update";
  return null;
}

function defaultPreferredChannel(input: BuyerIntakeInput): string | null {
  if (input.conversationChannel === "email" || clean(input.email, 200)) return "email";
  if (input.conversationChannel === "phone" || clean(input.phone, 80)) return "phone";
  return input.conversationChannel ?? null;
}

function toMatch(prospect: ProspectCandidate, input: BuyerIntakeInput): BuyerIntakeDedupeMatch {
  const exactPhone = phoneDigits(input.phone) && phoneDigits(prospect.phone) === phoneDigits(input.phone);
  const exactEmail = emailKey(input.email) && emailKey(prospect.email) === emailKey(input.email);
  const matchReason = exactPhone ? "phone" : exactEmail ? "email" : prospect.company ? "company" : "name";
  return {
    source: "trevor",
    id: String(prospect.id),
    displayName: displayName(prospect),
    company: prospect.company,
    phone: prospect.phone,
    email: prospect.email,
    matchReason,
    confidence: exactPhone || exactEmail ? "exact" : "likely"
  };
}

function classifyMatches(matches: ProspectCandidate[], input: BuyerIntakeInput): {
  resolved: ProspectCandidate | null;
  review: BuyerIntakeDedupeMatch[];
  status: BuyerIntakeResult["dedupeStatus"];
} {
  if (input.prospectId) {
    const resolved = matches.find((candidate) => candidate.id === input.prospectId) ?? null;
    return { resolved, review: resolved ? [] : [], status: resolved ? "matched_existing" : "unique" };
  }

  const exact = matches.filter((candidate) =>
    (phoneDigits(input.phone) && phoneDigits(candidate.phone) === phoneDigits(input.phone)) ||
    (emailKey(input.email) && emailKey(candidate.email) === emailKey(input.email))
  );
  if (exact.length === 1) return { resolved: exact[0], review: [], status: "matched_existing" };
  if (exact.length > 1 || matches.length > 1) {
    return {
      resolved: null,
      review: matches.slice(0, MAX_DEDUPE_MATCHES).map((prospect) => toMatch(prospect, input)),
      status: "needs_review"
    };
  }
  if (matches.length === 1 && (clean(input.company, 200) || clean(input.name, 200))) {
    return { resolved: matches[0], review: [], status: "matched_existing" };
  }
  return { resolved: null, review: [], status: "unique" };
}

function agiledResult(prospect: ProspectCandidate | null, input: BuyerIntakeInput): BuyerIntakeResult["agiled"] {
  const requested = input.agiledSync ?? "not_attempted";
  if (requested === "not_attempted") return { status: "not_attempted", reference: null, message: "Agiled sync was not requested." };
  if (requested === "skip") return { status: "skipped", reference: null, message: "Agiled sync was skipped by request." };
  if (input.agiledSyncStatus === "failed") return { status: "failed", reference: null, message: "Agiled sync failed after local Trevor write." };
  const reference = input.agiledContactId ?? prospect?.agiledContactId ?? null;
  if (requested === "link_only") {
    return reference
      ? { status: "linked", reference, message: "Agiled contact is linked." }
      : { status: "skipped", reference: null, message: "No Agiled contact ID was available to link." };
  }
  return reference
    ? { status: input.agiledSyncStatus === "updated" ? "updated" : "linked", reference, message: "Agiled contact is linked for review." }
    : { status: input.agiledSyncStatus === "created" ? "created" : "skipped", reference: null, message: "No direct Agiled write was performed by this MCP tool." };
}

function emptyResult(status: BuyerIntakeResult["status"], input: BuyerIntakeInput, missing: string[] = []): BuyerIntakeResult {
  return {
    status,
    missingFields: missing,
    prospectId: input.prospectId ?? null,
    interactionId: null,
    callTaskId: null,
    followUpDraftId: null,
    dedupeStatus: status === "needs_review" ? "needs_review" : "unique",
    dedupeMatches: [],
    agiled: agiledResult(null, input),
    nextActions: [],
    warnings: [],
    outboundSent: false
  };
}

function prospectWrite(input: BuyerIntakeInput) {
  const nextActionAt = parseDate(input.nextActionAt);
  const doNotContact = input.outcome === "do_not_contact";
  return {
    name: clean(input.name, 200),
    company: clean(input.company, 200),
    email: clean(input.email, 200),
    phone: clean(input.phone, 80),
    status: statusForOutcome(input.outcome),
    notes: notesFor(input),
    agiledContactId: clean(input.agiledContactId, 120),
    preferredChannel: defaultPreferredChannel(input),
    doNotContact,
    lastOutcome: input.outcome ?? null,
    nextActionType: input.nextActionType && input.nextActionType !== "none" ? input.nextActionType : null,
    nextActionAt,
    priority: 1,
    leadSource: input.source
  };
}

async function maybeCreateCallTask(
  repo: QueueRepository,
  prospect: ProspectCandidate,
  input: BuyerIntakeInput
): Promise<{ action: BuyerIntakeNextActionResult | null; id: number | null }> {
  if (!input.createCallTask) return { action: null, id: null };
  if (prospect.doNotContact || input.outcome === "do_not_contact") {
    return { action: { type: "call_task", id: null, status: "blocked", reason: "Prospect is do-not-contact." }, id: null };
  }
  const nextActionAt = parseDate(input.nextActionAt);
  if (!nextActionAt) {
    return { action: { type: "call_task", id: null, status: "skipped", reason: "Valid next_action_at is required for call task creation." }, id: null };
  }
  const salesDay = nextActionAt.toISOString().slice(0, 10);
  const existing = await repo.findOpenCallTask(prospect.id, salesDay);
  if (existing) return { action: { type: "call_task", id: existing.id, status: "reused", reason: "Existing open call task for that day." }, id: existing.id };
  const created = await repo.createCallTask({
    prospectId: prospect.id,
    priority: Math.max(1, prospect.priority),
    reason: `Buyer intake next call from ${input.source}.`,
    callObjective: clean(input.conversationSummary, 240) ?? "Follow up on buyer intake.",
    dueAt: nextActionAt.toISOString()
  });
  return { action: { type: "call_task", id: created.id, status: "created", reason: null }, id: created.id };
}

async function maybeCreateDraft(
  repo: QueueRepository,
  prospect: ProspectCandidate,
  interactionId: number,
  input: BuyerIntakeInput
): Promise<{ action: BuyerIntakeNextActionResult | null; id: number | null }> {
  if (!input.createFollowUpDraft) return { action: null, id: null };
  if (prospect.doNotContact || input.outcome === "do_not_contact") {
    return { action: { type: "follow_up_draft", id: null, status: "blocked", reason: "Prospect is do-not-contact." }, id: null };
  }
  const channel: FollowUpChannel | null = prospect.email || input.email ? "email" : null;
  if (!channel) {
    return { action: { type: "follow_up_draft", id: null, status: "skipped", reason: "No usable email channel for draft." }, id: null };
  }
  const existing = await repo.findActiveFollowUpDraft(interactionId, channel);
  if (existing) return { action: { type: "follow_up_draft", id: existing.id, status: "reused", reason: "Existing draft for intake interaction." }, id: existing.id };
  const draft = await repo.createFollowUpDraft({
    prospectId: prospect.id,
    interactionId,
    channel,
    subject: prospect.company ? `Following up on ${prospect.company}` : "Following up from our conversation",
    body: [
      `Draft only. Do not send until Mitchel approves.`,
      clean(input.conversationSummary, 700) ?? "Following up from our recent conversation.",
      clean(input.preferences, 300) ? `Buyer preferences: ${clean(input.preferences, 300)}` : null
    ].filter(Boolean).join("\n\n")
  });
  return { action: { type: "follow_up_draft", id: draft.id, status: "created", reason: null }, id: draft.id };
}

async function resultAfterRecordWrite(
  repo: QueueRepository,
  prospect: ProspectCandidate,
  interactionId: number,
  input: BuyerIntakeInput,
  status: "created" | "updated",
  dedupeStatus: BuyerIntakeResult["dedupeStatus"]
): Promise<BuyerIntakeResult> {
  const nextActions: BuyerIntakeNextActionResult[] = [];
  const callTask = await maybeCreateCallTask(repo, prospect, input);
  if (callTask.action) nextActions.push(callTask.action);
  const draft = await maybeCreateDraft(repo, prospect, interactionId, input);
  if (draft.action) nextActions.push(draft.action);
  const agiled = agiledResult(prospect, input);
  return {
    status,
    missingFields: [],
    prospectId: prospect.id,
    interactionId,
    callTaskId: callTask.id,
    followUpDraftId: draft.id,
    dedupeStatus,
    dedupeMatches: [],
    agiled,
    nextActions,
    warnings: agiled.status === "failed" ? [agiled.message ?? "Agiled sync failed."] : [],
    outboundSent: false
  };
}

export async function captureBuyerIntake(repo: QueueRepository, input: BuyerIntakeInput): Promise<BuyerIntakeResult> {
  const missing = missingFields(input);
  if (missing.length) return emptyResult("rejected", input, missing);

  const known = input.prospectId ? await repo.findProspectById(input.prospectId) : null;
  if (input.prospectId && !known) return emptyResult("rejected", input, ["valid_prospect_id"]);

  const matches = known
    ? [known]
    : await repo.findBuyerIntakeMatches({
        name: clean(input.name, 200),
        company: clean(input.company, 200),
        phone: clean(input.phone, 80),
        email: clean(input.email, 200),
        limit: MAX_DEDUPE_MATCHES
      });
  const dedupe = classifyMatches(matches, input);
  if (dedupe.status === "needs_review") {
    return {
      ...emptyResult("needs_review", input),
      prospectId: null,
      dedupeStatus: "needs_review",
      dedupeMatches: dedupe.review,
      warnings: ["Multiple possible Trevor matches require operator review."]
    };
  }

  if (input.intakeMode === "validate_only") {
    return {
      ...emptyResult("validation_only", input),
      prospectId: dedupe.resolved?.id ?? null,
      dedupeStatus: dedupe.status,
      agiled: agiledResult(dedupe.resolved, input)
    };
  }

  const write = prospectWrite(input);
  const existing = dedupe.resolved;
  if (existing) {
    const update: BuyerIntakeProspectUpdate = {
      name: write.name,
      company: write.company,
      email: write.email,
      phone: write.phone,
      status: write.status,
      notes: write.notes,
      agiledContactId: write.agiledContactId,
      preferredChannel: write.preferredChannel,
      doNotContact: write.doNotContact ? true : undefined,
      lastOutcome: write.lastOutcome,
      nextActionType: write.nextActionType,
      nextActionAt: write.nextActionAt,
      leadSource: write.leadSource
    };
    const written = await repo.captureBuyerIntakeRecord({
      prospectId: existing.id,
      createProspect: null,
      updateProspect: update,
      interaction: {
        channel: input.conversationChannel ?? defaultPreferredChannel(input),
        direction: input.source === "phone_call" ? "inbound" : "internal",
        summary: summaryFor(input),
        occurredAt: new Date()
      }
    });
    return resultAfterRecordWrite(repo, written.prospect, written.interaction.id, input, "updated", "matched_existing");
  }

  const written = await repo.captureBuyerIntakeRecord({
    prospectId: null,
    createProspect: write,
    updateProspect: null,
    interaction: {
      channel: input.conversationChannel ?? defaultPreferredChannel(input),
      direction: input.source === "phone_call" ? "inbound" : "internal",
      summary: summaryFor(input),
      occurredAt: new Date()
    }
  });
  return resultAfterRecordWrite(repo, written.prospect, written.interaction.id, input, "created", "unique");
}

export function buyerIntakeToMcp(result: BuyerIntakeResult) {
  return {
    status: result.status,
    missing_fields: result.missingFields,
    prospect_id: result.prospectId,
    interaction_id: result.interactionId,
    call_task_id: result.callTaskId,
    follow_up_draft_id: result.followUpDraftId,
    dedupe_status: result.dedupeStatus,
    dedupe_matches: result.dedupeMatches.map((match) => ({
      source: match.source,
      id: match.id,
      display_name: match.displayName,
      company: match.company,
      phone: match.phone,
      email: match.email,
      match_reason: match.matchReason,
      confidence: match.confidence
    })),
    agiled: result.agiled,
    next_actions: result.nextActions,
    warnings: result.warnings,
    outbound_sent: false
  };
}
