import {
  executeDashboardInstanceReconciliation,
  type DashboardInstanceReconciliationGateway,
} from "@/db/dashboard-instance-reconciliation-store";
import type {
  DashboardInstanceDescriptor,
  DashboardInstanceReconciliationSnapshot,
} from "@/lib/dashboard-instance-reconciliation";

jest.mock("@/db", () => ({ db: {} }));

const descriptor: DashboardInstanceDescriptor = {
  tenantId: "titus-dashboard",
  hostname: "titus-dashboard.overnightdesk.com",
  containerId: "hermes-titus",
};

const current = new Date("2026-07-22T12:00:00.000Z");

function snapshot(
  overrides: Partial<DashboardInstanceReconciliationSnapshot> = {},
): DashboardInstanceReconciliationSnapshot {
  return {
    schemaReady: true,
    privateRuntimeQualified: true,
    identities: [{ useCaseId: "use-case-titus", runtimeIdentityId: "runtime-titus" }],
    memberships: [
      {
        useCaseId: "use-case-titus",
        runtimeIdentityId: "runtime-titus",
        userId: "owner-titus",
        role: "owner",
        status: "active",
        expiresAt: null,
        suspendedAt: null,
        revokedAt: null,
      },
    ],
    platformBindings: [
      {
        useCaseId: "use-case-titus",
        runtimeIdentityId: "runtime-titus",
        provider: "overnightdesk",
        kind: "platform_instance",
        value: descriptor.tenantId,
        state: "active",
      },
    ],
    hostnameBindings: [
      {
        useCaseId: "use-case-titus",
        runtimeIdentityId: "runtime-titus",
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
    id: "instance-titus",
    userId: "owner-titus",
    tenantId: descriptor.tenantId,
    useCaseId: "use-case-titus",
    runtimeIdentityId: "runtime-titus",
    status: "running",
    containerId: descriptor.containerId,
    subdomain: descriptor.hostname,
    dashboardTokenHash: null,
    engineApiKey: null,
    phaseServiceToken: null,
  };
}

function gateway(
  inspections: DashboardInstanceReconciliationSnapshot[],
): DashboardInstanceReconciliationGateway & {
  inspect: jest.Mock;
  apply: jest.Mock;
} {
  return {
    inspect: jest.fn().mockImplementation(async () => {
      const next = inspections.shift();
      if (!next) throw new Error("unexpected inspection");
      return next;
    }),
    apply: jest.fn().mockResolvedValue(undefined),
  };
}

describe("dashboard instance reconciliation store", () => {
  it("plans without applying or exposing assignment values", async () => {
    const store = gateway([snapshot()]);

    const result = await executeDashboardInstanceReconciliation(
      "plan",
      descriptor,
      { now: current },
      store,
    );

    expect(result).toEqual({ status: "ready", assignmentsToCreate: 1 });
    expect(store.apply).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(descriptor.hostname);
  });

  it("applies once with explicit confirmation and verifies a fresh snapshot", async () => {
    const store = gateway([
      snapshot(),
      snapshot({ candidates: [exactCandidate()] }),
    ]);

    await expect(
      executeDashboardInstanceReconciliation(
        "apply",
        descriptor,
        {
          actor: "deployment-operator",
          confirmation: "APPLY_CANONICAL_DASHBOARD_ASSIGNMENT",
          now: current,
        },
        store,
      ),
    ).resolves.toEqual({ status: "verified_noop", assignmentsVerified: 1 });
    expect(store.apply).toHaveBeenCalledTimes(1);
    expect(store.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        tenantId: descriptor.tenantId,
        hostname: descriptor.hostname,
        containerId: descriptor.containerId,
      }),
      "deployment-operator",
    );
    expect(store.inspect).toHaveBeenCalledTimes(2);
  });

  it("treats an existing exact projection as an idempotent no-op", async () => {
    const store = gateway([snapshot({ candidates: [exactCandidate()] })]);

    await expect(
      executeDashboardInstanceReconciliation(
        "apply",
        descriptor,
        { now: current },
        store,
      ),
    ).resolves.toEqual({ status: "verified_noop", assignmentsVerified: 1 });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it("allows a concurrent exact winner to converge after a guarded no-write", async () => {
    const store = gateway([
      snapshot(),
      snapshot({ candidates: [exactCandidate()] }),
    ]);
    store.apply.mockResolvedValue(undefined);

    await expect(
      executeDashboardInstanceReconciliation(
        "apply",
        descriptor,
        {
          actor: "deployment-operator",
          confirmation: "APPLY_CANONICAL_DASHBOARD_ASSIGNMENT",
          now: current,
        },
        store,
      ),
    ).resolves.toEqual({ status: "verified_noop", assignmentsVerified: 1 });
  });

  it("refuses blocked, unconfirmed, and post-write conflicting states", async () => {
    const blocked = gateway([snapshot({ privateRuntimeQualified: false })]);
    await expect(
      executeDashboardInstanceReconciliation(
        "apply",
        descriptor,
        {
          actor: "deployment-operator",
          confirmation: "APPLY_CANONICAL_DASHBOARD_ASSIGNMENT",
          now: current,
        },
        blocked,
      ),
    ).rejects.toThrow("Dashboard assignment is blocked");

    const unconfirmed = gateway([snapshot()]);
    await expect(
      executeDashboardInstanceReconciliation(
        "apply",
        descriptor,
        { actor: "deployment-operator", now: current },
        unconfirmed,
      ),
    ).rejects.toThrow("Dashboard assignment confirmation is required");

    const conflicting = gateway([
      snapshot(),
      snapshot({
        candidates: [{ ...exactCandidate(), userId: "different-owner" }],
      }),
    ]);
    await expect(
      executeDashboardInstanceReconciliation(
        "apply",
        descriptor,
        {
          actor: "deployment-operator",
          confirmation: "APPLY_CANONICAL_DASHBOARD_ASSIGNMENT",
          now: current,
        },
        conflicting,
      ),
    ).rejects.toThrow("Dashboard assignment did not verify");
  });

  it("requires exact verification and emits only bounded failures", async () => {
    const ready = gateway([snapshot()]);
    await expect(
      executeDashboardInstanceReconciliation(
        "verify",
        descriptor,
        { now: current },
        ready,
      ),
    ).rejects.toThrow("Dashboard assignment is not verified");

    const secret = "database-secret-value";
    const failed = gateway([]);
    failed.inspect.mockRejectedValue(new Error(secret));
    await expect(
      executeDashboardInstanceReconciliation(
        "plan",
        descriptor,
        { now: current },
        failed,
      ),
    ).rejects.not.toThrow(secret);
  });
});
