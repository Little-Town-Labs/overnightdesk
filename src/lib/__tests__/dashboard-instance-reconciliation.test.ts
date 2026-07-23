import {
  planDashboardInstanceReconciliation,
  requireDashboardAssignmentConfirmation,
  summarizeDashboardInstanceReconciliation,
  type DashboardInstanceDescriptor,
  type DashboardInstanceReconciliationSnapshot,
} from "@/lib/dashboard-instance-reconciliation";

const now = new Date("2026-07-23T02:00:00.000Z");
const useCaseId = "11111111-1111-4111-8111-111111111111";
const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const descriptor: DashboardInstanceDescriptor = {
  tenantId: "titus-dashboard",
  hostname: "titus-dashboard.overnightdesk.com",
  containerId: "hermes-titus",
};

function snapshot(
  overrides: Partial<DashboardInstanceReconciliationSnapshot> = {},
): DashboardInstanceReconciliationSnapshot {
  return {
    schemaReady: true,
    privateRuntimeQualified: true,
    identities: [{ useCaseId, runtimeIdentityId }],
    memberships: [
      {
        useCaseId,
        runtimeIdentityId,
        userId: "owner-1",
        role: "owner",
        status: "active",
        expiresAt: null,
        suspendedAt: null,
        revokedAt: null,
      },
    ],
    platformBindings: [
      {
        useCaseId,
        runtimeIdentityId,
        provider: "overnightdesk",
        kind: "platform_instance",
        value: descriptor.tenantId,
        state: "active",
      },
    ],
    hostnameBindings: [
      {
        useCaseId,
        runtimeIdentityId,
        provider: "nginx",
        kind: "hostname",
        value: descriptor.hostname,
        state: "active",
      },
    ],
    candidates: [],
    ...overrides,
  };
}

function exactCandidate() {
  return {
    id: "dashboard-instance-1",
    userId: "owner-1",
    tenantId: descriptor.tenantId,
    useCaseId,
    runtimeIdentityId,
    status: "running",
    containerId: descriptor.containerId,
    subdomain: descriptor.hostname,
    dashboardTokenHash: null,
    engineApiKey: null,
    phaseServiceToken: null,
  };
}

describe("canonical dashboard instance reconciliation", () => {
  it("plans exactly one additive projection from fixed canonical data", () => {
    expect(
      planDashboardInstanceReconciliation(snapshot(), descriptor, { now }),
    ).toEqual({
      status: "ready",
      ownerId: "owner-1",
      useCaseId,
      runtimeIdentityId,
      tenantId: descriptor.tenantId,
      hostname: descriptor.hostname,
      containerId: descriptor.containerId,
    });
  });

  it("is an idempotent verified no-op for the exact existing projection", () => {
    expect(
      planDashboardInstanceReconciliation(
        snapshot({ candidates: [exactCandidate()] }),
        descriptor,
        { now },
      ),
    ).toEqual({
      status: "verified_noop",
      instanceId: "dashboard-instance-1",
      useCaseId,
      runtimeIdentityId,
    });
  });

  it.each([
    ["missing schema", { schemaReady: false }],
    ["unqualified private runtime", { privateRuntimeQualified: false }],
    ["missing identity", { identities: [] }],
    [
      "ambiguous identity",
      {
        identities: [
          { useCaseId, runtimeIdentityId },
          {
            useCaseId: "33333333-3333-4333-8333-333333333333",
            runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
          },
        ],
      },
    ],
    ["missing owner", { memberships: [] }],
    [
      "ambiguous owner",
      {
        memberships: [
          ...snapshot().memberships,
          { ...snapshot().memberships[0], userId: "owner-2" },
        ],
      },
    ],
    ["missing platform binding", { platformBindings: [] }],
    ["missing hostname binding", { hostnameBindings: [] }],
  ])("blocks %s", (_label, overrides) => {
    expect(
      planDashboardInstanceReconciliation(snapshot(overrides), descriptor, {
        now,
      }).status,
    ).toBe("blocked");
  });

  it("rejects expired, suspended, revoked, inactive, and non-owner membership", () => {
    for (const membership of [
      { expiresAt: new Date("2026-07-23T01:59:59.000Z") },
      { suspendedAt: new Date("2026-07-23T01:00:00.000Z") },
      { revokedAt: new Date("2026-07-23T01:00:00.000Z") },
      { status: "suspended" },
      { role: "member" },
      {
        runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
      },
    ]) {
      const current = snapshot();
      current.memberships[0] = {
        ...current.memberships[0],
        ...membership,
      };
      expect(
        planDashboardInstanceReconciliation(current, descriptor, { now }).status,
      ).toBe("blocked");
    }
  });

  it("rejects copied or conflicting bindings", () => {
    for (const override of [
      {
        platformBindings: [
          {
            ...snapshot().platformBindings[0],
            runtimeIdentityId:
              "44444444-4444-4444-8444-444444444444",
          },
        ],
      },
      {
        hostnameBindings: [
          {
            ...snapshot().hostnameBindings[0],
            value: "walter-dashboard.overnightdesk.com",
          },
        ],
      },
      {
        hostnameBindings: [
          snapshot().hostnameBindings[0],
          { ...snapshot().hostnameBindings[0] },
        ],
      },
    ]) {
      expect(
        planDashboardInstanceReconciliation(snapshot(override), descriptor, {
          now,
        }).status,
      ).toBe("blocked");
    }
  });

  it("rejects conflicting or secret-bearing candidate projections", () => {
    for (const candidateOverride of [
      { userId: "other-owner" },
      { tenantId: "walter-dashboard" },
      { useCaseId: "33333333-3333-4333-8333-333333333333" },
      {
        runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
      },
      { status: "stopped" },
      { containerId: "hermes-walter" },
      { subdomain: "aegis-prod.overnightdesk.com" },
      { dashboardTokenHash: "unexpected" },
      { engineApiKey: "unexpected" },
      { phaseServiceToken: "unexpected" },
    ]) {
      const current = snapshot({
        candidates: [{ ...exactCandidate(), ...candidateOverride }],
      });
      expect(
        planDashboardInstanceReconciliation(current, descriptor, { now }).status,
      ).toBe("blocked");
    }
  });

  it("rejects ambiguous candidates and converges an exact concurrent winner", () => {
    expect(
      planDashboardInstanceReconciliation(
        snapshot({
          candidates: [
            exactCandidate(),
            { ...exactCandidate(), id: "dashboard-instance-2" },
          ],
        }),
        descriptor,
        { now },
      ).status,
    ).toBe("blocked");

    expect(
      planDashboardInstanceReconciliation(
        snapshot({ candidates: [exactCandidate()] }),
        descriptor,
        { now },
      ).status,
    ).toBe("verified_noop");
  });

  it.each([
    { ...descriptor, tenantId: "Titus Dashboard" },
    { ...descriptor, hostname: "TITUS-DASHBOARD.overnightdesk.com" },
    { ...descriptor, hostname: "titus-dashboard.example.com" },
    { ...descriptor, containerId: "hermes/titus" },
  ])("blocks an invalid fixed descriptor %#", (invalidDescriptor) => {
    expect(
      planDashboardInstanceReconciliation(snapshot(), invalidDescriptor, {
        now,
      }).status,
    ).toBe("blocked");
  });

  it("requires the exact explicit apply confirmation", () => {
    expect(() => requireDashboardAssignmentConfirmation(undefined)).toThrow(
      "Dashboard assignment confirmation is required",
    );
    expect(() => requireDashboardAssignmentConfirmation("yes")).toThrow(
      "Dashboard assignment confirmation is required",
    );
    expect(() =>
      requireDashboardAssignmentConfirmation(
        "APPLY_CANONICAL_DASHBOARD_ASSIGNMENT",
      ),
    ).not.toThrow();
  });

  it("summarizes plans without IDs, hostnames, owners, or runtime values", () => {
    const plan = planDashboardInstanceReconciliation(snapshot(), descriptor, {
      now,
    });
    const summary = summarizeDashboardInstanceReconciliation(plan);

    expect(summary).toEqual({ status: "ready", assignmentsToCreate: 1 });
    const serialized = JSON.stringify(summary);
    for (const value of [
      "owner-1",
      useCaseId,
      runtimeIdentityId,
      descriptor.tenantId,
      descriptor.hostname,
      descriptor.containerId,
    ]) {
      expect(serialized).not.toContain(value);
    }
  });
});
