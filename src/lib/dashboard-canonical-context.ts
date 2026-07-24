export interface DashboardCanonicalContextRequirement {
  useCaseId: string;
  runtimeIdentityId: string;
  useCaseSlug?: string;
  runtimeSlug?: string;
  tenantId: string;
  hostname: string;
  oidc?: {
    clientId: string;
    allowedStates: readonly ("active" | "rollback")[];
  };
}

export interface DashboardCanonicalContextSnapshot {
  useCases: Array<{ id: string; slug: string; status: string }>;
  runtimes: Array<{
    id: string;
    useCaseId: string;
    slug: string;
    status: string;
  }>;
  bindings: Array<{
    useCaseId: string;
    runtimeIdentityId: string | null;
    provider: string;
    kind: string;
    value: string;
    state: string;
  }>;
}

interface RequiredBinding {
  provider: string;
  kind: string;
  value: string;
  allowedStates: readonly string[];
}

function requiredBindings(
  requirement: DashboardCanonicalContextRequirement,
): RequiredBinding[] {
  const bindings: RequiredBinding[] = [
    {
      provider: "overnightdesk",
      kind: "platform_instance",
      value: requirement.tenantId,
      allowedStates: ["active"],
    },
    {
      provider: "nginx",
      kind: "hostname",
      value: requirement.hostname,
      allowedStates: ["active"],
    },
  ];
  if (requirement.oidc) {
    bindings.push({
      provider: "better-auth",
      kind: "oidc_client",
      value: requirement.oidc.clientId,
      allowedStates: requirement.oidc.allowedStates,
    });
  }
  return bindings;
}

function hasOneExactBinding(
  snapshot: DashboardCanonicalContextSnapshot,
  requirement: DashboardCanonicalContextRequirement,
  binding: RequiredBinding,
) {
  const matches = snapshot.bindings.filter(
    (candidate) =>
      candidate.useCaseId === requirement.useCaseId &&
      candidate.runtimeIdentityId === requirement.runtimeIdentityId &&
      candidate.provider === binding.provider &&
      candidate.kind === binding.kind &&
      candidate.value === binding.value &&
      binding.allowedStates.includes(candidate.state),
  );
  return matches.length === 1;
}

export function hasExactCanonicalDashboardContext(
  snapshot: DashboardCanonicalContextSnapshot,
  requirement: DashboardCanonicalContextRequirement,
): boolean {
  if (
    snapshot.useCases.length !== 1 ||
    snapshot.useCases[0].id !== requirement.useCaseId ||
    (requirement.useCaseSlug !== undefined &&
      snapshot.useCases[0].slug !== requirement.useCaseSlug) ||
    snapshot.useCases[0].status !== "active" ||
    snapshot.runtimes.length !== 1 ||
    snapshot.runtimes[0].id !== requirement.runtimeIdentityId ||
    snapshot.runtimes[0].useCaseId !== requirement.useCaseId ||
    (requirement.runtimeSlug !== undefined &&
      snapshot.runtimes[0].slug !== requirement.runtimeSlug) ||
    snapshot.runtimes[0].status !== "active"
  ) {
    return false;
  }

  const bindings = requiredBindings(requirement);
  return (
    snapshot.bindings.length === bindings.length &&
    bindings.every((binding) =>
      hasOneExactBinding(snapshot, requirement, binding),
    )
  );
}
