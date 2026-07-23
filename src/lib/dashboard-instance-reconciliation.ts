import { z } from "zod";

export interface DashboardInstanceDescriptor {
  tenantId: string;
  hostname: string;
  containerId: string;
}

export interface DashboardReconciliationIdentity {
  useCaseId: string;
  runtimeIdentityId: string;
}

export interface DashboardReconciliationMembership {
  useCaseId: string;
  runtimeIdentityId: string | null;
  userId: string;
  role: string;
  status: string;
  expiresAt: Date | null;
  suspendedAt: Date | null;
  revokedAt: Date | null;
}

export interface DashboardReconciliationBinding {
  useCaseId: string;
  runtimeIdentityId: string | null;
  provider: string;
  kind: string;
  value: string;
  state: string;
}

export interface DashboardReconciliationCandidate {
  id: string;
  userId: string;
  tenantId: string;
  useCaseId: string | null;
  runtimeIdentityId: string | null;
  status: string;
  containerId: string | null;
  subdomain: string | null;
  dashboardTokenHash: string | null;
  engineApiKey: string | null;
  phaseServiceToken: string | null;
}

export interface DashboardInstanceReconciliationSnapshot {
  schemaReady: boolean;
  privateRuntimeQualified: boolean;
  identities: DashboardReconciliationIdentity[];
  memberships: DashboardReconciliationMembership[];
  platformBindings: DashboardReconciliationBinding[];
  hostnameBindings: DashboardReconciliationBinding[];
  candidates: DashboardReconciliationCandidate[];
}

export type DashboardInstanceReconciliationPlan =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "ready";
      ownerId: string;
      useCaseId: string;
      runtimeIdentityId: string;
      tenantId: string;
      hostname: string;
      containerId: string;
    }
  | {
      status: "verified_noop";
      instanceId: string;
      useCaseId: string;
      runtimeIdentityId: string;
    };

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const descriptorSchema = z
  .object({
    tenantId: z.string().min(1).max(63).regex(slug),
    hostname: z.string().min(1).max(253),
    containerId: z.string().min(1).max(128).regex(slug),
  })
  .strict();

function blocked(reason: string): DashboardInstanceReconciliationPlan {
  return { status: "blocked", reasons: [reason] };
}

function isApprovedHostname(hostname: string) {
  if (
    hostname !== hostname.toLowerCase() ||
    !hostname.endsWith(".overnightdesk.com")
  ) {
    return false;
  }
  try {
    const url = new URL(`https://${hostname}`);
    return url.hostname === hostname && url.origin === `https://${hostname}`;
  } catch {
    return false;
  }
}

function isCurrentOwner(
  membership: DashboardReconciliationMembership,
  identity: DashboardReconciliationIdentity,
  now: Date,
) {
  return (
    membership.useCaseId === identity.useCaseId &&
    (membership.runtimeIdentityId === null ||
      membership.runtimeIdentityId === identity.runtimeIdentityId) &&
    membership.role === "owner" &&
    membership.status === "active" &&
    membership.suspendedAt === null &&
    membership.revokedAt === null &&
    (membership.expiresAt === null || membership.expiresAt > now)
  );
}

function hasExactBinding(
  bindings: DashboardReconciliationBinding[],
  input: {
    identity: DashboardReconciliationIdentity;
    provider: string;
    kind: string;
    value: string;
  },
) {
  const matches = bindings.filter(
    (binding) =>
      binding.useCaseId === input.identity.useCaseId &&
      binding.runtimeIdentityId === input.identity.runtimeIdentityId &&
      binding.provider === input.provider &&
      binding.kind === input.kind &&
      binding.value === input.value &&
      binding.state === "active",
  );
  return matches.length === 1 && bindings.length === 1;
}

function candidateIsExact(
  candidate: DashboardReconciliationCandidate,
  expected: Extract<DashboardInstanceReconciliationPlan, { status: "ready" }>,
) {
  return (
    candidate.userId === expected.ownerId &&
    candidate.tenantId === expected.tenantId &&
    candidate.useCaseId === expected.useCaseId &&
    candidate.runtimeIdentityId === expected.runtimeIdentityId &&
    candidate.status === "running" &&
    candidate.containerId === expected.containerId &&
    candidate.subdomain === expected.hostname &&
    candidate.dashboardTokenHash === null &&
    candidate.engineApiKey === null &&
    candidate.phaseServiceToken === null
  );
}

export function planDashboardInstanceReconciliation(
  snapshot: DashboardInstanceReconciliationSnapshot,
  rawDescriptor: DashboardInstanceDescriptor,
  { now = new Date() }: { now?: Date } = {},
): DashboardInstanceReconciliationPlan {
  const parsedDescriptor = descriptorSchema.safeParse(rawDescriptor);
  if (
    !parsedDescriptor.success ||
    !isApprovedHostname(parsedDescriptor.data.hostname)
  ) {
    return blocked("Dashboard assignment descriptor is invalid");
  }
  const descriptor = parsedDescriptor.data;
  if (!snapshot.schemaReady) return blocked("Dashboard assignment schema is unavailable");
  if (!snapshot.privateRuntimeQualified) {
    return blocked("Private runtime qualification is unavailable");
  }
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

  if (
    !hasExactBinding(snapshot.platformBindings, {
      identity,
      provider: "overnightdesk",
      kind: "platform_instance",
      value: descriptor.tenantId,
    })
  ) {
    return blocked("Canonical platform instance binding is ambiguous");
  }
  if (
    !hasExactBinding(snapshot.hostnameBindings, {
      identity,
      provider: "nginx",
      kind: "hostname",
      value: descriptor.hostname,
    })
  ) {
    return blocked("Canonical dashboard hostname binding is ambiguous");
  }

  const ready: Extract<
    DashboardInstanceReconciliationPlan,
    { status: "ready" }
  > = {
    status: "ready",
    ownerId,
    useCaseId: identity.useCaseId,
    runtimeIdentityId: identity.runtimeIdentityId,
    tenantId: descriptor.tenantId,
    hostname: descriptor.hostname,
    containerId: descriptor.containerId,
  };
  if (snapshot.candidates.length === 0) return ready;
  if (snapshot.candidates.length !== 1) {
    return blocked("Dashboard instance projection is ambiguous");
  }
  const [candidate] = snapshot.candidates;
  if (!candidateIsExact(candidate, ready)) {
    return blocked("Dashboard instance projection conflicts with canonical identity");
  }
  return {
    status: "verified_noop",
    instanceId: candidate.id,
    useCaseId: identity.useCaseId,
    runtimeIdentityId: identity.runtimeIdentityId,
  };
}

export function requireDashboardAssignmentConfirmation(value?: string) {
  if (value !== "APPLY_CANONICAL_DASHBOARD_ASSIGNMENT") {
    throw new Error("Dashboard assignment confirmation is required");
  }
}

export function summarizeDashboardInstanceReconciliation(
  plan: DashboardInstanceReconciliationPlan,
) {
  switch (plan.status) {
    case "ready":
      return { status: plan.status, assignmentsToCreate: 1 };
    case "verified_noop":
      return { status: plan.status, assignmentsVerified: 1 };
    case "blocked":
      return { status: plan.status };
  }
}
