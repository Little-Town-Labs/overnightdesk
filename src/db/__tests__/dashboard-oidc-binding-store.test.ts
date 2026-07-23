jest.mock("@/db", () => ({ db: {} }));

import {
  planDashboardOidcBinding,
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
    ).toEqual({ status: "update", bindingId: "binding-1", state: "active" });
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
});
