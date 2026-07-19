import { z } from "zod";

const boundedId = z.string().min(1).max(512);

const foundationInputSchema = z.object({
  actor: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9:._-]+$/i),
});

const backfillInputSchema = foundationInputSchema.extend({
  membershipUserId: boundedId,
});

export interface CanonicalIdentityIds {
  useCaseId: string;
  runtimeIdentityId: string;
  personaAssignmentId: string;
  membershipId: string;
  resourceBindingIds: string[];
  secretBoundaryBindingIds: string[];
}

export interface UseCaseRecord {
  id: string;
  slug: string;
  displayName: string;
  status: "planned" | "active" | "suspended" | "retired";
}

export interface NumberAllocationRecord {
  number: number;
  useCaseId: string;
  allocatedBy: string;
}

export interface RuntimeIdentityRecord {
  id: string;
  useCaseId: string;
  slug: string;
  memoryBoundaryKind: string;
  status: "planned" | "active" | "suspended" | "retired";
}

export interface PersonaAssignmentRecord {
  id: string;
  runtimeIdentityId: string;
  personaKey: string;
  displayName: string;
  isDefault: boolean;
  authorityProfile: string;
  status: "active" | "disabled" | "retired";
}

export interface MembershipRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  userId: string;
  role: "owner" | "operator" | "member" | "viewer";
  status: "invited" | "active" | "suspended" | "revoked";
  grantedBy: string;
}

export interface ResourceBindingRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  provider: string;
  kind:
    | "platform_instance"
    | "orchestrator_tenant"
    | "container"
    | "volume"
    | "hostname"
    | "phase_path"
    | "oidc_client"
    | "intake_route";
  value: string;
  state: "active" | "compatibility" | "rollback" | "retired";
}

export interface SecretBoundaryBindingRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  phaseApp: string;
  environment: string;
  pathIdentifier: string;
}

export interface ExistingCanonicalState {
  useCase: UseCaseRecord;
  numberAllocation: NumberAllocationRecord | null;
  runtimeIdentity: RuntimeIdentityRecord | null;
  personaAssignment: PersonaAssignmentRecord | null;
  membership: MembershipRecord | null;
  resourceBindings: ResourceBindingRecord[];
  secretBoundaryBindings: SecretBoundaryBindingRecord[];
}

export interface IdentityBackfillSnapshot {
  schemaReady: boolean;
  membershipUser: { id: string; emailVerified: boolean } | null;
  canonicalConflict: boolean;
  existingCanonicalState: ExistingCanonicalState | null;
}

export interface IdentityFoundationSnapshot {
  schemaReady: boolean;
  canonicalConflict: boolean;
  existingCanonicalState: ExistingCanonicalState | null;
}

export const MITCHEL_TREVOR_IDENTITY_TEMPLATE = {
  number: 1,
  useCase: {
    slug: "mitchel-business",
    displayName: "Mitchel business workflows",
    status: "active" as const,
  },
  runtime: {
    slug: "hermes-mitchel",
    memoryBoundaryKind: "docker_named_volume",
    status: "active" as const,
  },
  persona: {
    personaKey: "trevor",
    displayName: "Trevor",
    isDefault: true,
    authorityProfile: "current-hermes-mitchel",
    status: "active" as const,
  },
  resourceBindings: [
    {
      provider: "docker",
      kind: "container" as const,
      value: "hermes-mitchel",
      state: "active" as const,
    },
    {
      provider: "docker",
      kind: "volume" as const,
      value: "hermes-mitchel-data",
      state: "active" as const,
    },
    {
      provider: "nginx",
      kind: "hostname" as const,
      value: "aero-fett.overnightdesk.com",
      state: "active" as const,
    },
    {
      provider: "phase",
      kind: "phase_path" as const,
      value: "/agents/hermes-email-intake/mitchel",
      state: "active" as const,
    },
  ],
  secretBoundaryBindings: [
    {
      phaseApp: "overnightdesk",
      environment: "production",
      pathIdentifier: "/agents/hermes-email-intake/mitchel",
    },
  ],
} as const;

export type IdentityBackfillInput = z.infer<typeof backfillInputSchema>;
export type IdentityFoundationInput = z.infer<typeof foundationInputSchema>;

interface BackfillAuditRecord {
  actor: string;
  action: "use_case_identity_backfill_applied";
  target: string;
  details: {
    useCaseNumber: number;
    membershipCount: number;
    resourceBindingCount: number;
    secretBoundaryBindingCount: number;
    platformInstanceLinked: boolean;
    orchestratorTenantBound: boolean;
  };
}

interface FoundationAuditRecord {
  actor: string;
  action: "use_case_identity_foundation_applied";
  target: string;
  details: BackfillAuditRecord["details"];
}

interface MembershipAuditRecord {
  actor: string;
  action: "use_case_membership_activated";
  target: string;
  details: { membershipCount: 1 };
}

export interface ReadyIdentityFoundationPlan {
  status: "ready";
  useCase: UseCaseRecord;
  numberAllocation: NumberAllocationRecord;
  runtimeIdentity: RuntimeIdentityRecord;
  personaAssignment: PersonaAssignmentRecord;
  resourceBindings: ResourceBindingRecord[];
  secretBoundaryBindings: SecretBoundaryBindingRecord[];
  audit: FoundationAuditRecord;
}

export type IdentityFoundationPlan =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "verified_noop";
      useCaseId: string;
      runtimeIdentityId: string;
    }
  | ReadyIdentityFoundationPlan;

export interface ReadyMembershipActivationPlan {
  status: "ready";
  membership: MembershipRecord;
  audit: MembershipAuditRecord;
}

export type MembershipActivationPlan =
  | { status: "blocked"; reasons: string[] }
  | { status: "verified_noop"; membershipId: string }
  | ReadyMembershipActivationPlan;

type FoundationPlanRecords = Omit<
  ReadyIdentityFoundationPlan,
  "status" | "audit"
>;

export interface ReadyIdentityBackfillPlan {
  status: "ready";
  useCase: UseCaseRecord;
  numberAllocation: NumberAllocationRecord;
  runtimeIdentity: RuntimeIdentityRecord;
  personaAssignment: PersonaAssignmentRecord;
  membership: MembershipRecord;
  resourceBindings: ResourceBindingRecord[];
  secretBoundaryBindings: SecretBoundaryBindingRecord[];
  audit: BackfillAuditRecord;
}

export type IdentityBackfillPlan =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "verified_noop";
      useCaseId: string;
      runtimeIdentityId: string;
    }
  | ReadyIdentityBackfillPlan;

export function summarizeIdentityBackfillPlan(plan: IdentityBackfillPlan) {
  if (plan.status === "blocked") return plan;
  if (plan.status === "verified_noop") return plan;
  return {
    status: plan.status,
    useCaseNumber: plan.numberAllocation.number,
    membershipCount: plan.audit.details.membershipCount,
    resourceBindingCount: plan.audit.details.resourceBindingCount,
    secretBoundaryBindingCount: plan.audit.details.secretBoundaryBindingCount,
    platformInstanceLinked: plan.audit.details.platformInstanceLinked,
    orchestratorTenantBound: plan.audit.details.orchestratorTenantBound,
  };
}

export function summarizeIdentityFoundationPlan(plan: IdentityFoundationPlan) {
  if (plan.status !== "ready") return plan;
  return {
    status: plan.status,
    useCaseNumber: plan.numberAllocation.number,
    membershipCount: plan.audit.details.membershipCount,
    resourceBindingCount: plan.audit.details.resourceBindingCount,
    secretBoundaryBindingCount: plan.audit.details.secretBoundaryBindingCount,
    platformInstanceLinked: plan.audit.details.platformInstanceLinked,
    orchestratorTenantBound: plan.audit.details.orchestratorTenantBound,
  };
}

export function summarizeMembershipActivationPlan(
  plan: MembershipActivationPlan,
) {
  if (plan.status === "blocked") return plan;
  if (plan.status === "verified_noop") return { status: plan.status };
  return {
    status: plan.status,
    membershipCount: plan.audit.details.membershipCount,
  };
}

function comparableResource(binding: ResourceBindingRecord) {
  return {
    useCaseId: binding.useCaseId,
    runtimeIdentityId: binding.runtimeIdentityId,
    provider: binding.provider,
    kind: binding.kind,
    value: binding.value,
    state: binding.state,
  };
}

function comparableSecretBoundary(binding: SecretBoundaryBindingRecord) {
  return {
    useCaseId: binding.useCaseId,
    runtimeIdentityId: binding.runtimeIdentityId,
    phaseApp: binding.phaseApp,
    environment: binding.environment,
    pathIdentifier: binding.pathIdentifier,
  };
}

function containsRequiredRecords<T>(
  existing: T[],
  required: T[],
  comparable: (value: T) => object,
): boolean {
  const existingKeys = new Set(
    existing.map((value) => JSON.stringify(comparable(value))),
  );
  return required.every((value) =>
    existingKeys.has(JSON.stringify(comparable(value))),
  );
}

function foundationCoreStateMatches(
  existing: ExistingCanonicalState,
  expected: FoundationPlanRecords,
): boolean {
  const { runtimeIdentity, personaAssignment, numberAllocation } = existing;
  const useCaseMatches =
    existing.useCase.slug === expected.useCase.slug &&
    existing.useCase.displayName === expected.useCase.displayName &&
    existing.useCase.status === expected.useCase.status;
  const allocationMatches =
    numberAllocation !== null &&
    numberAllocation.number === expected.numberAllocation.number &&
    numberAllocation.useCaseId === existing.useCase.id;
  const runtimeMatches =
    runtimeIdentity !== null &&
    runtimeIdentity.useCaseId === existing.useCase.id &&
    runtimeIdentity.slug === expected.runtimeIdentity.slug &&
    runtimeIdentity.memoryBoundaryKind ===
      expected.runtimeIdentity.memoryBoundaryKind &&
    runtimeIdentity.status === expected.runtimeIdentity.status;
  const personaMatches =
    personaAssignment !== null &&
    runtimeIdentity !== null &&
    personaAssignment.runtimeIdentityId === runtimeIdentity.id &&
    personaAssignment.personaKey === expected.personaAssignment.personaKey &&
    personaAssignment.displayName === expected.personaAssignment.displayName &&
    personaAssignment.isDefault === expected.personaAssignment.isDefault &&
    personaAssignment.authorityProfile ===
      expected.personaAssignment.authorityProfile &&
    personaAssignment.status === expected.personaAssignment.status;
  return (
    useCaseMatches &&
    allocationMatches &&
    runtimeMatches &&
    personaMatches
  );
}

function resourceStateMatches(
  existing: ExistingCanonicalState,
  expected: FoundationPlanRecords,
): boolean {
  const expectedBindings = expected.resourceBindings.map((binding) => ({
    ...binding,
    useCaseId: existing.useCase.id,
    runtimeIdentityId: existing.runtimeIdentity?.id ?? null,
  }));
  return containsRequiredRecords(
    existing.resourceBindings,
    expectedBindings,
    comparableResource,
  );
}

function secretBoundaryStateMatches(
  existing: ExistingCanonicalState,
  expected: FoundationPlanRecords,
): boolean {
  const expectedBindings = expected.secretBoundaryBindings.map((binding) => ({
    ...binding,
    useCaseId: existing.useCase.id,
    runtimeIdentityId: existing.runtimeIdentity?.id ?? null,
  }));
  return containsRequiredRecords(
    existing.secretBoundaryBindings,
    expectedBindings,
    comparableSecretBoundary,
  );
}

function existingFoundationStateMatches(
  existing: ExistingCanonicalState,
  expected: FoundationPlanRecords,
): boolean {
  return (
    foundationCoreStateMatches(existing, expected) &&
    resourceStateMatches(existing, expected) &&
    secretBoundaryStateMatches(existing, expected)
  );
}

function membershipStateMatches(
  existing: ExistingCanonicalState,
  expected: MembershipRecord,
): boolean {
  const membership = existing.membership;
  return (
    membership !== null &&
    membership.useCaseId === existing.useCase.id &&
    membership.runtimeIdentityId === null &&
    membership.userId === expected.userId &&
    membership.role === expected.role &&
    membership.status === expected.status
  );
}

function blockingReasons(
  input: IdentityBackfillInput,
  snapshot: IdentityBackfillSnapshot,
): string[] {
  const reasons: string[] = [];
  if (!snapshot.schemaReady) reasons.push("identity_schema_missing");
  if (snapshot.canonicalConflict) reasons.push("canonical_identity_conflict");
  if (snapshot.membershipUser?.id !== input.membershipUserId) {
    reasons.push("membership_user_missing");
  } else if (!snapshot.membershipUser.emailVerified) {
    reasons.push("membership_user_unverified");
  }
  return reasons;
}

function foundationBlockingReasons(
  snapshot: IdentityFoundationSnapshot,
): string[] {
  const reasons: string[] = [];
  if (!snapshot.schemaReady) reasons.push("identity_schema_missing");
  if (snapshot.canonicalConflict) reasons.push("canonical_identity_conflict");
  return reasons;
}

function resourceTemplates() {
  return [...MITCHEL_TREVOR_IDENTITY_TEMPLATE.resourceBindings];
}

function assertGeneratedIdCounts(
  ids: CanonicalIdentityIds,
  resources: ReturnType<typeof resourceTemplates>,
): void {
  if (
    ids.resourceBindingIds.length !== resources.length ||
    ids.secretBoundaryBindingIds.length !==
      MITCHEL_TREVOR_IDENTITY_TEMPLATE.secretBoundaryBindings.length
  ) {
    throw new Error("Generated identity ID counts do not match the manifest");
  }
}

function buildFoundationRecords(
  input: IdentityFoundationInput,
  ids: CanonicalIdentityIds,
) {
  return {
    useCase: { id: ids.useCaseId, ...MITCHEL_TREVOR_IDENTITY_TEMPLATE.useCase },
    numberAllocation: {
      number: MITCHEL_TREVOR_IDENTITY_TEMPLATE.number,
      useCaseId: ids.useCaseId,
      allocatedBy: input.actor,
    },
    runtimeIdentity: {
      id: ids.runtimeIdentityId,
      useCaseId: ids.useCaseId,
      ...MITCHEL_TREVOR_IDENTITY_TEMPLATE.runtime,
    },
    personaAssignment: {
      id: ids.personaAssignmentId,
      runtimeIdentityId: ids.runtimeIdentityId,
      ...MITCHEL_TREVOR_IDENTITY_TEMPLATE.persona,
    },
  };
}

function buildMembership(
  input: IdentityBackfillInput,
  membershipId: string,
  useCaseId: string,
): MembershipRecord {
  return {
    id: membershipId,
    useCaseId,
    runtimeIdentityId: null,
    userId: input.membershipUserId,
    role: "owner",
    status: "active",
    grantedBy: input.actor,
  };
}

function buildBindings(
  ids: CanonicalIdentityIds,
  resources: ReturnType<typeof resourceTemplates>,
) {
  return {
    resourceBindings: resources.map((binding, index) => ({
      id: ids.resourceBindingIds[index],
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
      ...binding,
    })),
    secretBoundaryBindings:
      MITCHEL_TREVOR_IDENTITY_TEMPLATE.secretBoundaryBindings.map(
        (binding, index) => ({
          id: ids.secretBoundaryBindingIds[index],
          useCaseId: ids.useCaseId,
          runtimeIdentityId: ids.runtimeIdentityId,
          ...binding,
        }),
      ),
  };
}

function buildReadyFoundationPlan(
  input: IdentityFoundationInput,
  ids: CanonicalIdentityIds,
): ReadyIdentityFoundationPlan {
  const resources = resourceTemplates();
  assertGeneratedIdCounts(ids, resources);
  const bindings = buildBindings(ids, resources);
  return {
    status: "ready",
    ...buildFoundationRecords(input, ids),
    ...bindings,
    audit: {
      actor: input.actor,
      action: "use_case_identity_foundation_applied",
      target: ids.useCaseId,
      details: {
        useCaseNumber: MITCHEL_TREVOR_IDENTITY_TEMPLATE.number,
        membershipCount: 0,
        resourceBindingCount: resources.length,
        secretBoundaryBindingCount: bindings.secretBoundaryBindings.length,
        platformInstanceLinked: false,
        orchestratorTenantBound: false,
      },
    },
  };
}

function buildReadyPlan(
  input: IdentityBackfillInput,
  ids: CanonicalIdentityIds,
): ReadyIdentityBackfillPlan {
  const foundation = buildReadyFoundationPlan(input, ids);
  return {
    ...foundation,
    membership: buildMembership(input, ids.membershipId, ids.useCaseId),
    audit: {
      ...foundation.audit,
      action: "use_case_identity_backfill_applied",
      details: { ...foundation.audit.details, membershipCount: 1 },
    },
  };
}

export function planMitchelTrevorFoundation(
  rawInput: IdentityFoundationInput,
  snapshot: IdentityFoundationSnapshot,
  ids: CanonicalIdentityIds,
): IdentityFoundationPlan {
  const input = foundationInputSchema.parse(rawInput);
  const reasons = foundationBlockingReasons(snapshot);
  if (reasons.length > 0) return { status: "blocked", reasons };
  const plan = buildReadyFoundationPlan(input, ids);

  if (snapshot.existingCanonicalState) {
    if (existingFoundationStateMatches(snapshot.existingCanonicalState, plan)) {
      return {
        status: "verified_noop",
        useCaseId: snapshot.existingCanonicalState.useCase.id,
        runtimeIdentityId: snapshot.existingCanonicalState.runtimeIdentity!.id,
      };
    }
    return { status: "blocked", reasons: ["canonical_state_drift"] };
  }

  return plan;
}

export function planMitchelMembershipActivation(
  rawInput: IdentityBackfillInput,
  snapshot: IdentityBackfillSnapshot,
  membershipId: string,
): MembershipActivationPlan {
  const input = backfillInputSchema.parse(rawInput);
  const reasons = blockingReasons(input, snapshot);
  if (reasons.length > 0) return { status: "blocked", reasons };
  const existing = snapshot.existingCanonicalState;
  if (!existing) {
    return { status: "blocked", reasons: ["canonical_foundation_missing"] };
  }

  const foundation = buildReadyFoundationPlan(input, {
    useCaseId: existing.useCase.id,
    runtimeIdentityId:
      existing.runtimeIdentity?.id ?? "00000000-0000-0000-0000-000000000000",
    personaAssignmentId:
      existing.personaAssignment?.id ?? "00000000-0000-0000-0000-000000000000",
    membershipId,
    resourceBindingIds: existing.resourceBindings.map((binding) => binding.id),
    secretBoundaryBindingIds: existing.secretBoundaryBindings.map(
      (binding) => binding.id,
    ),
  });
  if (!existingFoundationStateMatches(existing, foundation)) {
    return { status: "blocked", reasons: ["canonical_state_drift"] };
  }

  const membership = buildMembership(input, membershipId, existing.useCase.id);
  if (membershipStateMatches(existing, membership)) {
    return { status: "verified_noop", membershipId: existing.membership!.id };
  }
  if (existing.membership) {
    return { status: "blocked", reasons: ["membership_state_drift"] };
  }

  return {
    status: "ready",
    membership,
    audit: {
      actor: input.actor,
      action: "use_case_membership_activated",
      target: existing.useCase.id,
      details: { membershipCount: 1 },
    },
  };
}

export function planMitchelTrevorBackfill(
  rawInput: IdentityBackfillInput,
  snapshot: IdentityBackfillSnapshot,
  ids: CanonicalIdentityIds,
): IdentityBackfillPlan {
  const input = backfillInputSchema.parse(rawInput);
  const reasons = blockingReasons(input, snapshot);
  if (reasons.length > 0) return { status: "blocked", reasons };
  const plan = buildReadyPlan(input, ids);

  if (snapshot.existingCanonicalState) {
    if (
      existingFoundationStateMatches(snapshot.existingCanonicalState, plan) &&
      membershipStateMatches(snapshot.existingCanonicalState, plan.membership)
    ) {
      return {
        status: "verified_noop",
        useCaseId: snapshot.existingCanonicalState.useCase.id,
        runtimeIdentityId: snapshot.existingCanonicalState.runtimeIdentity!.id,
      };
    }
    return { status: "blocked", reasons: ["canonical_state_drift"] };
  }

  return plan;
}
