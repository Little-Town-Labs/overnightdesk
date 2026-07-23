export type TitusMembershipQualificationState =
  | "active"
  | "non_member"
  | "suspended"
  | "expired";

export interface TitusMembershipQualificationCandidate {
  membershipId: string;
  membershipUserId: string;
  instanceUserId: string;
  membershipRuntimeIdentityId: string | null;
  role: "owner" | "operator" | "member" | "viewer";
  status: "invited" | "active" | "suspended" | "revoked";
  activatedAt: Date | null;
  suspendedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  useCaseSlug: string;
  useCaseStatus: string;
  runtimeSlug: string;
  runtimeStatus: string;
  instanceTenantId: string;
  instanceSubdomain: string;
  instanceStatus: string;
  dashboardAuthStatus: string;
  oidcClientPresent: boolean;
  oidcClientDisabled: boolean | null;
  oidcBindingState: string | null;
  oidcBindingMatchesCanonicalScope: boolean;
}

export type TitusMembershipQualificationPlan =
  | { status: "blocked" }
  | {
      status: "verified";
      state: TitusMembershipQualificationState;
      membershipCount: 1;
    }
  | {
      status: "ready";
      membershipId: string;
      currentState: TitusMembershipQualificationState;
      desiredState: TitusMembershipQualificationState;
    };

const confirmations = new Map<string, string>([
  ["active->non_member", "BEGIN_TITUS_NON_MEMBER_DENIAL"],
  ["active->suspended", "BEGIN_TITUS_SUSPENDED_DENIAL"],
  ["active->expired", "BEGIN_TITUS_EXPIRED_DENIAL"],
  ["non_member->active", "RESTORE_TITUS_AFTER_NON_MEMBER_DENIAL"],
  ["suspended->active", "RESTORE_TITUS_AFTER_SUSPENDED_DENIAL"],
  ["expired->active", "RESTORE_TITUS_AFTER_EXPIRED_DENIAL"],
]);

function exactCanonicalTarget(
  candidate: TitusMembershipQualificationCandidate,
) {
  return (
    candidate.membershipUserId === candidate.instanceUserId &&
    candidate.membershipRuntimeIdentityId === null &&
    candidate.role === "owner" &&
    candidate.activatedAt !== null &&
    candidate.useCaseSlug === "timeless-tech-solutions" &&
    candidate.useCaseStatus === "active" &&
    candidate.runtimeSlug === "hermes-titus" &&
    candidate.runtimeStatus === "active" &&
    candidate.instanceTenantId === "titus-dashboard" &&
    candidate.instanceSubdomain === "titus-dashboard.overnightdesk.com"
  );
}

function activeDashboardBoundary(
  candidate: TitusMembershipQualificationCandidate,
) {
  return (
    candidate.instanceStatus === "running" &&
    candidate.dashboardAuthStatus === "active" &&
    candidate.oidcClientPresent &&
    candidate.oidcClientDisabled === false &&
    candidate.oidcBindingState === "active" &&
    candidate.oidcBindingMatchesCanonicalScope
  );
}

function membershipState(
  candidate: TitusMembershipQualificationCandidate,
  now: Date,
): TitusMembershipQualificationState | null {
  if (candidate.revokedAt !== null) return null;
  if (
    candidate.status === "active" &&
    candidate.suspendedAt === null &&
    candidate.expiresAt === null
  ) {
    return "active";
  }
  if (
    candidate.status === "invited" &&
    candidate.suspendedAt === null &&
    candidate.expiresAt === null
  ) {
    return "non_member";
  }
  if (
    candidate.status === "active" &&
    candidate.suspendedAt !== null &&
    candidate.expiresAt === null
  ) {
    return "suspended";
  }
  if (
    candidate.status === "active" &&
    candidate.suspendedAt === null &&
    candidate.expiresAt !== null &&
    candidate.expiresAt.getTime() <= now.getTime()
  ) {
    return "expired";
  }
  return null;
}

export function planTitusMembershipQualification(
  candidates: readonly TitusMembershipQualificationCandidate[],
  desiredState: TitusMembershipQualificationState,
  now = new Date(),
): TitusMembershipQualificationPlan {
  if (candidates.length !== 1 || !exactCanonicalTarget(candidates[0])) {
    return { status: "blocked" };
  }
  const candidate = candidates[0];
  if (desiredState !== "active" && !activeDashboardBoundary(candidate)) {
    return { status: "blocked" };
  }
  const currentState = membershipState(candidate, now);
  if (currentState === null) return { status: "blocked" };
  if (currentState === desiredState) {
    return { status: "verified", state: currentState, membershipCount: 1 };
  }
  if (!confirmations.has(`${currentState}->${desiredState}`)) {
    return { status: "blocked" };
  }
  return {
    status: "ready",
    membershipId: candidate.membershipId,
    currentState,
    desiredState,
  };
}

export function requireTitusMembershipQualificationConfirmation(
  currentState: TitusMembershipQualificationState,
  desiredState: TitusMembershipQualificationState,
  value?: string,
) {
  const expected = confirmations.get(`${currentState}->${desiredState}`);
  if (!expected || value !== expected) {
    throw new Error("Titus membership qualification confirmation is required");
  }
}

export function summarizeTitusMembershipQualification(
  plan: TitusMembershipQualificationPlan,
) {
  if (plan.status !== "ready") return plan;
  return {
    status: plan.status,
    currentState: plan.currentState,
    desiredState: plan.desiredState,
    membershipCount: 1,
  };
}
