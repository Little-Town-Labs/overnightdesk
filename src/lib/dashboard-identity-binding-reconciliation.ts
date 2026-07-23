import type { CanonicalIdentityTemplate } from "@/lib/use-case-identity-templates";

export interface DashboardIdentityBindingDescriptor {
  provider: "overnightdesk" | "nginx";
  kind: "platform_instance" | "hostname";
  value: string;
  state: "active";
}

export interface DashboardIdentityBindingRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  provider: string;
  kind: string;
  value: string;
  state: "active" | "compatibility" | "rollback" | "retired";
}

export interface DashboardIdentityBindingSnapshot {
  schemaReady: boolean;
  identities: Array<{ useCaseId: string; runtimeIdentityId: string }>;
  bindings: DashboardIdentityBindingRecord[];
}

export type DashboardIdentityBindingPlan =
  | { status: "blocked" }
  | {
      status: "ready";
      useCaseId: string;
      runtimeIdentityId: string;
      bindings: DashboardIdentityBindingDescriptor[];
    }
  | { status: "verified_noop"; bindingsVerified: 2 };

const requiredDescriptorKeys = new Set([
  "overnightdesk:platform_instance",
  "nginx:hostname",
]);

export function dashboardIdentityBindingDescriptors(
  template: CanonicalIdentityTemplate,
): DashboardIdentityBindingDescriptor[] {
  const descriptors: DashboardIdentityBindingDescriptor[] = [];
  for (const binding of template.resourceBindings) {
    if (
      binding.provider === "overnightdesk" &&
      binding.kind === "platform_instance" &&
      binding.state === "active"
    ) {
      descriptors.push({
        provider: "overnightdesk",
        kind: "platform_instance",
        value: binding.value,
        state: "active",
      });
    } else if (
      binding.provider === "nginx" &&
      binding.kind === "hostname" &&
      binding.state === "active"
    ) {
      descriptors.push({
        provider: "nginx",
        kind: "hostname",
        value: binding.value,
        state: "active",
      });
    }
  }
  return descriptors;
}

function descriptorKey(
  descriptor: Pick<DashboardIdentityBindingDescriptor, "provider" | "kind">,
) {
  return `${descriptor.provider}:${descriptor.kind}`;
}

export function dashboardIdentityBindingDescriptorContractValid(
  descriptors: DashboardIdentityBindingDescriptor[],
) {
  const keys = new Set(descriptors.map(descriptorKey));
  return (
    descriptors.length === requiredDescriptorKeys.size &&
    keys.size === requiredDescriptorKeys.size &&
    [...requiredDescriptorKeys].every((key) => keys.has(key)) &&
    descriptors.every(
      (descriptor) =>
        descriptor.value.length > 0 && descriptor.state === "active",
    )
  );
}

function recordMatchesDescriptor(
  record: DashboardIdentityBindingRecord,
  descriptor: DashboardIdentityBindingDescriptor,
) {
  return (
    record.provider === descriptor.provider &&
    record.kind === descriptor.kind &&
    record.value === descriptor.value
  );
}

function missingExactBindings(
  snapshot: DashboardIdentityBindingSnapshot,
  descriptors: DashboardIdentityBindingDescriptor[],
  identity: DashboardIdentityBindingSnapshot["identities"][number],
) {
  const missing: DashboardIdentityBindingDescriptor[] = [];
  for (const descriptor of descriptors) {
    const matches = snapshot.bindings.filter((binding) =>
      recordMatchesDescriptor(binding, descriptor),
    );
    if (matches.length === 0) {
      missing.push(descriptor);
    } else if (
      matches.length !== 1 ||
      matches[0].useCaseId !== identity.useCaseId ||
      matches[0].runtimeIdentityId !== identity.runtimeIdentityId ||
      matches[0].state !== descriptor.state
    ) {
      return null;
    }
  }
  const containsUnexpected = snapshot.bindings.some(
    (binding) =>
      !descriptors.some((descriptor) =>
        recordMatchesDescriptor(binding, descriptor),
      ),
  );
  return containsUnexpected ? null : missing;
}

export function planDashboardIdentityBindingReconciliation(
  snapshot: DashboardIdentityBindingSnapshot,
  descriptors: DashboardIdentityBindingDescriptor[],
): DashboardIdentityBindingPlan {
  if (
    !snapshot.schemaReady ||
    snapshot.identities.length !== 1 ||
    !dashboardIdentityBindingDescriptorContractValid(descriptors)
  ) {
    return { status: "blocked" };
  }
  const [identity] = snapshot.identities;
  const missing = missingExactBindings(snapshot, descriptors, identity);
  if (missing === null) return { status: "blocked" };
  if (missing.length === 0) {
    return { status: "verified_noop", bindingsVerified: 2 };
  }
  return {
    status: "ready",
    useCaseId: identity.useCaseId,
    runtimeIdentityId: identity.runtimeIdentityId,
    bindings: missing,
  };
}

export function requireDashboardIdentityBindingConfirmation(value?: string) {
  if (value !== "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS") {
    throw new Error("Dashboard identity binding confirmation is required");
  }
}

export function summarizeDashboardIdentityBindingReconciliation(
  plan: DashboardIdentityBindingPlan,
) {
  switch (plan.status) {
    case "ready":
      return { status: plan.status, bindingsToCreate: plan.bindings.length };
    case "verified_noop":
      return {
        status: plan.status,
        bindingsVerified: plan.bindingsVerified,
      };
    case "blocked":
      return { status: plan.status };
  }
}
