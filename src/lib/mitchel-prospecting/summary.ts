import type { MitchelProspectingSummary, SectionStatus } from "./types";

function unavailableSection(message: string): SectionStatus {
  return {
    status: "unavailable",
    count: 0,
    message,
    lastUpdatedAt: null,
  };
}

export function createUnavailableMitchelProspectingSummary(
  message = "Trevor prospecting data is not available right now."
): MitchelProspectingSummary {
  return {
    tenantId: "hermes-mitchel",
    generatedAt: new Date().toISOString(),
    sections: {
      prospects: unavailableSection(message),
      stagedCandidates: unavailableSection(message),
      callTasks: unavailableSection(message),
      reviewItems: unavailableSection(message),
      followUpDrafts: unavailableSection(message),
    },
    prospects: [],
    stagedCandidates: [],
    callTasks: [],
    reviewItems: [],
    followUpDrafts: [],
    warnings: [message],
    outboundSent: false,
  };
}

export function countSection(count: number, label: string): SectionStatus {
  return {
    status: count === 0 ? "empty" : "ok",
    count,
    message: count === 0 ? `No ${label}.` : `${count} ${label}.`,
    lastUpdatedAt: new Date().toISOString(),
  };
}
