import type { ExistingCallTask, FollowUpDraftRecord, ProspectCandidate, ProspectInteraction } from "../src/types.js";

export function prospect(overrides: Partial<ProspectCandidate>): ProspectCandidate {
  return {
    id: 1,
    name: "Default Buyer",
    company: "Default Co",
    email: "buyer@example.test",
    phone: "555-0100",
    status: "active",
    notes: "Prefers GIA round stones.",
    agiledContactId: "agiled-1",
    preferredChannel: "phone",
    doNotContact: false,
    lastOutcome: null,
    nextActionType: "call",
    nextActionAt: new Date("2026-06-24T14:00:00Z"),
    priority: 1,
    updatedAt: new Date("2026-06-23T14:00:00Z"),
    lastInteractionAt: null,
    ...overrides
  };
}

export function task(overrides: Partial<ExistingCallTask>): ExistingCallTask {
  return {
    id: 100,
    prospectId: 1,
    status: "open",
    dueAt: new Date("2026-06-24T15:00:00Z"),
    ...overrides
  };
}

export function interaction(overrides: Partial<ProspectInteraction>): ProspectInteraction {
  return {
    id: 1,
    prospectId: 1,
    channel: "phone",
    direction: "outbound",
    summary: "Discussed ideal GIA round stone and asked to follow up next week.",
    occurredAt: new Date("2026-06-20T16:00:00Z"),
    ...overrides
  };
}

export function draft(overrides: Partial<FollowUpDraftRecord>): FollowUpDraftRecord {
  return {
    id: 1,
    prospectId: 1,
    interactionId: 1,
    channel: "email",
    subject: "Following up from our call",
    body: "Thanks for taking the time to speak today.",
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    sentAt: null,
    sentBy: null,
    sentVia: null,
    externalMessageId: null,
    auditOnlyReason: null,
    sentInteractionId: null,
    createdAt: new Date("2026-06-24T18:00:00Z"),
    updatedAt: new Date("2026-06-24T18:00:00Z"),
    ...overrides
  };
}
