import { randomUUID } from "node:crypto";
import { and, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  platformAuditLog,
  resourceBinding,
  runtimeIdentity,
  useCase,
} from "@/db/schema";
import {
  dashboardIdentityBindingDescriptorContractValid,
  planDashboardIdentityBindingReconciliation,
  requireDashboardIdentityBindingConfirmation,
  summarizeDashboardIdentityBindingReconciliation,
  type DashboardIdentityBindingDescriptor,
  type DashboardIdentityBindingPlan,
  type DashboardIdentityBindingSnapshot,
  type DashboardIdentityBindingTarget,
} from "@/lib/dashboard-identity-binding-reconciliation";
import { requireAuditActor } from "@/lib/audit-actor";
import type { CanonicalIdentityTemplate } from "@/lib/use-case-identity-templates";

type Database = typeof db;
type ReadyPlan = Extract<DashboardIdentityBindingPlan, { status: "ready" }>;
export type DashboardIdentityBindingCommand = "plan" | "apply" | "verify";

export interface DashboardIdentityBindingReconciliationGateway {
  inspect(): Promise<DashboardIdentityBindingSnapshot>;
  apply(plan: ReadyPlan, actor: string): Promise<void>;
}

export interface DashboardIdentityBindingReconciliationOptions {
  actor?: string;
  confirmation?: string;
  target?: DashboardIdentityBindingTarget;
  privateRuntimeQualified?: boolean;
}

async function dashboardIdentityBindingSchemaReady(database: Database) {
  const result = await database.execute(
    sql<{ ready: boolean }>`
      SELECT
        to_regclass('public.use_case') IS NOT NULL
        AND to_regclass('public.runtime_identity') IS NOT NULL
        AND to_regclass('public.resource_binding') IS NOT NULL
        AND to_regclass('public.platform_audit_log') IS NOT NULL AS ready
    `,
  );
  return result.rows[0]?.ready === true;
}

export async function inspectDashboardIdentityBindings(
  template: CanonicalIdentityTemplate,
  descriptors: DashboardIdentityBindingDescriptor[],
  database: Database = db,
): Promise<DashboardIdentityBindingSnapshot> {
  if (!dashboardIdentityBindingDescriptorContractValid(descriptors)) {
    throw new Error("Invalid dashboard identity binding descriptor contract");
  }
  const schemaReady = await dashboardIdentityBindingSchemaReady(database);
  if (!schemaReady) return { schemaReady: false, identities: [], bindings: [] };
  const identities = await readCanonicalIdentity(database, template);
  const bindings = await readDashboardBindings(
    database,
    descriptors,
    identities.length === 1 ? identities[0] : null,
  );
  return { schemaReady, identities, bindings };
}

function readCanonicalIdentity(
  database: Database,
  template: CanonicalIdentityTemplate,
) {
  return database
    .select({
      useCaseId: useCase.id,
      runtimeIdentityId: runtimeIdentity.id,
    })
    .from(useCase)
    .innerJoin(runtimeIdentity, eq(runtimeIdentity.useCaseId, useCase.id))
    .where(
      and(
        eq(useCase.slug, template.useCase.slug),
        eq(useCase.status, "active"),
        eq(runtimeIdentity.slug, template.runtime.slug),
        eq(runtimeIdentity.status, "active"),
      ),
    );
}

function readDashboardBindings(
  database: Database,
  descriptors: DashboardIdentityBindingDescriptor[],
  identity: { useCaseId: string; runtimeIdentityId: string } | null,
) {
  const exactIdentifiers = descriptors.map((descriptor) =>
    and(
      eq(resourceBinding.provider, descriptor.provider),
      eq(resourceBinding.kind, descriptor.kind),
      eq(resourceBinding.value, descriptor.value),
    ),
  );
  const sameScopeDashboardBindings = identity
    ? and(
        eq(resourceBinding.useCaseId, identity.useCaseId),
        eq(resourceBinding.runtimeIdentityId, identity.runtimeIdentityId),
        or(
          ...descriptors.map((descriptor) =>
            and(
              eq(resourceBinding.provider, descriptor.provider),
              eq(resourceBinding.kind, descriptor.kind),
            ),
          ),
        ),
      )
    : undefined;
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
        ne(resourceBinding.state, "retired"),
        or(
          ...exactIdentifiers,
          ...(sameScopeDashboardBindings ? [sameScopeDashboardBindings] : []),
        ),
      ),
    );
}

function atomicDashboardBindingStatement(plan: ReadyPlan, actor: string) {
  const values = plan.bindings.map((binding) => ({
    id: randomUUID(),
    useCaseId: plan.useCaseId,
    runtimeIdentityId: plan.runtimeIdentityId,
    ...binding,
  }));
  const updates = plan.bindingStateUpdates ?? [];
  const mutations: SQL[] = [];
  const countChecks: SQL[] = [];

  for (const [index, update] of updates.entries()) {
    const name = `updated_${index}`;
    mutations.push(sql`${sql.raw(name)} AS (
      UPDATE ${resourceBinding}
      SET
        state = ${update.state},
        updated_at = NOW()
      WHERE
        ${resourceBinding.id} = ${update.bindingId}
        AND ${resourceBinding.useCaseId} = ${plan.useCaseId}
        AND ${resourceBinding.runtimeIdentityId} = ${plan.runtimeIdentityId}
        AND ${resourceBinding.provider} = ${update.provider}
        AND ${resourceBinding.kind} = ${update.kind}
        AND ${resourceBinding.value} = ${update.value}
        AND ${resourceBinding.state} = ${update.expectedState}
      RETURNING id
    )`);
    countChecks.push(
      sql`(SELECT COUNT(*) FROM ${sql.raw(name)}) = 1`,
    );
  }

  if (values.length > 0) {
    mutations.push(sql`inserted AS (
      INSERT INTO ${resourceBinding} (
        id,
        use_case_id,
        runtime_identity_id,
        provider,
        kind,
        value,
        state
      )
      VALUES ${sql.join(
        values.map(
          (value) =>
            sql`(${value.id}, ${value.useCaseId}, ${value.runtimeIdentityId}, ${value.provider}, ${value.kind}, ${value.value}, ${value.state})`,
        ),
        sql`, `,
      )}
      RETURNING id
    )`);
    countChecks.push(sql`(SELECT COUNT(*) FROM inserted) = ${values.length}`);
  }

  mutations.push(sql`audited AS (
    INSERT INTO ${platformAuditLog} (
      actor,
      action,
      target,
      details
    )
    VALUES (
      ${actor},
      ${"canonical_dashboard_bindings_reconciled"},
      ${"canonical-dashboard-bindings"},
      ${JSON.stringify({
        bindingCount: values.length + updates.length,
        bindingsCreated: values.length,
        bindingsActivated: updates.length,
      })}::jsonb
    )
    RETURNING id
  )`);
  countChecks.push(sql`(SELECT COUNT(*) FROM audited) = 1`);

  return sql`
    WITH ${sql.join(mutations, sql`, `)}
    SELECT 1 / CASE
      WHEN ${sql.join(countChecks, sql` AND `)} THEN 1
      ELSE 0
    END AS applied
  `;
}

async function applyBindingChanges(
  plan: ReadyPlan,
  actor: string,
  database: Database,
) {
  await database.execute(atomicDashboardBindingStatement(plan, actor));
}

export function createDashboardIdentityBindingGateway(
  template: CanonicalIdentityTemplate,
  descriptors: DashboardIdentityBindingDescriptor[],
  database: Database = db,
): DashboardIdentityBindingReconciliationGateway {
  return {
    inspect: () =>
      inspectDashboardIdentityBindings(template, descriptors, database),
    apply: (plan, actor) => applyBindingChanges(plan, actor, database),
  };
}

async function inspectSafely(
  gateway: DashboardIdentityBindingReconciliationGateway,
) {
  try {
    return await gateway.inspect();
  } catch {
    throw new Error("Dashboard identity binding inspection failed");
  }
}

function requireApplyActor(
  options: DashboardIdentityBindingReconciliationOptions,
) {
  if (!options.target) {
    throw new Error("Dashboard identity binding target is required");
  }
  requireDashboardIdentityBindingConfirmation(
    options.target,
    options.confirmation,
  );
  const actor = requireAuditActor(options.actor);
  if (!options.privateRuntimeQualified) {
    throw new Error("Private dashboard runtime is not qualified");
  }
  return actor;
}

async function applyAndVerify(
  before: ReadyPlan,
  actor: string,
  descriptors: DashboardIdentityBindingDescriptor[],
  gateway: DashboardIdentityBindingReconciliationGateway,
) {
  let applyFailed = false;
  try {
    await gateway.apply(before, actor);
  } catch {
    applyFailed = true;
  }
  const after = planDashboardIdentityBindingReconciliation(
    await inspectSafely(gateway),
    descriptors,
  );
  if (after.status === "verified_noop") {
    return summarizeDashboardIdentityBindingReconciliation(after);
  }
  if (applyFailed) {
    throw new Error("Dashboard identity binding reconciliation apply failed");
  }
  throw new Error("Dashboard identity binding reconciliation did not verify");
}

export async function executeDashboardIdentityBindingReconciliation(
  command: DashboardIdentityBindingCommand,
  descriptors: DashboardIdentityBindingDescriptor[],
  options: DashboardIdentityBindingReconciliationOptions,
  gateway: DashboardIdentityBindingReconciliationGateway,
) {
  const before = planDashboardIdentityBindingReconciliation(
    await inspectSafely(gateway),
    descriptors,
  );
  if (command === "plan") {
    return summarizeDashboardIdentityBindingReconciliation(before);
  }
  if (command === "verify") {
    if (before.status !== "verified_noop") {
      throw new Error("Dashboard identity bindings are not verified");
    }
    return summarizeDashboardIdentityBindingReconciliation(before);
  }
  if (before.status === "blocked") {
    throw new Error("Dashboard identity binding reconciliation is blocked");
  }
  if (before.status === "verified_noop") {
    return summarizeDashboardIdentityBindingReconciliation(before);
  }
  return applyAndVerify(
    before,
    requireApplyActor(options),
    descriptors,
    gateway,
  );
}
