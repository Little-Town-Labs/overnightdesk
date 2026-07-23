import { randomUUID } from "node:crypto";
import { and, eq, ne, or, sql } from "drizzle-orm";
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
} from "@/lib/dashboard-identity-binding-reconciliation";
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
  const [identities, bindings] = await Promise.all([
    readCanonicalIdentity(database, template),
    readDashboardBindings(database, descriptors),
  ]);
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
        ne(resourceBinding.state, "retired"),
        or(
          ...descriptors.map((descriptor) =>
            and(
              eq(resourceBinding.provider, descriptor.provider),
              eq(resourceBinding.kind, descriptor.kind),
              eq(resourceBinding.value, descriptor.value),
            ),
          ),
        ),
      ),
    );
}

async function applyOneOrTwoBindings(
  plan: ReadyPlan,
  actor: string,
  database: Database,
) {
  const values = plan.bindings.map((binding) => ({
    id: randomUUID(),
    useCaseId: plan.useCaseId,
    runtimeIdentityId: plan.runtimeIdentityId,
    ...binding,
  }));
  const audit = database.insert(platformAuditLog).values({
    actor,
    action: "canonical_dashboard_bindings_reconciled",
    target: "canonical-dashboard-bindings",
    details: { bindingCount: values.length },
  });
  if (values.length === 1) {
    await database.batch([
      database.insert(resourceBinding).values(values[0]),
      audit,
    ] as const);
    return;
  }
  await database.batch([
    database.insert(resourceBinding).values(values[0]),
    database.insert(resourceBinding).values(values[1]),
    audit,
  ] as const);
}

export function createDashboardIdentityBindingGateway(
  template: CanonicalIdentityTemplate,
  descriptors: DashboardIdentityBindingDescriptor[],
  database: Database = db,
): DashboardIdentityBindingReconciliationGateway {
  return {
    inspect: () =>
      inspectDashboardIdentityBindings(template, descriptors, database),
    apply: (plan, actor) => applyOneOrTwoBindings(plan, actor, database),
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
  requireDashboardIdentityBindingConfirmation(options.confirmation);
  const actor = options.actor?.trim();
  if (!actor) throw new Error("Dashboard identity binding actor is required");
  if (!options.privateRuntimeQualified) {
    throw new Error("Private Titus dashboard runtime is not qualified");
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
