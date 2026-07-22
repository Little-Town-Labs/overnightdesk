import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  instance,
  platformAuditLog,
  resourceBinding,
  runtimeIdentity,
  useCase,
  useCaseMembership,
} from "@/db/schema";
import type { CanonicalIdentityTemplate } from "@/lib/use-case-identity-backfill";
import {
  getPlatformInstanceSelector,
  type PlatformInstanceLinkSnapshot,
  type PlatformInstanceLinkPlan,
} from "@/lib/platform-instance-link";

type Database = typeof db;
type ReadyPlan = Extract<PlatformInstanceLinkPlan, { status: "ready" }>;

async function instanceLinkSchemaReady(database: Database) {
  const result = await database.execute(
    sql<{ ready: boolean }>`
      SELECT
        to_regclass('public.use_case') IS NOT NULL
        AND to_regclass('public.runtime_identity') IS NOT NULL
        AND to_regclass('public.use_case_membership') IS NOT NULL
        AND to_regclass('public.resource_binding') IS NOT NULL
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

export async function inspectPlatformInstanceLink(
  template: CanonicalIdentityTemplate,
  database: Database = db,
): Promise<PlatformInstanceLinkSnapshot> {
  const selector = getPlatformInstanceSelector(template);
  const schemaReady = await instanceLinkSchemaReady(database);
  if (!schemaReady) {
    return {
      schemaReady: false,
      identities: [],
      memberships: [],
      instances: [],
      platformBindings: [],
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
  const [memberships, candidates, platformBindings] = await Promise.all([
    identity
      ? database
          .select({
            useCaseId: useCaseMembership.useCaseId,
            userId: useCaseMembership.userId,
            role: useCaseMembership.role,
            status: useCaseMembership.status,
            runtimeIdentityId: useCaseMembership.runtimeIdentityId,
            expiresAt: useCaseMembership.expiresAt,
            suspendedAt: useCaseMembership.suspendedAt,
            revokedAt: useCaseMembership.revokedAt,
          })
          .from(useCaseMembership)
          .where(eq(useCaseMembership.useCaseId, identity.useCaseId))
      : Promise.resolve([]),
    database
      .select({
        id: instance.id,
        userId: instance.userId,
        tenantId: instance.tenantId,
        useCaseId: instance.useCaseId,
        runtimeIdentityId: instance.runtimeIdentityId,
        status: instance.status,
        subdomain: instance.subdomain,
        hermesOidcClientId: instance.hermesOidcClientId,
        hermesDashboardAuthStatus: instance.hermesDashboardAuthStatus,
      })
      .from(instance)
      .where(eq(instance.tenantId, selector.value)),
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
          eq(resourceBinding.provider, selector.provider),
          eq(resourceBinding.kind, selector.kind),
          eq(resourceBinding.value, selector.value),
          ne(resourceBinding.state, "retired"),
        ),
      ),
  ]);

  return {
    schemaReady,
    identities,
    memberships,
    instances: candidates,
    platformBindings,
  };
}

export async function applyPlatformInstanceLink(
  template: CanonicalIdentityTemplate,
  plan: ReadyPlan,
  actor: string,
  database: Database = db,
) {
  const selector = getPlatformInstanceSelector(template);
  const result = await database.execute(
    sql<{ linked_count: number }>`
      WITH linked AS (
        UPDATE ${instance}
        SET
          use_case_id = ${plan.useCaseId},
          runtime_identity_id = ${plan.runtimeIdentityId},
          updated_at = NOW()
        WHERE id = ${plan.instanceId}
          AND user_id = ${plan.ownerId}
          AND tenant_id = ${plan.tenantId}
          AND use_case_id IS NULL
          AND runtime_identity_id IS NULL
          AND status = 'running'
          AND (
            subdomain = 'overnightdesk.com'
            OR subdomain LIKE '%.overnightdesk.com'
          )
          AND hermes_oidc_client_id IS NOT NULL
          AND hermes_dashboard_auth_status = 'active'
          AND EXISTS (
            SELECT 1
            FROM ${useCaseMembership} membership
            WHERE membership.use_case_id = ${plan.useCaseId}
              AND membership.user_id = ${plan.ownerId}
              AND membership.role = 'owner'
              AND membership.status = 'active'
              AND (
                membership.runtime_identity_id IS NULL
                OR membership.runtime_identity_id = ${plan.runtimeIdentityId}
              )
              AND membership.suspended_at IS NULL
              AND membership.revoked_at IS NULL
              AND (
                membership.expires_at IS NULL
                OR membership.expires_at > NOW()
              )
          )
          AND 1 = (
            SELECT COUNT(*)
            FROM ${resourceBinding} binding
            WHERE binding.use_case_id = ${plan.useCaseId}
              AND binding.runtime_identity_id = ${plan.runtimeIdentityId}
              AND binding.provider = ${selector.provider}
              AND binding.kind = ${selector.kind}
              AND binding.value = ${selector.value}
              AND binding.state IN ('active', 'compatibility')
          )
        RETURNING id
      ), audited AS (
        INSERT INTO ${platformAuditLog} (actor, action, target, details)
        SELECT
          ${actor},
          'canonical_platform_instance_linked',
          'canonical-platform-instance',
          jsonb_build_object('instanceCount', 1)
        FROM linked
      )
      SELECT COUNT(*)::int AS linked_count FROM linked
    `,
  );
  if (Number(result.rows[0]?.linked_count ?? 0) !== 1) {
    throw new Error("Canonical platform instance link did not converge");
  }
}
