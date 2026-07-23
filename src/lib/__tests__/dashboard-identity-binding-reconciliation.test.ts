import {
  dashboardIdentityBindingDescriptorContractValid,
  dashboardIdentityBindingDescriptors,
  planDashboardIdentityBindingReconciliation,
  requireDashboardIdentityBindingConfirmation,
  summarizeDashboardIdentityBindingReconciliation,
  type DashboardIdentityBindingDescriptor,
  type DashboardIdentityBindingSnapshot,
} from "@/lib/dashboard-identity-binding-reconciliation";
import { TITUS_IDENTITY_TEMPLATE } from "@/lib/use-case-identity-templates";

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

function existingBinding(
  index: number,
): DashboardIdentityBindingSnapshot["bindings"][number] {
  return {
    id: `binding-${index}`,
    useCaseId,
    runtimeIdentityId,
    ...descriptors[index],
  };
}

describe("dashboard identity binding reconciliation", () => {
  it("derives the exact dashboard bindings from the canonical identity template", () => {
    expect(
      dashboardIdentityBindingDescriptors(TITUS_IDENTITY_TEMPLATE),
    ).toEqual(descriptors);
  });

  it("plans both missing exact runtime-scoped bindings", () => {
    expect(
      planDashboardIdentityBindingReconciliation(snapshot(), descriptors),
    ).toEqual({
      status: "ready",
      useCaseId,
      runtimeIdentityId,
      bindings: descriptors,
    });
  });

  it("plans only the missing binding when exact partial state exists", () => {
    expect(
      planDashboardIdentityBindingReconciliation(
        snapshot({ bindings: [existingBinding(0)] }),
        descriptors,
      ),
    ).toEqual({
      status: "ready",
      useCaseId,
      runtimeIdentityId,
      bindings: [descriptors[1]],
    });
  });

  it("is a verified no-op when both exact bindings already exist", () => {
    expect(
      planDashboardIdentityBindingReconciliation(
        snapshot({ bindings: [existingBinding(0), existingBinding(1)] }),
        descriptors,
      ),
    ).toEqual({ status: "verified_noop", bindingsVerified: 2 });
  });

  it.each([
    ["missing schema", snapshot({ schemaReady: false })],
    ["missing identity", snapshot({ identities: [] })],
    [
      "ambiguous identity",
      snapshot({
        identities: [
          { useCaseId, runtimeIdentityId },
          {
            useCaseId: "33333333-3333-4333-8333-333333333333",
            runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
          },
        ],
      }),
    ],
    [
      "copied binding",
      snapshot({
        bindings: [
          {
            ...existingBinding(0),
            runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
          },
        ],
      }),
    ],
    [
      "wrong state",
      snapshot({
        bindings: [{ ...existingBinding(1), state: "rollback" }],
      }),
    ],
    [
      "duplicate live identifier",
      snapshot({
        bindings: [
          existingBinding(0),
          { ...existingBinding(0), id: "binding-2" },
        ],
      }),
    ],
  ])("blocks %s", (_label, current) => {
    expect(
      planDashboardIdentityBindingReconciliation(current, descriptors),
    ).toEqual({ status: "blocked" });
  });

  it("blocks an incomplete or duplicated descriptor contract", () => {
    expect(
      dashboardIdentityBindingDescriptorContractValid([descriptors[0]]),
    ).toBe(false);
    expect(
      dashboardIdentityBindingDescriptorContractValid([
        descriptors[0],
        descriptors[0],
      ]),
    ).toBe(false);
    expect(dashboardIdentityBindingDescriptorContractValid(descriptors)).toBe(
      true,
    );
    expect(
      planDashboardIdentityBindingReconciliation(snapshot(), [descriptors[0]]),
    ).toEqual({ status: "blocked" });
    expect(
      planDashboardIdentityBindingReconciliation(snapshot(), [
        descriptors[0],
        descriptors[0],
      ]),
    ).toEqual({ status: "blocked" });
  });

  it("requires the exact explicit apply confirmation", () => {
    expect(() =>
      requireDashboardIdentityBindingConfirmation(undefined),
    ).toThrow("Dashboard identity binding confirmation is required");
    expect(() => requireDashboardIdentityBindingConfirmation("yes")).toThrow(
      "Dashboard identity binding confirmation is required",
    );
    expect(() =>
      requireDashboardIdentityBindingConfirmation(
        "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS",
      ),
    ).not.toThrow();
  });

  it("summarizes plans without canonical IDs or binding values", () => {
    const plan = planDashboardIdentityBindingReconciliation(
      snapshot(),
      descriptors,
    );
    const summary = summarizeDashboardIdentityBindingReconciliation(plan);

    expect(summary).toEqual({ status: "ready", bindingsToCreate: 2 });
    const serialized = JSON.stringify(summary);
    for (const value of [
      useCaseId,
      runtimeIdentityId,
      descriptors[0].value,
      descriptors[1].value,
    ]) {
      expect(serialized).not.toContain(value);
    }
  });
});
