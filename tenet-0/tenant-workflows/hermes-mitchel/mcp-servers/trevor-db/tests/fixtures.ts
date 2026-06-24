import type { ExistingCallTask, ProspectCandidate } from "../src/types.js";

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
