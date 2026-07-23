import { and, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  instance,
  platformAuditLog,
  resourceBinding,
  runtimeIdentity,
  useCase,
  useCaseMembership,
} from "@/db/schema";
import {
  planDashboardInstanceReconciliation,
  requireDashboardAssignmentConfirmation,
  summarizeDashboardInstanceReconciliation,
  type DashboardInstanceDescriptor,
  type DashboardInstanceReconciliationPlan,
  type DashboardInstanceReconciliationSnapshot,
} from "@/lib/dashboard-instance-reconciliation";
import type { CanonicalIdentityTemplate } from "@/lib/use-case-identity-templates";

type Database = typeof db;
type ReadyPlan = Extract<
  DashboardInstanceReconciliationPlan,
  { status: "ready" }
>;
export type DashboardInstanceReconciliationCommand = "plan" | "apply" | "verify";

export interface DashboardInstanceReconciliationGateway {
  inspect(): Promise<DashboardInstanceReconciliationSnapshot>;
  apply(plan: ReadyPlan, actor: string): Promise<void>;
}

export interface DashboardInstanceReconciliationOptions {
  actor?: string;
  confirmation?: string;
  now?: Date;
}

async function dashboardAssignmentSchemaReady(database: Database) {
  const result = await database.execute(
    sql<{ ready: boolean }>`
      SELECT
        to_regclass('public.use_case') IS NOT NULL
        AND to_regclass('public.runtime_identity') IS NOT NULL
        AND to_regclass('public.use_case_membership') IS NOT NULL
        AND to_regclass('public.resource_binding') IS NOT NULL
        AND to_regclass('public.instance') IS NOT NULL
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

export async function inspectDashboardInstanceReconciliation(
  template: CanonicalIdentityTemplate,
  descriptor: DashboardInstanceDescriptor,
  privateRuntimeQualified: boolean,
  database: Database = db,
): Promise<DashboardInstanceReconciliationSnapshot> {
  const schemaReady = await dashboardAssignmentSchemaReady(database);
  if (!schemaReady) {
    return {
      schemaReady: false,
      privateRuntimeQualified,
      identities: [],
      memberships: [],
      platformBindings: [],
      hostnameBindings: [],
      candidates: [],
    };
  }

  const identities = await database
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
  const identity = identities.length === 1 ? identities[0] : null;

  const [memberships, platformBindings, hostnameBindings, candidates] =
    await Promise.all([
      identity
        ? database
            .select({
              useCaseId: useCaseMembership.useCaseId,
              runtimeIdentityId: useCaseMembership.runtimeIdentityId,
              userId: useCaseMembership.userId,
              role: useCaseMembership.role,
              status: useCaseMembership.status,
              expiresAt: useCaseMembership.expiresAt,
              suspendedAt: useCaseMembership.suspendedAt,
              revokedAt: useCaseMembership.revokedAt,
            })
            .from(useCaseMembership)
            .where(eq(useCaseMembership.useCaseId, identity.useCaseId))
        : Promise.resolve([]),
      database
        .select({
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
            eq(resourceBinding.provider, "overnightdesk"),
            eq(resourceBinding.kind, "platform_instance"),
            eq(resourceBinding.value, descriptor.tenantId),
            ne(resourceBinding.state, "retired"),
          ),
        ),
      database
        .select({
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
            eq(resourceBinding.provider, "nginx"),
            eq(resourceBinding.kind, "hostname"),
            eq(resourceBinding.value, descriptor.hostname),
            ne(resourceBinding.state, "retired"),
          ),
        ),
      database
        .select({
          id: instance.id,
          userId: instance.userId,
          tenantId: instance.tenantId,
          useCaseId: instance.useCaseId,
          runtimeIdentityId: instance.runtimeIdentityId,
          status: instance.status,
          containerId: instance.containerId,
          subdomain: instance.subdomain,
          dashboardTokenHash: instance.dashboardTokenHash,
          engineApiKey: instance.engineApiKey,
          phaseServiceToken: instance.phaseServiceToken,
        })
        .from(instance)
        .where(
          or(
            eq(instance.tenantId, descriptor.tenantId),
            eq(instance.subdomain, descriptor.hostname),
            eq(instance.containerId, descriptor.containerId),
          ),
        ),
    ]);

  return {
    schemaReady,
    privateRuntimeQualified,
    identities,
    memberships,
    platformBindings,
    hostnameBindings,
    candidates,
  };
}

export async function applyDashboardInstanceReconciliation(
  plan: ReadyPlan,
  actor: string,
  database: Database = db,
): Promise<void> {
  await database.execute(sql`
    WITH created AS (
      INSERT INTO ${instance} (
        user_id,
        tenant_id,
        use_case_id,
        runtime_identity_id,
        status,
        container_id,
        subdomain,
        dashboard_token_hash,
        engine_api_key,
        phase_service_token
      )
      SELECT
        ${plan.ownerId},
        ${plan.tenantId},
        ${plan.useCaseId},
        ${plan.runtimeIdentityId},
        'running',
        ${plan.containerId},
        ${plan.hostname},
        NULL,
        NULL,
        NULL
      WHERE EXISTS (
        SELECT 1
        FROM ${useCase}
        INNER JOIN ${runtimeIdentity}
          ON ${runtimeIdentity.useCaseId} = ${useCase.id}
        WHERE ${useCase.id} = ${plan.useCaseId}
          AND ${useCase.status} = 'active'
          AND ${runtimeIdentity.id} = ${plan.runtimeIdentityId}
          AND ${runtimeIdentity.status} = 'active'
      )
      AND 1 = (
        SELECT COUNT(DISTINCT membership.user_id)::int
        FROM ${useCaseMembership} membership
        WHERE membership.use_case_id = ${plan.useCaseId}
          AND (
            membership.runtime_identity_id IS NULL
            OR membership.runtime_identity_id = ${plan.runtimeIdentityId}
          )
          AND membership.role = 'owner'
          AND membership.status = 'active'
          AND membership.suspended_at IS NULL
          AND membership.revoked_at IS NULL
          AND (membership.expires_at IS NULL OR membership.expires_at > NOW())
      )
      AND EXISTS (
        SELECT 1
        FROM ${useCaseMembership} membership
        WHERE membership.use_case_id = ${plan.useCaseId}
          AND membership.user_id = ${plan.ownerId}
          AND (
            membership.runtime_identity_id IS NULL
            OR membership.runtime_identity_id = ${plan.runtimeIdentityId}
          )
          AND membership.role = 'owner'
          AND membership.status = 'active'
          AND membership.suspended_at IS NULL
          AND membership.revoked_at IS NULL
          AND (membership.expires_at IS NULL OR membership.expires_at > NOW())
      )
      AND 1 = (
        SELECT COUNT(*)::int
        FROM ${resourceBinding} binding
        WHERE binding.use_case_id = ${plan.useCaseId}
          AND binding.runtime_identity_id = ${plan.runtimeIdentityId}
          AND binding.provider = 'overnightdesk'
          AND binding.kind = 'platform_instance'
          AND binding.value = ${plan.tenantId}
          AND binding.state = 'active'
      )
      AND 1 = (
        SELECT COUNT(*)::int
        FROM ${resourceBinding} binding
        WHERE binding.use_case_id = ${plan.useCaseId}
          AND binding.runtime_identity_id = ${plan.runtimeIdentityId}
          AND binding.provider = 'nginx'
          AND binding.kind = 'hostname'
          AND binding.value = ${plan.hostname}
          AND binding.state = 'active'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ${instance} candidate
        WHERE candidate.tenant_id = ${plan.tenantId}
          OR candidate.subdomain = ${plan.hostname}
          OR candidate.container_id = ${plan.containerId}
      )
      RETURNING id
    ), audited AS (
      INSERT INTO ${platformAuditLog} (actor, action, target, details)
      SELECT
        ${actor},
        'canonical_dashboard_assignment_created',
        'canonical-dashboard-assignment',
        jsonb_build_object('assignmentCount', 1)
      FROM created
    )
    SELECT COUNT(*)::int AS created_count FROM created
  `);
}

export function createDashboardInstanceReconciliationGateway(
  template: CanonicalIdentityTemplate,
  descriptor: DashboardInstanceDescriptor,
  privateRuntimeQualified: boolean,
  database: Database = db,
): DashboardInstanceReconciliationGateway {
  return {
    inspect: () =>
      inspectDashboardInstanceReconciliation(
        template,
        descriptor,
        privateRuntimeQualified,
        database,
      ),
    apply: (plan, actor) =>
      applyDashboardInstanceReconciliation(plan, actor, database),
  };
}

async function inspectSafely(gateway: DashboardInstanceReconciliationGateway) {
  try {
    return await gateway.inspect();
  } catch {
    throw new Error("Dashboard assignment inspection failed");
  }
}

export async function executeDashboardInstanceReconciliation(
  command: DashboardInstanceReconciliationCommand,
  descriptor: DashboardInstanceDescriptor,
  options: DashboardInstanceReconciliationOptions,
  gateway: DashboardInstanceReconciliationGateway,
) {
  const before = planDashboardInstanceReconciliation(
    await inspectSafely(gateway),
    descriptor,
    { now: options.now },
  );

  if (command === "plan") {
    return summarizeDashboardInstanceReconciliation(before);
  }
  if (command === "verify") {
    if (before.status !== "verified_noop") {
      throw new Error("Dashboard assignment is not verified");
    }
    return summarizeDashboardInstanceReconciliation(before);
  }
  if (before.status === "blocked") {
    throw new Error("Dashboard assignment is blocked");
  }
  if (before.status === "verified_noop") {
    return summarizeDashboardInstanceReconciliation(before);
  }

  requireDashboardAssignmentConfirmation(options.confirmation);
  const actor = options.actor?.trim();
  if (!actor) throw new Error("Dashboard assignment actor is required");

  let applyFailed = false;
  try {
    await gateway.apply(before, actor);
  } catch {
    applyFailed = true;
  }

  const after = planDashboardInstanceReconciliation(
    await inspectSafely(gateway),
    descriptor,
    { now: options.now },
  );
  if (after.status === "verified_noop") {
    return summarizeDashboardInstanceReconciliation(after);
  }
  if (applyFailed) throw new Error("Dashboard assignment apply failed");
  throw new Error("Dashboard assignment did not verify");
}
