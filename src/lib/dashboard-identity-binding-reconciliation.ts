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
      bindingStateUpdates?: Array<{
        bindingId: string;
        provider: DashboardIdentityBindingDescriptor["provider"];
        kind: DashboardIdentityBindingDescriptor["kind"];
        value: string;
        expectedState: "compatibility";
        state: "active";
      }>;
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

function reconciliationActions(
  snapshot: DashboardIdentityBindingSnapshot,
  descriptors: DashboardIdentityBindingDescriptor[],
  identity: DashboardIdentityBindingSnapshot["identities"][number],
) {
  const missing: DashboardIdentityBindingDescriptor[] = [];
  const bindingStateUpdates: Array<{
    bindingId: string;
    provider: DashboardIdentityBindingDescriptor["provider"];
    kind: DashboardIdentityBindingDescriptor["kind"];
    value: string;
    expectedState: "compatibility";
    state: "active";
  }> = [];
  for (const descriptor of descriptors) {
    const matches = snapshot.bindings.filter((binding) =>
      recordMatchesDescriptor(binding, descriptor),
    );
    if (matches.length === 0) {
      missing.push(descriptor);
    } else if (
      matches.length !== 1 ||
      matches[0].useCaseId !== identity.useCaseId ||
      matches[0].runtimeIdentityId !== identity.runtimeIdentityId
    ) {
      return null;
    } else if (matches[0].state === descriptor.state) {
      continue;
    } else if (matches[0].state === "compatibility") {
      bindingStateUpdates.push({
        bindingId: matches[0].id,
        provider: descriptor.provider,
        kind: descriptor.kind,
        value: descriptor.value,
        expectedState: "compatibility",
        state: "active",
      });
    } else {
      return null;
    }
  }
  const containsUnexpected = snapshot.bindings.some(
    (binding) =>
      !descriptors.some((descriptor) =>
        recordMatchesDescriptor(binding, descriptor),
      ),
  );
  return containsUnexpected
    ? null
    : { bindings: missing, bindingStateUpdates };
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
  const actions = reconciliationActions(snapshot, descriptors, identity);
  if (actions === null) return { status: "blocked" };
  if (
    actions.bindings.length === 0 &&
    actions.bindingStateUpdates.length === 0
  ) {
    return { status: "verified_noop", bindingsVerified: 2 };
  }
  return {
    status: "ready",
    useCaseId: identity.useCaseId,
    runtimeIdentityId: identity.runtimeIdentityId,
    bindings: actions.bindings,
    ...(actions.bindingStateUpdates.length > 0
      ? { bindingStateUpdates: actions.bindingStateUpdates }
      : {}),
  };
}

export type DashboardIdentityBindingTarget = "titus" | "walter";

export function requireDashboardIdentityBindingConfirmation(
  target: DashboardIdentityBindingTarget,
  value?: string,
) {
  const expected =
    target === "walter"
      ? "APPLY_WALTER_DASHBOARD_IDENTITY_BINDINGS"
      : "APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS";
  if (value !== expected) {
    throw new Error("Dashboard identity binding confirmation is required");
  }
}

export function summarizeDashboardIdentityBindingReconciliation(
  plan: DashboardIdentityBindingPlan,
) {
  switch (plan.status) {
    case "ready":
      return {
        status: plan.status,
        bindingsToCreate: plan.bindings.length,
        ...(plan.bindingStateUpdates?.length
          ? { bindingsToActivate: plan.bindingStateUpdates.length }
          : {}),
      };
    case "verified_noop":
      return {
        status: plan.status,
        bindingsVerified: plan.bindingsVerified,
      };
    case "blocked":
      return { status: plan.status };
  }
}
