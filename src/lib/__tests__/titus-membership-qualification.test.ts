import {
  planTitusMembershipQualification,
  requireTitusMembershipQualificationConfirmation,
  summarizeTitusMembershipQualification,
  type TitusMembershipQualificationCandidate,
  type TitusMembershipQualificationState,
} from "@/lib/titus-membership-qualification";

const now = new Date("2026-07-23T15:30:00.000Z");

function candidate(
  state: TitusMembershipQualificationState = "active",
): TitusMembershipQualificationCandidate {
  return {
    membershipId: "membership-sensitive-id",
    membershipUserId: "user-sensitive-id",
    instanceUserId: "user-sensitive-id",
    membershipRuntimeIdentityId: null,
    role: "owner",
    status: state === "non_member" ? "invited" : "active",
    activatedAt: new Date("2026-07-20T00:00:00.000Z"),
    suspendedAt: state === "suspended" ? new Date(now.getTime() - 1_000) : null,
    expiresAt: state === "expired" ? new Date(now.getTime() - 1_000) : null,
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

describe("Titus membership qualification planner", () => {
  it.each([
    "non_member",
    "suspended",
    "expired",
  ] as TitusMembershipQualificationState[])(
    "plans one exact active-to-%s denial transition",
    (desiredState) => {
      expect(
        planTitusMembershipQualification([candidate()], desiredState, now),
      ).toEqual({
        status: "ready",
        membershipId: "membership-sensitive-id",
        currentState: "active",
        desiredState,
      });
    },
  );

  it.each([
    "non_member",
    "suspended",
    "expired",
  ] as TitusMembershipQualificationState[])(
    "plans an exact %s-to-active restoration",
    (currentState) => {
      expect(
        planTitusMembershipQualification(
          [candidate(currentState)],
          "active",
          now,
        ),
      ).toEqual({
        status: "ready",
        membershipId: "membership-sensitive-id",
        currentState,
        desiredState: "active",
      });
    },
  );

  it("treats an already reached state as verified", () => {
    expect(
      planTitusMembershipQualification(
        [candidate("suspended")],
        "suspended",
        now,
      ),
    ).toEqual({
      status: "verified",
      state: "suspended",
      membershipCount: 1,
    });
  });

  it("blocks an ambiguous or noncanonical target", () => {
    expect(
      planTitusMembershipQualification(
        [candidate(), candidate()],
        "expired",
        now,
      ),
    ).toEqual({ status: "blocked" });

    const invalidCandidates = [
      { instanceTenantId: "copied-dashboard" },
      { instanceSubdomain: "aegis-prod.overnightdesk.com" },
      { useCaseSlug: "overnightdesk-platform-operations" },
      { runtimeSlug: "hermes-walter" },
      { membershipUserId: "different-user" },
      { membershipRuntimeIdentityId: "unexpected-runtime-scope" },
      { role: "member" as const },
      { instanceStatus: "stopped" },
      { dashboardAuthStatus: "disabled" },
      { oidcClientPresent: false },
      { oidcClientDisabled: true },
      { oidcBindingState: "rollback" },
      { oidcBindingMatchesCanonicalScope: false },
    ];

    for (const change of invalidCandidates) {
      expect(
        planTitusMembershipQualification(
          [{ ...candidate(), ...change }],
          "expired",
          now,
        ),
      ).toEqual({ status: "blocked" });
    }
  });

  it("blocks direct transitions between denial states and drifted membership", () => {
    expect(
      planTitusMembershipQualification(
        [candidate("suspended")],
        "expired",
        now,
      ),
    ).toEqual({ status: "blocked" });
    expect(
      planTitusMembershipQualification(
        [{ ...candidate(), revokedAt: new Date(now.getTime() - 1_000) }],
        "suspended",
        now,
      ),
    ).toEqual({ status: "blocked" });
  });

  it("keeps restoration available when the dashboard or OIDC boundary degrades", () => {
    const denied = {
      ...candidate("suspended"),
      instanceStatus: "stopped",
      dashboardAuthStatus: "disabled",
      oidcClientPresent: false,
      oidcClientDisabled: null,
      oidcBindingState: null,
      oidcBindingMatchesCanonicalScope: false,
    };
    expect(planTitusMembershipQualification([denied], "active", now)).toEqual({
      status: "ready",
      membershipId: "membership-sensitive-id",
      currentState: "suspended",
      desiredState: "active",
    });
    expect(planTitusMembershipQualification([denied], "expired", now)).toEqual({
      status: "blocked",
    });
  });

  it.each([
    ["active", "non_member", "BEGIN_TITUS_NON_MEMBER_DENIAL"],
    ["active", "suspended", "BEGIN_TITUS_SUSPENDED_DENIAL"],
    ["active", "expired", "BEGIN_TITUS_EXPIRED_DENIAL"],
    ["non_member", "active", "RESTORE_TITUS_AFTER_NON_MEMBER_DENIAL"],
    ["suspended", "active", "RESTORE_TITUS_AFTER_SUSPENDED_DENIAL"],
    ["expired", "active", "RESTORE_TITUS_AFTER_EXPIRED_DENIAL"],
  ] as const)(
    "requires the exact %s-to-%s confirmation",
    (currentState, desiredState, confirmation) => {
      expect(() =>
        requireTitusMembershipQualificationConfirmation(
          currentState,
          desiredState,
          confirmation,
        ),
      ).not.toThrow();
      expect(() =>
        requireTitusMembershipQualificationConfirmation(
          currentState,
          desiredState,
          "yes",
        ),
      ).toThrow("Titus membership qualification confirmation is required");
    },
  );

  it("summarizes ready state without identifiers or subject data", () => {
    const summary = summarizeTitusMembershipQualification(
      planTitusMembershipQualification([candidate()], "expired", now),
    );
    expect(summary).toEqual({
      status: "ready",
      currentState: "active",
      desiredState: "expired",
      membershipCount: 1,
    });
    expect(JSON.stringify(summary)).not.toContain("membership-sensitive-id");
    expect(JSON.stringify(summary)).not.toContain("user-sensitive-id");
  });
});
