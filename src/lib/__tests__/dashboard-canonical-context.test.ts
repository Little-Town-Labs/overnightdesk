import {
  hasExactCanonicalDashboardContext,
  type DashboardCanonicalContextRequirement,
  type DashboardCanonicalContextSnapshot,
} from "@/lib/dashboard-canonical-context";

const useCaseId = "11111111-1111-4111-8111-111111111111";
const runtimeIdentityId = "22222222-2222-4222-8222-222222222222";

const requirement: DashboardCanonicalContextRequirement = {
  useCaseId,
  runtimeIdentityId,
  tenantId: "titus-dashboard",
  hostname: "titus-dashboard.overnightdesk.com",
  oidc: {
    clientId: "public-client-1",
    allowedStates: ["active"],
  },
};

function snapshot(): DashboardCanonicalContextSnapshot {
  return {
    useCases: [
      { id: useCaseId, slug: "timeless-tech-solutions", status: "active" },
    ],
    runtimes: [
      {
        id: runtimeIdentityId,
        useCaseId,
        slug: "hermes-titus",
        status: "active",
      },
    ],
    bindings: [
      {
        useCaseId,
        runtimeIdentityId,
        provider: "overnightdesk",
        kind: "platform_instance",
        value: "titus-dashboard",
        state: "active",
      },
      {
        useCaseId,
        runtimeIdentityId,
        provider: "nginx",
        kind: "hostname",
        value: "titus-dashboard.overnightdesk.com",
        state: "active",
      },
      {
        useCaseId,
        runtimeIdentityId,
        provider: "better-auth",
        kind: "oidc_client",
        value: "public-client-1",
        state: "active",
      },
    ],
  };
}

describe("canonical dashboard context", () => {
  it("accepts one exact active runtime and all required selectors", () => {
    expect(hasExactCanonicalDashboardContext(snapshot(), requirement)).toBe(
      true,
    );
  });

  it.each([
    ["inactive use case", (value: DashboardCanonicalContextSnapshot) => {
      value.useCases[0].status = "retired";
    }],
    ["inactive runtime", (value: DashboardCanonicalContextSnapshot) => {
      value.runtimes[0].status = "disabled";
    }],
    ["wrong fixed use case", (value: DashboardCanonicalContextSnapshot) => {
      value.useCases[0].slug = "overnightdesk-platform-operations";
    }],
    ["wrong fixed runtime", (value: DashboardCanonicalContextSnapshot) => {
      value.runtimes[0].slug = "hermes-walter";
    }],
    ["runtime in another use case", (value: DashboardCanonicalContextSnapshot) => {
      value.runtimes[0].useCaseId =
        "33333333-3333-4333-8333-333333333333";
    }],
    ["platform selector in another runtime", (value: DashboardCanonicalContextSnapshot) => {
      value.bindings[0].runtimeIdentityId =
        "33333333-3333-4333-8333-333333333333";
    }],
    ["hostname selector in another use case", (value: DashboardCanonicalContextSnapshot) => {
      value.bindings[1].useCaseId =
        "33333333-3333-4333-8333-333333333333";
    }],
    ["OIDC selector in rollback", (value: DashboardCanonicalContextSnapshot) => {
      value.bindings[2].state = "rollback";
    }],
    ["duplicate selector", (value: DashboardCanonicalContextSnapshot) => {
      value.bindings.push({ ...value.bindings[1] });
    }],
  ])("rejects %s", (_label, mutate) => {
    const value = snapshot();
    mutate(value);
    expect(
      hasExactCanonicalDashboardContext(value, {
        ...requirement,
        useCaseSlug: "timeless-tech-solutions",
        runtimeSlug: "hermes-titus",
      }),
    ).toBe(false);
  });

  it("accepts the exact rollback OIDC selector only when lifecycle inspection allows it", () => {
    const value = snapshot();
    value.bindings[2].state = "rollback";

    expect(
      hasExactCanonicalDashboardContext(value, {
        ...requirement,
        oidc: {
          clientId: "public-client-1",
          allowedStates: ["active", "rollback"],
        },
      }),
    ).toBe(true);
  });

  it("can prove the fixed target before its OIDC client is created", () => {
    const value = snapshot();
    value.bindings.pop();

    expect(
      hasExactCanonicalDashboardContext(value, {
        ...requirement,
        oidc: undefined,
      }),
    ).toBe(true);
  });
});
