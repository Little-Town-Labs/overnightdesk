jest.mock("@/db", () => ({ db: {} }));

import {
  executeDashboardOidcBindingReconciliation,
  planDashboardOidcBinding,
  type DashboardOidcBindingReconciliationGateway,
  type DashboardOidcBindingSnapshot,
} from "@/db/dashboard-oidc-binding-store";

describe("dashboard OIDC runtime binding planner", () => {
  const canonical: DashboardOidcBindingSnapshot = {
    instances: [
      {
        id: "instance-1",
        linkedClientId: "client-1",
        useCaseId: "00000000-0000-4000-8000-000000000002",
        runtimeIdentityId: "00000000-0000-4000-8000-000000000012",
      },
    ],
    bindings: [],
  };

  it("plans one runtime-scoped rollback binding for a disabled linked client", () => {
    expect(planDashboardOidcBinding(canonical, "client-1", "rollback")).toEqual({
      status: "insert",
      useCaseId: canonical.instances[0].useCaseId,
      runtimeIdentityId: canonical.instances[0].runtimeIdentityId,
      state: "rollback",
    });
  });

  it("moves only the exact runtime-scoped binding to active", () => {
    expect(
      planDashboardOidcBinding(
        {
          ...canonical,
          bindings: [
            {
              id: "binding-1",
              useCaseId: canonical.instances[0].useCaseId!,
              runtimeIdentityId: canonical.instances[0].runtimeIdentityId,
              value: "client-1",
              state: "rollback",
            },
          ],
        },
        "client-1",
        "active",
      ),
    ).toEqual({
      status: "update",
      bindingId: "binding-1",
      useCaseId: canonical.instances[0].useCaseId,
      runtimeIdentityId: canonical.instances[0].runtimeIdentityId,
      value: "client-1",
      expectedState: "rollback",
      state: "active",
    });
  });

  it.each([
    ["partial canonical link", { ...canonical.instances[0], runtimeIdentityId: null }],
    ["wrong linked client", { ...canonical.instances[0], linkedClientId: "client-2" }],
  ])("blocks %s", (_name, instance) => {
    expect(
      planDashboardOidcBinding(
        { instances: [instance], bindings: [] },
        "client-1",
        "rollback",
      ),
    ).toEqual({ status: "blocked" });
  });

  it("blocks a client binding owned by another runtime", () => {
    expect(
      planDashboardOidcBinding(
        {
          ...canonical,
          bindings: [
            {
              id: "binding-1",
              useCaseId: canonical.instances[0].useCaseId!,
              runtimeIdentityId: "00000000-0000-4000-8000-000000000099",
              value: "client-1",
              state: "active",
            },
          ],
        },
        "client-1",
        "active",
      ),
    ).toEqual({ status: "blocked" });
  });

  it("keeps an explicitly unlinked legacy instance binding-free", () => {
    expect(
      planDashboardOidcBinding(
        {
          instances: [
            {
              ...canonical.instances[0],
              useCaseId: null,
              runtimeIdentityId: null,
            },
          ],
          bindings: [],
        },
        "client-1",
        "rollback",
      ),
    ).toEqual({ status: "legacy_noop" });
  });

  function exactActive(): DashboardOidcBindingSnapshot {
    return {
      ...canonical,
      bindings: [
        {
          id: "binding-1",
          useCaseId: canonical.instances[0].useCaseId!,
          runtimeIdentityId: canonical.instances[0].runtimeIdentityId,
          value: "client-1",
          state: "active",
        },
      ],
    };
  }

  function gateway(
    snapshots: DashboardOidcBindingSnapshot[],
  ): DashboardOidcBindingReconciliationGateway & {
    inspect: jest.Mock;
    apply: jest.Mock;
  } {
    return {
      inspect: jest.fn().mockImplementation(async () => snapshots.shift()),
      apply: jest.fn().mockResolvedValue(undefined),
    };
  }

  it("applies and verifies an exact audited insert or update", async () => {
    const insert = gateway([canonical, exactActive()]);
    await expect(
      executeDashboardOidcBindingReconciliation(
        "client-1",
        "active",
        insert,
      ),
    ).resolves.toBe(true);
    expect(insert.apply).toHaveBeenCalledWith(
      expect.objectContaining({ status: "insert", state: "active" }),
    );

    const rollback = {
      ...exactActive(),
      bindings: [{ ...exactActive().bindings[0], state: "rollback" as const }],
    };
    const update = gateway([rollback, exactActive()]);
    await expect(
      executeDashboardOidcBindingReconciliation(
        "client-1",
        "active",
        update,
      ),
    ).resolves.toBe(true);
    expect(update.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "update",
        expectedState: "rollback",
        state: "active",
      }),
    );
  });

  it("does not mutate an already verified binding", async () => {
    const store = gateway([exactActive()]);
    await expect(
      executeDashboardOidcBindingReconciliation(
        "client-1",
        "active",
        store,
      ),
    ).resolves.toBe(true);
    expect(store.apply).not.toHaveBeenCalled();
  });

  it("fails closed on atomic audit failure or post-plan drift", async () => {
    const auditFailure = gateway([canonical, canonical]);
    auditFailure.apply.mockRejectedValue(new Error("audit unavailable"));
    await expect(
      executeDashboardOidcBindingReconciliation(
        "client-1",
        "active",
        auditFailure,
      ),
    ).resolves.toBe(false);

    const copied = {
      ...canonical,
      bindings: [
        {
          ...exactActive().bindings[0],
          runtimeIdentityId: "00000000-0000-4000-8000-000000000099",
        },
      ],
    };
    const drift = gateway([canonical, copied]);
    await expect(
      executeDashboardOidcBindingReconciliation(
        "client-1",
        "active",
        drift,
      ),
    ).resolves.toBe(false);
  });

  it("converges without a second mutation when an exact writer wins", async () => {
    const store = gateway([canonical, exactActive()]);
    store.apply.mockRejectedValue(new Error("unique conflict"));
    await expect(
      executeDashboardOidcBindingReconciliation(
        "client-1",
        "active",
        store,
      ),
    ).resolves.toBe(true);
    expect(store.apply).toHaveBeenCalledTimes(1);
  });
});
