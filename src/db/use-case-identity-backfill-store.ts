import { randomUUID } from "node:crypto";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  personaAssignment,
  platformAuditLog,
  resourceBinding,
  runtimeIdentity,
  secretBoundaryBinding,
  useCase,
  useCaseMembership,
  useCaseNumberAllocation,
  user,
} from "@/db/schema";
import {
  MITCHEL_TREVOR_IDENTITY_TEMPLATE,
  type CanonicalIdentityIds,
  type ExistingCanonicalState,
  type IdentityBackfillInput,
  type IdentityBackfillSnapshot,
  type ReadyIdentityBackfillPlan,
} from "@/lib/use-case-identity-backfill";
import { createDrizzleCanonicalIdentityStore } from "@/lib/canonical-identity-store";
import type { CanonicalIdentitySelector } from "@/lib/canonical-identity";

type Database = typeof db;

async function identitySchemaReady(database: Database): Promise<boolean> {
  const result = await database.execute(
    sql<{ ready: boolean }>`
      SELECT
        to_regclass('public.use_case') IS NOT NULL
        AND to_regclass('public.use_case_number_allocation') IS NOT NULL
        AND to_regclass('public.runtime_identity') IS NOT NULL
        AND to_regclass('public.persona_assignment') IS NOT NULL
        AND to_regclass('public.use_case_membership') IS NOT NULL
        AND to_regclass('public.resource_binding') IS NOT NULL
        AND to_regclass('public.secret_boundary_binding') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'instance'
            AND column_name = 'use_case_id'
        )
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'instance'
            AND column_name = 'runtime_identity_id'
        ) AS ready
    `,
  );
  return result.rows[0]?.ready === true;
}

async function readMembershipUser(
  database: Database,
  userId: string,
): Promise<{ id: string; emailVerified: boolean } | null> {
  const rows = await database
    .select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

const useCaseSelection = {
  id: useCase.id,
  slug: useCase.slug,
  displayName: useCase.displayName,
  status: useCase.status,
};

async function readUseCaseBySlug(database: Database) {
  const rows = await database
    .select(useCaseSelection)
    .from(useCase)
    .where(eq(useCase.slug, MITCHEL_TREVOR_IDENTITY_TEMPLATE.useCase.slug))
    .limit(1);
  return rows[0] ?? null;
}

async function readUseCaseByNumber(database: Database) {
  const rows = await database
    .select(useCaseSelection)
    .from(useCaseNumberAllocation)
    .innerJoin(useCase, eq(useCaseNumberAllocation.useCaseId, useCase.id))
    .where(
      eq(
        useCaseNumberAllocation.number,
        MITCHEL_TREVOR_IDENTITY_TEMPLATE.number,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function readRuntimeBySlug(database: Database) {
  const rows = await database
    .select({
      id: runtimeIdentity.id,
      useCaseId: runtimeIdentity.useCaseId,
      slug: runtimeIdentity.slug,
      memoryBoundaryKind: runtimeIdentity.memoryBoundaryKind,
      status: runtimeIdentity.status,
    })
    .from(runtimeIdentity)
    .where(
      eq(runtimeIdentity.slug, MITCHEL_TREVOR_IDENTITY_TEMPLATE.runtime.slug),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function readIdentityRoots(database: Database) {
  const resourcePredicates =
    MITCHEL_TREVOR_IDENTITY_TEMPLATE.resourceBindings.map((binding) =>
      and(
        eq(resourceBinding.provider, binding.provider),
        eq(resourceBinding.kind, binding.kind),
        eq(resourceBinding.value, binding.value),
      ),
    );
  const [slugUseCase, numberUseCase, runtime, bindingOwners] =
    await Promise.all([
      readUseCaseBySlug(database),
      readUseCaseByNumber(database),
      readRuntimeBySlug(database),
      database
        .select({
          useCaseId: resourceBinding.useCaseId,
          runtimeIdentityId: resourceBinding.runtimeIdentityId,
        })
        .from(resourceBinding)
        .where(
          and(ne(resourceBinding.state, "retired"), or(...resourcePredicates)),
        ),
    ]);
  return {
    slugUseCase,
    numberUseCase,
    runtime,
    bindingOwners,
  };
}

function rootsConflict(roots: Awaited<ReturnType<typeof readIdentityRoots>>) {
  const { slugUseCase, numberUseCase, runtime } = roots;
  if (slugUseCase && numberUseCase && slugUseCase.id !== numberUseCase.id) {
    return true;
  }
  if (
    numberUseCase &&
    numberUseCase.slug !== MITCHEL_TREVOR_IDENTITY_TEMPLATE.useCase.slug
  ) {
    return true;
  }
  const selectedUseCase = slugUseCase ?? numberUseCase;
  if (
    runtime &&
    (!selectedUseCase || runtime.useCaseId !== selectedUseCase.id)
  ) {
    return true;
  }
  if (
    roots.bindingOwners.some(
      (owner) =>
        !selectedUseCase ||
        !runtime ||
        owner.useCaseId !== selectedUseCase.id ||
        owner.runtimeIdentityId !== runtime.id,
    )
  ) {
    return true;
  }
  return false;
}

async function readNumberAllocation(database: Database, useCaseId: string) {
  const rows = await database
    .select({
      number: useCaseNumberAllocation.number,
      useCaseId: useCaseNumberAllocation.useCaseId,
      allocatedBy: useCaseNumberAllocation.allocatedBy,
    })
    .from(useCaseNumberAllocation)
    .where(eq(useCaseNumberAllocation.useCaseId, useCaseId))
    .limit(1);
  return rows[0] ?? null;
}

async function readPersona(
  database: Database,
  runtime: NonNullable<Awaited<ReturnType<typeof readRuntimeBySlug>>>,
) {
  const rows = await database
    .select({
      id: personaAssignment.id,
      runtimeIdentityId: personaAssignment.runtimeIdentityId,
      personaKey: personaAssignment.personaKey,
      displayName: personaAssignment.displayName,
      isDefault: personaAssignment.isDefault,
      authorityProfile: personaAssignment.authorityProfile,
      status: personaAssignment.status,
    })
    .from(personaAssignment)
    .where(
      and(
        eq(personaAssignment.runtimeIdentityId, runtime.id),
        eq(
          personaAssignment.personaKey,
          MITCHEL_TREVOR_IDENTITY_TEMPLATE.persona.personaKey,
        ),
        ne(personaAssignment.status, "retired"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function readMembership(
  database: Database,
  membershipUserId: string,
  useCaseId: string,
) {
  const rows = await database
    .select({
      id: useCaseMembership.id,
      useCaseId: useCaseMembership.useCaseId,
      runtimeIdentityId: useCaseMembership.runtimeIdentityId,
      userId: useCaseMembership.userId,
      role: useCaseMembership.role,
      status: useCaseMembership.status,
      grantedBy: useCaseMembership.grantedBy,
    })
    .from(useCaseMembership)
    .where(
      and(
        eq(useCaseMembership.useCaseId, useCaseId),
        eq(useCaseMembership.userId, membershipUserId),
        isNull(useCaseMembership.runtimeIdentityId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function readResourceBindings(
  database: Database,
  useCaseId: string,
  runtimeId: string,
) {
  return database
    .select({
      id: resourceBinding.id,
      useCaseId: resourceBinding.useCaseId,
      runtimeIdentityId: resourceBinding.runtimeIdentityId,
      provider: resourceBinding.provider,
      kind: resourceBinding.kind,
      value: resourceBinding.value,
      state: resourceBinding.state,
    })
    .from(resourceBinding)
    .where(
      and(
        eq(resourceBinding.useCaseId, useCaseId),
        eq(resourceBinding.runtimeIdentityId, runtimeId),
        ne(resourceBinding.state, "retired"),
      ),
    );
}

async function readSecretBoundaries(
  database: Database,
  useCaseId: string,
  runtimeId: string,
) {
  return database
    .select({
      id: secretBoundaryBinding.id,
      useCaseId: secretBoundaryBinding.useCaseId,
      runtimeIdentityId: secretBoundaryBinding.runtimeIdentityId,
      phaseApp: secretBoundaryBinding.phaseApp,
      environment: secretBoundaryBinding.environment,
      pathIdentifier: secretBoundaryBinding.pathIdentifier,
    })
    .from(secretBoundaryBinding)
    .where(
      and(
        eq(secretBoundaryBinding.useCaseId, useCaseId),
        eq(secretBoundaryBinding.runtimeIdentityId, runtimeId),
      ),
    );
}

async function readExistingState(
  database: Database,
  membershipUserId: string,
  roots: Awaited<ReturnType<typeof readIdentityRoots>>,
): Promise<ExistingCanonicalState | null> {
  const selectedUseCase = roots.slugUseCase ?? roots.numberUseCase;
  if (!selectedUseCase) return null;
  const runtime = roots.runtime;
  const [numberAllocation, persona, membership, bindings, secretBoundaries] =
    await Promise.all([
      readNumberAllocation(database, selectedUseCase.id),
      runtime ? readPersona(database, runtime) : Promise.resolve(null),
      readMembership(database, membershipUserId, selectedUseCase.id),
      runtime
        ? readResourceBindings(database, selectedUseCase.id, runtime.id)
        : Promise.resolve([]),
      runtime
        ? readSecretBoundaries(database, selectedUseCase.id, runtime.id)
        : Promise.resolve([]),
    ]);

  return {
    useCase: selectedUseCase,
    numberAllocation,
    runtimeIdentity: runtime,
    personaAssignment: persona,
    membership,
    resourceBindings: bindings,
    secretBoundaryBindings: secretBoundaries,
  };
}

export function generateMitchelTrevorIdentityIds(): CanonicalIdentityIds {
  const resourceCount =
    MITCHEL_TREVOR_IDENTITY_TEMPLATE.resourceBindings.length;
  return {
    useCaseId: randomUUID(),
    runtimeIdentityId: randomUUID(),
    personaAssignmentId: randomUUID(),
    membershipId: randomUUID(),
    resourceBindingIds: Array.from({ length: resourceCount }, () =>
      randomUUID(),
    ),
    secretBoundaryBindingIds:
      MITCHEL_TREVOR_IDENTITY_TEMPLATE.secretBoundaryBindings.map(() =>
        randomUUID(),
      ),
  };
}

export async function inspectMitchelTrevorIdentityBackfill(
  input: IdentityBackfillInput,
  database: Database = db,
): Promise<IdentityBackfillSnapshot> {
  const schemaReady = await identitySchemaReady(database);
  const membershipUser = await readMembershipUser(
    database,
    input.membershipUserId,
  );
  if (!schemaReady) {
    return {
      schemaReady,
      membershipUser,
      canonicalConflict: false,
      existingCanonicalState: null,
    };
  }

  const roots = await readIdentityRoots(database);
  return {
    schemaReady,
    membershipUser,
    canonicalConflict: rootsConflict(roots),
    existingCanonicalState: await readExistingState(
      database,
      input.membershipUserId,
      roots,
    ),
  };
}

export async function applyIdentityBackfillPlan(
  plan: ReadyIdentityBackfillPlan,
  database: Database = db,
): Promise<void> {
  const statements = [
    database.insert(useCase).values(plan.useCase),
    database.insert(useCaseNumberAllocation).values(plan.numberAllocation),
    database.insert(runtimeIdentity).values(plan.runtimeIdentity),
    database.insert(personaAssignment).values(plan.personaAssignment),
    database.insert(useCaseMembership).values({
      ...plan.membership,
      activatedAt: new Date(),
    }),
    database.insert(resourceBinding).values(plan.resourceBindings),
    database.insert(secretBoundaryBinding).values(plan.secretBoundaryBindings),
    database.insert(platformAuditLog).values(plan.audit),
  ] as const;

  await database.batch(statements);
}

export async function verifyMitchelTrevorCanonicalSelectors(
  expectedUseCaseId: string,
  expectedRuntimeIdentityId: string,
  database: Database = db,
): Promise<{ checked: number; matched: number; mismatches: string[] }> {
  const checks: Array<{
    label: string;
    selector: CanonicalIdentitySelector;
    expectedRuntimeId: string | null;
  }> = [
    {
      label: "use_case_number",
      selector: {
        type: "use_case_number",
        value: MITCHEL_TREVOR_IDENTITY_TEMPLATE.number,
      },
      expectedRuntimeId: null,
    },
    ...MITCHEL_TREVOR_IDENTITY_TEMPLATE.resourceBindings
      .filter((binding) =>
        ["container", "volume", "hostname"].includes(binding.kind),
      )
      .map((binding) => ({
        label: `${binding.provider}:${binding.kind}`,
        selector: {
          type: "resource_binding" as const,
          provider: binding.provider,
          kind: binding.kind,
          value: binding.value,
        },
        expectedRuntimeId: expectedRuntimeIdentityId,
      })),
  ];
  const store = createDrizzleCanonicalIdentityStore(database);
  const mismatches: string[] = [];
  for (const check of checks) {
    const resolved = await store.resolve(check.selector);
    if (
      resolved?.useCaseId !== expectedUseCaseId ||
      resolved.runtimeId !== check.expectedRuntimeId
    ) {
      mismatches.push(check.label);
    }
  }
  return {
    checked: checks.length,
    matched: checks.length - mismatches.length,
    mismatches,
  };
}
