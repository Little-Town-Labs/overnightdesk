import type { CanonicalIdentityTemplate } from "@/lib/use-case-identity-backfill";

export interface PlatformInstanceLinkIdentity {
  useCaseId: string;
  runtimeIdentityId: string;
}

export interface PlatformInstanceLinkMembership {
  useCaseId: string;
  userId: string;
  role: "owner" | "operator" | "member" | "viewer";
  status: "invited" | "active" | "suspended" | "revoked";
  runtimeIdentityId: string | null;
  expiresAt: Date | null;
  suspendedAt: Date | null;
  revokedAt: Date | null;
}

export interface PlatformInstanceLinkCandidate {
  id: string;
  userId: string;
  tenantId: string;
  useCaseId: string | null;
  runtimeIdentityId: string | null;
  status: string;
  subdomain: string | null;
  hermesOidcClientId: string | null;
  hermesDashboardAuthStatus: string;
}

export interface PlatformInstanceSelectorBinding {
  useCaseId: string;
  runtimeIdentityId: string | null;
  provider: string;
  kind: string;
  value: string;
  state: string;
}

export interface PlatformInstanceLinkSnapshot {
  schemaReady: boolean;
  identities: PlatformInstanceLinkIdentity[];
  memberships: PlatformInstanceLinkMembership[];
  instances: PlatformInstanceLinkCandidate[];
  platformBindings: PlatformInstanceSelectorBinding[];
}

export type PlatformInstanceLinkPlan =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "ready";
      instanceId: string;
      ownerId: string;
      tenantId: string;
      useCaseId: string;
      runtimeIdentityId: string;
    }
  | {
      status: "verified_noop";
      instanceId: string;
      useCaseId: string;
      runtimeIdentityId: string;
    };

export function getPlatformInstanceSelector(
  template: CanonicalIdentityTemplate,
) {
  const selectors = template.resourceBindings.filter(
    (binding) =>
      binding.provider === "overnightdesk" &&
      binding.kind === "platform_instance" &&
      (binding.state === "active" || binding.state === "compatibility"),
  );
  if (selectors.length !== 1) {
    throw new Error("Canonical platform instance selector is unavailable");
  }
  return selectors[0];
}

function blocked(reason: string): PlatformInstanceLinkPlan {
  return { status: "blocked", reasons: [reason] };
}

function isCurrentOwner(
  membership: PlatformInstanceLinkMembership,
  identity: PlatformInstanceLinkIdentity,
  now: Date,
) {
  return (
    membership.useCaseId === identity.useCaseId &&
    membership.role === "owner" &&
    membership.status === "active" &&
    (membership.runtimeIdentityId === null ||
      membership.runtimeIdentityId === identity.runtimeIdentityId) &&
    membership.suspendedAt === null &&
    membership.revokedAt === null &&
    (membership.expiresAt === null || membership.expiresAt > now)
  );
}

function isSafeDashboardInstance(candidate: PlatformInstanceLinkCandidate) {
  return (
    candidate.status === "running" &&
    candidate.subdomain !== null &&
    (candidate.subdomain === "overnightdesk.com" ||
      candidate.subdomain.endsWith(".overnightdesk.com")) &&
    candidate.hermesOidcClientId !== null &&
    candidate.hermesDashboardAuthStatus === "active"
  );
}

export function planPlatformInstanceLink(
  snapshot: PlatformInstanceLinkSnapshot,
  input: { tenantId: string; now?: Date },
): PlatformInstanceLinkPlan {
  const now = input.now ?? new Date();
  if (!snapshot.schemaReady) return blocked("Canonical instance schema is unavailable");
  if (snapshot.identities.length !== 1) {
    return blocked("Canonical runtime identity is ambiguous");
  }
  const [identity] = snapshot.identities;

  const ownerIds = [
    ...new Set(
      snapshot.memberships
        .filter((membership) => isCurrentOwner(membership, identity, now))
        .map((membership) => membership.userId),
    ),
  ];
  if (ownerIds.length !== 1) return blocked("Canonical owner is ambiguous");
  const [ownerId] = ownerIds;

  const selectors = snapshot.platformBindings.filter(
    (binding) =>
      binding.useCaseId === identity.useCaseId &&
      binding.runtimeIdentityId === identity.runtimeIdentityId &&
      binding.provider === "overnightdesk" &&
      binding.kind === "platform_instance" &&
      binding.value === input.tenantId &&
      (binding.state === "active" || binding.state === "compatibility"),
  );
  if (selectors.length !== 1) {
    return blocked("Canonical platform instance selector is ambiguous");
  }

  const candidates = snapshot.instances.filter(
    (candidate) => candidate.tenantId === input.tenantId,
  );
  if (candidates.length !== 1) return blocked("Platform instance is ambiguous");
  const [candidate] = candidates;
  if (candidate.userId !== ownerId) return blocked("Platform instance owner does not match");
  if (!isSafeDashboardInstance(candidate)) {
    return blocked("Platform instance dashboard is unavailable");
  }

  if (candidate.useCaseId === null && candidate.runtimeIdentityId === null) {
    return {
      status: "ready",
      instanceId: candidate.id,
      ownerId,
      tenantId: input.tenantId,
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
    };
  }
  if (
    candidate.useCaseId === identity.useCaseId &&
    candidate.runtimeIdentityId === identity.runtimeIdentityId
  ) {
    return {
      status: "verified_noop",
      instanceId: candidate.id,
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
    };
  }
  return blocked("Platform instance linkage conflicts with canonical identity");
}
