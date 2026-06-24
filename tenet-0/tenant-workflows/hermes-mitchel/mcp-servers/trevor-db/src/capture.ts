import type {
  AgiledNoteStatus,
  PostCallCaptureInput,
  PostCallCaptureResult,
  PostCallOutcome,
  ProspectCandidate,
  QueueRepository
} from "./types.js";

const SUMMARY_REQUIRED = new Set<PostCallOutcome>(["interested", "quoted", "sold", "do_not_contact"]);
const VALID_OUTCOMES = new Set<PostCallOutcome>([
  "no_answer",
  "left_voicemail",
  "interested",
  "quoted",
  "follow_up_later",
  "not_interested",
  "sold",
  "wrong_number",
  "do_not_contact"
]);

function emptyResult(status: PostCallCaptureResult["status"], input: PostCallCaptureInput): PostCallCaptureResult {
  return {
    status,
    missingFields: [],
    interactionId: null,
    prospectId: input.prospectId ?? null,
    taskId: input.taskId ?? null,
    prospectUpdates: [],
    taskStatus: null,
    agiledNote: { status: "not_requested", reference: null, message: null },
    warnings: [],
    outboundSent: false
  };
}

function compactSummary(input: PostCallCaptureInput): string {
  const raw = input.summary?.trim();
  if (raw) return raw.length > 2000 ? `${raw.slice(0, 1997)}...` : raw;
  const outcome = input.outcome?.replaceAll("_", " ") ?? "call";
  return `Call outcome: ${outcome}.`;
}

function missingFields(input: PostCallCaptureInput): string[] {
  const missing: string[] = [];
  const targetCount = [input.taskId, input.prospectId].filter((value) => value !== undefined).length;
  if (targetCount !== 1) missing.push("task_id_or_prospect_id");
  if (!input.outcome) {
    missing.push("outcome");
  } else if (!VALID_OUTCOMES.has(input.outcome)) {
    missing.push("valid_outcome");
  }
  if (input.outcome && SUMMARY_REQUIRED.has(input.outcome) && !input.summary?.trim()) {
    missing.push("summary");
  }
  if (input.nextActionType && input.nextActionType !== "none" && !input.nextActionAt) {
    missing.push("next_action_at");
  }
  if (input.nextActionAt && Number.isNaN(new Date(input.nextActionAt).getTime())) {
    missing.push("valid_next_action_at");
  }
  return missing;
}

function defaultNextActionType(outcome: PostCallOutcome, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit.trim() || null;
  if (outcome === "no_answer" || outcome === "left_voicemail") return "call";
  if (outcome === "interested" || outcome === "quoted" || outcome === "follow_up_later") return "follow_up";
  return null;
}

function parseNextActionAt(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function agiledStatus(prospect: ProspectCandidate, input: PostCallCaptureInput): PostCallCaptureResult["agiledNote"] {
  if (input.agiledNote === false) {
    return { status: "not_requested", reference: null, message: "Agiled note was not requested." };
  }
  if (!prospect.agiledContactId) {
    return { status: "skipped", reference: null, message: "No Agiled contact link is available for this prospect." };
  }
  const status: AgiledNoteStatus = input.agiledNoteStatus ?? "skipped";
  if (status === "failed") {
    return { status, reference: null, message: "Agiled note creation failed after local capture." };
  }
  if (status === "created") {
    return { status, reference: prospect.agiledContactId, message: "Agiled note was created." };
  }
  return {
    status: "skipped",
    reference: null,
    message: "Agiled contact is linked, but this MCP tool does not send CRM writes directly."
  };
}

export async function capturePostCall(repo: QueueRepository, input: PostCallCaptureInput): Promise<PostCallCaptureResult> {
  const missing = missingFields(input);
  if (missing.length) {
    const result = emptyResult("needs_input", input);
    result.missingFields = missing;
    return result;
  }

  const task = input.taskId ? await repo.findCallTaskById(input.taskId) : null;
  if (input.taskId && !task) return emptyResult("not_found", input);
  if (task?.status === "completed") return emptyResult("duplicate", { ...input, prospectId: task.prospectId });

  const prospectId = task?.prospectId ?? input.prospectId;
  const prospect = prospectId ? await repo.findProspectById(prospectId) : null;
  if (!prospect || !input.outcome) return emptyResult("not_found", input);

  const local = await repo.capturePostCall({
    prospectId: prospect.id,
    taskId: task?.id ?? null,
    outcome: input.outcome,
    summary: compactSummary(input),
    nextActionType: defaultNextActionType(input.outcome, input.nextActionType),
    nextActionAt: parseNextActionAt(input.nextActionAt)
  });

  const agiledNote = agiledStatus(prospect, input);
  const warnings = agiledNote.status === "failed" ? [agiledNote.message ?? "Agiled note creation failed."] : [];

  return {
    status: "captured",
    missingFields: [],
    interactionId: local.interactionId,
    prospectId: local.prospectId,
    taskId: local.taskId,
    prospectUpdates: local.prospectUpdates,
    taskStatus: local.taskStatus,
    agiledNote,
    warnings,
    outboundSent: false
  };
}

export function postCallCaptureToMcp(result: PostCallCaptureResult) {
  return {
    status: result.status,
    missing_fields: result.missingFields,
    interaction_id: result.interactionId,
    prospect_id: result.prospectId,
    task_id: result.taskId,
    prospect_updates: result.prospectUpdates,
    task_status: result.taskStatus,
    agiled_note: result.agiledNote,
    warnings: result.warnings,
    outbound_sent: result.outboundSent
  };
}
