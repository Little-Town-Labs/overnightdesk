import { isHermesMitchelTenant } from "@/lib/instance";
import { mitchelProspectingSummarySchema } from "../schemas";
import { createUnavailableMitchelProspectingSummary, countSection } from "../summary";

jest.mock("@/db", () => ({
  db: {},
}));

jest.mock("@/db/schema", () => ({
  instance: {},
  fleetEvent: {},
}));

describe("Mitchel prospecting summary helpers", () => {
  it("identifies only the explicit hermes-mitchel tenant", () => {
    expect(isHermesMitchelTenant({ tenantId: "hermes-mitchel", containerId: "hermes-mitchel" })).toBe(true);
    expect(isHermesMitchelTenant({ tenantId: "alice", containerId: "hermes-alice" })).toBe(false);
    expect(isHermesMitchelTenant({ tenantId: "hermes-mitchel", containerId: null })).toBe(true);
    expect(isHermesMitchelTenant(null)).toBe(false);
  });

  it("creates a fail-closed unavailable summary with no outbound side effects", () => {
    const summary = createUnavailableMitchelProspectingSummary("Trevor summary unavailable.");

    expect(summary.tenantId).toBe("hermes-mitchel");
    expect(summary.prospects).toEqual([]);
    expect(summary.stagedCandidates).toEqual([]);
    expect(summary.callTasks).toEqual([]);
    expect(summary.reviewItems).toEqual([]);
    expect(summary.followUpDrafts).toEqual([]);
    expect(summary.outboundSent).toBe(false);
    expect(summary.sections.prospects.status).toBe("unavailable");
    expect(summary.warnings).toContain("Trevor summary unavailable.");
  });

  it("marks zero-count sections as honest empty states", () => {
    expect(countSection(0, "call tasks")).toMatchObject({
      status: "empty",
      count: 0,
      message: "No call tasks.",
    });
    expect(countSection(3, "staged candidates")).toMatchObject({
      status: "ok",
      count: 3,
      message: "3 staged candidates.",
    });
  });

  it("accepts Postgres timestamp offsets from the live provisioner summary", () => {
    const summary = createUnavailableMitchelProspectingSummary("Trevor summary unavailable.");
    const postgresTimestamp = "2026-06-25T11:58:59.291722+00:00";

    expect(
      mitchelProspectingSummarySchema.safeParse({
        ...summary,
        generatedAt: postgresTimestamp,
        sections: {
          ...summary.sections,
          prospects: {
            ...summary.sections.prospects,
            lastUpdatedAt: postgresTimestamp,
          },
        },
      }).success
    ).toBe(true);
  });
});
