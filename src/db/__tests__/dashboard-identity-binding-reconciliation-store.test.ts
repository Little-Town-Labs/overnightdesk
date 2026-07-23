import {
  executeDashboardIdentityBindingReconciliation,
  type DashboardIdentityBindingReconciliationGateway,
} from "@/db/dashboard-identity-binding-reconciliation-store";
import type {
  DashboardIdentityBindingDescriptor,
  DashboardIdentityBindingSnapshot,
} from "@/lib/dashboard-identity-binding-reconciliation";

jest.mock("@/db", () => ({ db: {} }));

const useCaseId = "11111111-1111-4111-8111-111111111111";
const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";
const descriptors: DashboardIdentityBindingDescriptor[] = [
  {
    provider: "overnightdesk",
    kind: "platform_instance",
    value: "titus-dashboard",
    state: "active",
  },
  {
    provider: "nginx",
    kind: "hostname",
    value: "titus-dashboard.overnightdesk.com",
    state: "active",
  },
];

function snapshot(
  overrides: Partial<DashboardIdentityBindingSnapshot> = {},
): DashboardIdentityBindingSnapshot {
  return {
    schemaReady: true,
    identities: [{ useCaseId, runtimeIdentityId }],
    bindings: [],
    ...overrides,
  };
}

function exactBindings(): DashboardIdentityBindingSnapshot["bindings"] {
  return descriptors.map((descriptor, index) => ({
    id: `binding-${index}`,
    useCaseId,
    runtimeIdentityId,
    ...descriptor,
  }));
}

function gateway(
  inspections: DashboardIdentityBindingSnapshot[],
): DashboardIdentityBindingReconciliationGateway & {
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

describe("dashboard identity binding reconciliation store", () => {
  it("plans without applying or exposing binding values", async () => {
    const store = gateway([snapshot()]);

    const result = await executeDashboardIdentityBindingReconciliation(
      "plan",
      descriptors,
      {},
      store,
    );

    expect(result).toEqual({ status: "ready", bindingsToCreate: 2 });
    expect(store.apply).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(descriptors[1].value);
  });

  it("applies with explicit confirmation and verifies a fresh snapshot", async () => {
    const store = gateway([
      snapshot(),
      snapshot({ bindings: exactBindings() }),
    ]);

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {
          actor: "operator:feature-024",
          confirmation: "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
          privateRuntimeQualified: true,
        },
        store,
      ),
    ).resolves.toEqual({ status: "verified_noop", bindingsVerified: 2 });
    expect(store.apply).toHaveBeenCalledTimes(1);
    expect(store.apply).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready", bindings: descriptors }),
      "operator:feature-024",
    );
    expect(store.inspect).toHaveBeenCalledTimes(2);
  });

  it("treats exact existing bindings as an idempotent no-op", async () => {
    const store = gateway([snapshot({ bindings: exactBindings() })]);

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {},
        store,
      ),
    ).resolves.toEqual({ status: "verified_noop", bindingsVerified: 2 });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it("converges when a concurrent exact writer wins", async () => {
    const store = gateway([
      snapshot(),
      snapshot({ bindings: exactBindings() }),
    ]);
    store.apply.mockRejectedValue(new Error("unique conflict"));

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {
          actor: "operator:feature-024",
          confirmation: "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
          privateRuntimeQualified: true,
        },
        store,
      ),
    ).resolves.toEqual({ status: "verified_noop", bindingsVerified: 2 });
  });

  it("refuses blocked, unconfirmed, actorless, and unverifiable states", async () => {
    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {
          actor: "operator:feature-024",
          confirmation: "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
          privateRuntimeQualified: true,
        },
        gateway([snapshot({ schemaReady: false })]),
      ),
    ).rejects.toThrow("Dashboard identity binding reconciliation is blocked");

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        { actor: "operator:feature-024" },
        gateway([snapshot()]),
      ),
    ).rejects.toThrow("Dashboard identity binding confirmation is required");

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {
          confirmation: "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
          privateRuntimeQualified: true,
        },
        gateway([snapshot()]),
      ),
    ).rejects.toThrow("Dashboard identity binding actor is required");

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {
          actor: "operator:feature-024",
          confirmation: "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
          privateRuntimeQualified: false,
        },
        gateway([snapshot()]),
      ),
    ).rejects.toThrow("Private Titus dashboard runtime is not qualified");

    await expect(
      executeDashboardIdentityBindingReconciliation(
        "apply",
        descriptors,
        {
          actor: "operator:feature-024",
          confirmation: "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
          privateRuntimeQualified: true,
        },
        gateway([snapshot(), snapshot()]),
      ),
    ).rejects.toThrow(
      "Dashboard identity binding reconciliation did not verify",
    );
  });

  it("requires exact verification and emits only bounded failures", async () => {
    await expect(
      executeDashboardIdentityBindingReconciliation(
        "verify",
        descriptors,
        {},
        gateway([snapshot()]),
      ),
    ).rejects.toThrow("Dashboard identity bindings are not verified");

    const secret = "database-secret-value";
    const failed = gateway([]);
    failed.inspect.mockRejectedValue(new Error(secret));
    await expect(
      executeDashboardIdentityBindingReconciliation(
        "plan",
        descriptors,
        {},
        failed,
      ),
    ).rejects.toThrow("Dashboard identity binding inspection failed");
    await expect(
      executeDashboardIdentityBindingReconciliation(
        "plan",
        descriptors,
        {},
        failed,
      ),
    ).rejects.not.toThrow(secret);
  });
});
