jest.mock("@/db", () => ({ db: {} }));

import {
  executeTitusMembershipQualification,
  type TitusMembershipQualificationGateway,
} from "@/db/titus-membership-qualification-store";
import type {
  TitusMembershipQualificationCandidate,
  TitusMembershipQualificationPlan,
  TitusMembershipQualificationState,
} from "@/lib/titus-membership-qualification";

const now = new Date("2026-07-23T15:45:00.000Z");

function activeCandidate(): TitusMembershipQualificationCandidate {
  return {
    membershipId: "membership-sensitive-id",
    membershipUserId: "user-sensitive-id",
    instanceUserId: "user-sensitive-id",
    membershipRuntimeIdentityId: null,
    role: "owner",
    status: "active",
    activatedAt: new Date("2026-07-20T00:00:00.000Z"),
    suspendedAt: null,
    expiresAt: null,
    revokedAt: null,
    useCaseSlug: "timeless-tech-solutions",
    useCaseStatus: "active",
    runtimeSlug: "hermes-titus",
    runtimeStatus: "active",
    instanceTenantId: "titus-dashboard",
    instanceSubdomain: "titus-dashboard.overnightdesk.com",
    instanceStatus: "running",
    dashboardAuthStatus: "active",
    oidcClientPresent: true,
    oidcClientDisabled: false,
    oidcBindingState: "active",
    oidcBindingMatchesCanonicalScope: true,
  };
}

function setState(
  candidate: TitusMembershipQualificationCandidate,
  state: TitusMembershipQualificationState,
) {
  candidate.status = state === "non_member" ? "invited" : "active";
  candidate.suspendedAt =
    state === "suspended" ? new Date(now.getTime() - 1_000) : null;
  candidate.expiresAt =
    state === "expired" ? new Date(now.getTime() - 1_000) : null;
  candidate.revokedAt = null;
}

function fakeGateway(
  onApply?: (
    plan: Extract<TitusMembershipQualificationPlan, { status: "ready" }>,
    candidate: TitusMembershipQualificationCandidate,
  ) => void | Promise<void>,
) {
  const candidate = activeCandidate();
  const gateway: TitusMembershipQualificationGateway = {
    inspect: jest.fn(async () => [candidate]),
    apply: jest.fn(async (plan) => {
      if (onApply) return onApply(plan, candidate);
      setState(candidate, plan.desiredState);
    }),
  };
  return { candidate, gateway };
}

describe("Titus membership qualification command", () => {
  it("plans without writing and emits value-free counts", async () => {
    const { gateway } = fakeGateway();
    const result = await executeTitusMembershipQualification(
      "plan",
      "suspended",
      {},
      gateway,
      now,
    );
    expect(result).toEqual({
      status: "ready",
      currentState: "active",
      desiredState: "suspended",
      membershipCount: 1,
    });
    expect(gateway.apply).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("requires a bounded actor and the exact transition confirmation", async () => {
    const { gateway } = fakeGateway();
    await expect(
      executeTitusMembershipQualification(
        "apply",
        "suspended",
        {
          actor: "operator:feature-024-production",
          confirmation: "yes",
        },
        gateway,
        now,
      ),
    ).rejects.toThrow(
      "Titus membership qualification confirmation is required",
    );
    await expect(
      executeTitusMembershipQualification(
        "apply",
        "suspended",
        {
          actor: "not valid actor",
          confirmation: "BEGIN_TITUS_SUSPENDED_DENIAL",
        },
        gateway,
        now,
      ),
    ).rejects.toThrow("Titus membership qualification actor is invalid");
    expect(gateway.apply).not.toHaveBeenCalled();
  });

  it.each([
    ["non_member", "BEGIN_TITUS_NON_MEMBER_DENIAL"],
    ["suspended", "BEGIN_TITUS_SUSPENDED_DENIAL"],
    ["expired", "BEGIN_TITUS_EXPIRED_DENIAL"],
  ] as const)(
    "applies and separately verifies %s",
    async (state, confirmation) => {
      const { gateway } = fakeGateway();
      const result = await executeTitusMembershipQualification(
        "apply",
        state,
        {
          actor: "operator:feature-024-production",
          confirmation,
        },
        gateway,
        now,
      );
      expect(result).toEqual({
        status: "verified",
        state,
        membershipCount: 1,
      });
      await expect(
        executeTitusMembershipQualification("verify", state, {}, gateway, now),
      ).resolves.toEqual(result);
    },
  );

  it("restores only from the exact current denial state", async () => {
    const { candidate, gateway } = fakeGateway();
    setState(candidate, "expired");
    await expect(
      executeTitusMembershipQualification(
        "apply",
        "active",
        {
          actor: "operator:feature-024-production",
          confirmation: "RESTORE_TITUS_AFTER_EXPIRED_DENIAL",
        },
        gateway,
        now,
      ),
    ).resolves.toEqual({
      status: "verified",
      state: "active",
      membershipCount: 1,
    });
  });

  it("accepts a concurrent exact writer only when post-apply verification passes", async () => {
    const { gateway } = fakeGateway((plan, candidate) => {
      setState(candidate, plan.desiredState);
      throw new Error("concurrent writer");
    });
    await expect(
      executeTitusMembershipQualification(
        "apply",
        "expired",
        {
          actor: "operator:feature-024-production",
          confirmation: "BEGIN_TITUS_EXPIRED_DENIAL",
        },
        gateway,
        now,
      ),
    ).resolves.toEqual({
      status: "verified",
      state: "expired",
      membershipCount: 1,
    });
  });

  it("fails closed on mutation failure, drift, or wrong verification state", async () => {
    const failed = fakeGateway(() => {
      throw new Error("database unavailable");
    });
    await expect(
      executeTitusMembershipQualification(
        "apply",
        "expired",
        {
          actor: "operator:feature-024-production",
          confirmation: "BEGIN_TITUS_EXPIRED_DENIAL",
        },
        failed.gateway,
        now,
      ),
    ).rejects.toThrow("Titus membership qualification apply failed");

    const drifted = fakeGateway();
    drifted.candidate.membershipUserId = "copied-user";
    await expect(
      executeTitusMembershipQualification(
        "verify",
        "active",
        {},
        drifted.gateway,
        now,
      ),
    ).rejects.toThrow("Titus membership qualification is not verified");
  });
});
