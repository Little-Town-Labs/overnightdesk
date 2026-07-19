import { z } from "zod";

const boundedId = z.string().min(1).max(512);

const backfillInputSchema = z.object({
  actor: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9:._-]+$/i),
  membershipUserId: boundedId,
  platformInstanceId: boundedId.nullable(),
  orchestratorTenantId: z.string().uuid().nullable(),
});

export interface CanonicalIdentityIds {
  useCaseId: string;
  runtimeIdentityId: string;
  personaAssignmentId: string;
  membershipId: string;
  resourceBindingIds: string[];
  secretBoundaryBindingIds: string[];
}

export interface PlatformIdentityInstance {
  id: string;
  userId: string;
  useCaseId: string | null;
  runtimeIdentityId: string | null;
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
  membershipUser: { id: string } | null;
  platformInstance: PlatformIdentityInstance | null;
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

export interface ReadyIdentityBackfillPlan {
  status: "ready";
  useCase: UseCaseRecord;
  numberAllocation: NumberAllocationRecord;
  runtimeIdentity: RuntimeIdentityRecord;
  personaAssignment: PersonaAssignmentRecord;
  membership: MembershipRecord;
  resourceBindings: ResourceBindingRecord[];
  secretBoundaryBindings: SecretBoundaryBindingRecord[];
  platformInstanceUpdate: {
    id: string;
    useCaseId: string;
    runtimeIdentityId: string;
  } | null;
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

function sortedComparable<T>(values: T[], comparable: (value: T) => object) {
  return values.map(comparable).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
}

function existingStateMatches(
  existing: ExistingCanonicalState,
  expected: ReadyIdentityBackfillPlan
): boolean {
  const {
    runtimeIdentity,
    personaAssignment,
    membership,
    numberAllocation,
  } = existing;
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
    personaAssignment.personaKey ===
      expected.personaAssignment.personaKey &&
    personaAssignment.displayName ===
      expected.personaAssignment.displayName &&
    personaAssignment.isDefault ===
      expected.personaAssignment.isDefault &&
    personaAssignment.authorityProfile ===
      expected.personaAssignment.authorityProfile &&
    personaAssignment.status === expected.personaAssignment.status;
  const membershipMatches =
    membership !== null &&
    membership.useCaseId === existing.useCase.id &&
    membership.runtimeIdentityId === null &&
    membership.userId === expected.membership.userId &&
    membership.role === expected.membership.role &&
    membership.status === expected.membership.status;
  const resourcesMatch =
    JSON.stringify(
      sortedComparable(existing.resourceBindings, comparableResource)
    ) ===
    JSON.stringify(
      sortedComparable(
        expected.resourceBindings.map((binding) => ({
          ...binding,
          useCaseId: existing.useCase.id,
          runtimeIdentityId: runtimeIdentity?.id ?? null,
        })),
        comparableResource
      )
    );
  const secretBoundariesMatch =
    JSON.stringify(
      sortedComparable(
        existing.secretBoundaryBindings,
        comparableSecretBoundary
      )
    ) ===
    JSON.stringify(
      sortedComparable(
        expected.secretBoundaryBindings.map((binding) => ({
          ...binding,
          useCaseId: existing.useCase.id,
          runtimeIdentityId: runtimeIdentity?.id ?? null,
        })),
        comparableSecretBoundary
      )
    );

  return (
    useCaseMatches &&
    allocationMatches &&
    runtimeMatches &&
    personaMatches &&
    membershipMatches &&
    resourcesMatch &&
    secretBoundariesMatch
  );
}

export function planMitchelTrevorBackfill(
  rawInput: IdentityBackfillInput,
  snapshot: IdentityBackfillSnapshot,
  ids: CanonicalIdentityIds
): IdentityBackfillPlan {
  const input = backfillInputSchema.parse(rawInput);
  const reasons: string[] = [];

  if (!snapshot.schemaReady) reasons.push("identity_schema_missing");
  if (snapshot.membershipUser?.id !== input.membershipUserId) {
    reasons.push("membership_user_missing");
  }
  if (input.platformInstanceId && !snapshot.platformInstance) {
    reasons.push("platform_instance_missing");
  }
  if (
    input.platformInstanceId &&
    snapshot.platformInstance &&
    snapshot.platformInstance.userId !== input.membershipUserId
  ) {
    reasons.push("platform_instance_owner_mismatch");
  }
  if (snapshot.platformInstance) {
    const existingUseCaseId = snapshot.existingCanonicalState?.useCase.id;
    const existingRuntimeId =
      snapshot.existingCanonicalState?.runtimeIdentity?.id;
    const linksAreEmpty =
      !snapshot.platformInstance.useCaseId &&
      !snapshot.platformInstance.runtimeIdentityId;
    const linksMatchExisting =
      snapshot.platformInstance.useCaseId === existingUseCaseId &&
      snapshot.platformInstance.runtimeIdentityId === existingRuntimeId;
    if (!linksAreEmpty && !linksMatchExisting) {
      reasons.push("platform_instance_already_linked");
    }
  }

  if (reasons.length > 0) return { status: "blocked", reasons };

  const dynamicResources = [
    ...(input.platformInstanceId
      ? [
          {
            provider: "better_auth",
            kind: "platform_instance" as const,
            value: input.platformInstanceId,
            state: "active" as const,
          },
        ]
      : []),
    ...(input.orchestratorTenantId
      ? [
          {
            provider: "orchestrator",
            kind: "orchestrator_tenant" as const,
            value: input.orchestratorTenantId,
            state: "active" as const,
          },
        ]
      : []),
  ];
  const resourceTemplates = [
    ...MITCHEL_TREVOR_IDENTITY_TEMPLATE.resourceBindings,
    ...dynamicResources,
  ];

  if (
    ids.resourceBindingIds.length !== resourceTemplates.length ||
    ids.secretBoundaryBindingIds.length !==
      MITCHEL_TREVOR_IDENTITY_TEMPLATE.secretBoundaryBindings.length
  ) {
    throw new Error("Generated identity ID counts do not match the manifest");
  }

  const plan: ReadyIdentityBackfillPlan = {
    status: "ready",
    useCase: {
      id: ids.useCaseId,
      ...MITCHEL_TREVOR_IDENTITY_TEMPLATE.useCase,
    },
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
    membership: {
      id: ids.membershipId,
      useCaseId: ids.useCaseId,
      runtimeIdentityId: null,
      userId: input.membershipUserId,
      role: "owner",
      status: "active",
      grantedBy: input.actor,
    },
    resourceBindings: resourceTemplates.map((binding, index) => ({
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
        })
      ),
    platformInstanceUpdate: input.platformInstanceId
      ? {
          id: input.platformInstanceId,
          useCaseId: ids.useCaseId,
          runtimeIdentityId: ids.runtimeIdentityId,
        }
      : null,
    audit: {
      actor: input.actor,
      action: "use_case_identity_backfill_applied",
      target: ids.useCaseId,
      details: {
        useCaseNumber: MITCHEL_TREVOR_IDENTITY_TEMPLATE.number,
        membershipCount: 1,
        resourceBindingCount: resourceTemplates.length,
        secretBoundaryBindingCount:
          MITCHEL_TREVOR_IDENTITY_TEMPLATE.secretBoundaryBindings.length,
        platformInstanceLinked: Boolean(input.platformInstanceId),
        orchestratorTenantBound: Boolean(input.orchestratorTenantId),
      },
    },
  };

  if (snapshot.existingCanonicalState) {
    if (existingStateMatches(snapshot.existingCanonicalState, plan)) {
      return {
        status: "verified_noop",
        useCaseId: snapshot.existingCanonicalState.useCase.id,
        runtimeIdentityId:
          snapshot.existingCanonicalState.runtimeIdentity!.id,
      };
    }
    return { status: "blocked", reasons: ["canonical_state_drift"] };
  }

  return plan;
}
