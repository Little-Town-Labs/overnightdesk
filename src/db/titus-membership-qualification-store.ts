import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  instance,
  oauthClient,
  platformAuditLog,
  resourceBinding,
  runtimeIdentity,
  useCase,
  useCaseMembership,
} from "@/db/schema";
import {
  planTitusMembershipQualification,
  requireTitusMembershipQualificationConfirmation,
  summarizeTitusMembershipQualification,
  type TitusMembershipQualificationCandidate,
  type TitusMembershipQualificationPlan,
  type TitusMembershipQualificationState,
} from "@/lib/titus-membership-qualification";

type Database = typeof db;
type ReadyPlan = Extract<TitusMembershipQualificationPlan, { status: "ready" }>;

export type TitusMembershipQualificationCommand = "plan" | "apply" | "verify";

export interface TitusMembershipQualificationGateway {
  inspect(): Promise<TitusMembershipQualificationCandidate[]>;
  apply(plan: ReadyPlan, actor: string, now: Date): Promise<void>;
}

export interface TitusMembershipQualificationOptions {
  actor?: string;
  confirmation?: string;
}

const tenantId = "titus-dashboard";
const subdomain = "titus-dashboard.overnightdesk.com";
const useCaseSlug = "timeless-tech-solutions";
const runtimeSlug = "hermes-titus";

export async function inspectTitusMembershipQualification(
  database: Database = db,
): Promise<TitusMembershipQualificationCandidate[]> {
  const rows = await database
    .select({
      membershipId: useCaseMembership.id,
      membershipUserId: useCaseMembership.userId,
      instanceUserId: instance.userId,
      membershipRuntimeIdentityId: useCaseMembership.runtimeIdentityId,
      role: useCaseMembership.role,
      status: useCaseMembership.status,
      activatedAt: useCaseMembership.activatedAt,
      suspendedAt: useCaseMembership.suspendedAt,
      expiresAt: useCaseMembership.expiresAt,
      revokedAt: useCaseMembership.revokedAt,
      useCaseId: useCase.id,
      useCaseSlug: useCase.slug,
      useCaseStatus: useCase.status,
      runtimeIdentityId: runtimeIdentity.id,
      runtimeSlug: runtimeIdentity.slug,
      runtimeStatus: runtimeIdentity.status,
      instanceTenantId: instance.tenantId,
      instanceSubdomain: instance.subdomain,
      instanceStatus: instance.status,
      dashboardAuthStatus: instance.hermesDashboardAuthStatus,
      instanceOidcClientId: instance.hermesOidcClientId,
    })
    .from(instance)
    .innerJoin(useCase, eq(useCase.id, instance.useCaseId))
    .innerJoin(
      runtimeIdentity,
      eq(runtimeIdentity.id, instance.runtimeIdentityId),
    )
    .innerJoin(
      useCaseMembership,
      and(
        eq(useCaseMembership.useCaseId, useCase.id),
        eq(useCaseMembership.userId, instance.userId),
        isNull(useCaseMembership.runtimeIdentityId),
      ),
    )
    .where(
      and(
        eq(instance.tenantId, tenantId),
        eq(instance.subdomain, subdomain),
        eq(useCase.slug, useCaseSlug),
        eq(runtimeIdentity.slug, runtimeSlug),
      ),
    )
    .limit(2);

  return Promise.all(
    rows.map(async (row) => {
      const [clients, bindings] = row.instanceOidcClientId
        ? await Promise.all([
            database
              .select({
                id: oauthClient.id,
                disabled: oauthClient.disabled,
              })
              .from(oauthClient)
              .where(eq(oauthClient.clientId, row.instanceOidcClientId))
              .limit(2),
            database
              .select({
                useCaseId: resourceBinding.useCaseId,
                runtimeIdentityId: resourceBinding.runtimeIdentityId,
                state: resourceBinding.state,
              })
              .from(resourceBinding)
              .where(
                and(
                  eq(resourceBinding.provider, "better-auth"),
                  eq(resourceBinding.kind, "oidc_client"),
                  eq(resourceBinding.value, row.instanceOidcClientId),
                  ne(resourceBinding.state, "retired"),
                ),
              )
              .limit(2),
          ])
        : [[], []];
      const client = clients.length === 1 ? clients[0] : null;
      const binding = bindings.length === 1 ? bindings[0] : null;
      return {
        membershipId: row.membershipId,
        membershipUserId: row.membershipUserId,
        instanceUserId: row.instanceUserId,
        membershipRuntimeIdentityId: row.membershipRuntimeIdentityId,
        role: row.role,
        status: row.status,
        activatedAt: row.activatedAt,
        suspendedAt: row.suspendedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        useCaseSlug: row.useCaseSlug,
        useCaseStatus: row.useCaseStatus,
        runtimeSlug: row.runtimeSlug,
        runtimeStatus: row.runtimeStatus,
        instanceTenantId: row.instanceTenantId,
        instanceSubdomain: row.instanceSubdomain ?? "",
        instanceStatus: row.instanceStatus,
        dashboardAuthStatus: row.dashboardAuthStatus,
        oidcClientPresent: client !== null,
        oidcClientDisabled: client?.disabled ?? null,
        oidcBindingState: binding?.state ?? null,
        oidcBindingMatchesCanonicalScope:
          binding?.useCaseId === row.useCaseId &&
          binding?.runtimeIdentityId === row.runtimeIdentityId,
      };
    }),
  );
}

function currentStatePredicate(
  state: TitusMembershipQualificationState,
  now: Date,
): SQL {
  if (state === "active") {
    return sql`
      membership.status = 'active'
      AND membership.suspended_at IS NULL
      AND membership.expires_at IS NULL
      AND membership.revoked_at IS NULL
    `;
  }
  if (state === "non_member") {
    return sql`
      membership.status = 'invited'
      AND membership.suspended_at IS NULL
      AND membership.expires_at IS NULL
      AND membership.revoked_at IS NULL
    `;
  }
  if (state === "suspended") {
    return sql`
      membership.status = 'active'
      AND membership.suspended_at IS NOT NULL
      AND membership.expires_at IS NULL
      AND membership.revoked_at IS NULL
    `;
  }
  return sql`
    membership.status = 'active'
    AND membership.suspended_at IS NULL
    AND membership.expires_at IS NOT NULL
    AND membership.expires_at <= ${now}
    AND membership.revoked_at IS NULL
  `;
}

function desiredStateValues(
  state: TitusMembershipQualificationState,
  now: Date,
) {
  return {
    status: state === "non_member" ? ("invited" as const) : ("active" as const),
    suspendedAt: state === "suspended" ? now : null,
    expiresAt: state === "expired" ? now : null,
  };
}

export async function applyTitusMembershipQualification(
  plan: ReadyPlan,
  actor: string,
  now: Date,
  database: Database = db,
) {
  const desired = desiredStateValues(plan.desiredState, now);
  const result = await database.execute(
    sql<{ updated_count: number }>`
      WITH target AS (
        SELECT membership.id
        FROM ${useCaseMembership} membership
        INNER JOIN ${useCase} use_case
          ON use_case.id = membership.use_case_id
        INNER JOIN ${runtimeIdentity} runtime
          ON runtime.use_case_id = use_case.id
        INNER JOIN ${instance} dashboard
          ON dashboard.use_case_id = use_case.id
          AND dashboard.runtime_identity_id = runtime.id
          AND dashboard.user_id = membership.user_id
        WHERE membership.id = ${plan.membershipId}
          AND membership.runtime_identity_id IS NULL
          AND membership.role = 'owner'
          AND membership.activated_at IS NOT NULL
          AND use_case.slug = ${useCaseSlug}
          AND use_case.status = 'active'
          AND runtime.slug = ${runtimeSlug}
          AND runtime.status = 'active'
          AND dashboard.tenant_id = ${tenantId}
          AND dashboard.subdomain = ${subdomain}
          AND ${
            plan.desiredState === "active"
              ? sql`TRUE`
              : sql`
                dashboard.status = 'running'
                AND dashboard.hermes_dashboard_auth_status = 'active'
                AND dashboard.hermes_oidc_client_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM ${oauthClient} client
                  WHERE client.client_id = dashboard.hermes_oidc_client_id
                    AND client.disabled = false
                )
                AND 1 = (
                  SELECT COUNT(*)::int
                  FROM ${resourceBinding} binding
                  WHERE binding.use_case_id = use_case.id
                    AND binding.runtime_identity_id = runtime.id
                    AND binding.provider = 'better-auth'
                    AND binding.kind = 'oidc_client'
                    AND binding.value = dashboard.hermes_oidc_client_id
                    AND binding.state = 'active'
                )
              `
          }
          AND ${currentStatePredicate(plan.currentState, now)}
      ), updated AS (
        UPDATE ${useCaseMembership}
        SET
          status = ${desired.status}::use_case_membership_status,
          suspended_at = ${desired.suspendedAt},
          expires_at = ${desired.expiresAt},
          revoked_at = NULL,
          updated_at = ${now}
        WHERE id = ${plan.membershipId}
          AND 1 = (SELECT COUNT(*) FROM target)
          AND id = (SELECT id FROM target)
        RETURNING id
      ), audited AS (
        INSERT INTO ${platformAuditLog} (actor, action, target, details)
        SELECT
          ${actor},
          'titus_membership_qualification_transition',
          'titus-membership-qualification',
          jsonb_build_object(
            'fromState', ${plan.currentState}::text,
            'toState', ${plan.desiredState}::text,
            'membershipCount', 1
          )
        FROM updated
      )
      SELECT COUNT(*)::int AS updated_count FROM updated
    `,
  );
  if (Number(result.rows[0]?.updated_count ?? 0) !== 1) {
    throw new Error("Titus membership qualification did not converge");
  }
}

export function createTitusMembershipQualificationGateway(
  database: Database = db,
): TitusMembershipQualificationGateway {
  return {
    inspect: () => inspectTitusMembershipQualification(database),
    apply: (plan, actor, now) =>
      applyTitusMembershipQualification(plan, actor, now, database),
  };
}

async function inspectSafely(gateway: TitusMembershipQualificationGateway) {
  try {
    return await gateway.inspect();
  } catch {
    throw new Error("Titus membership qualification inspection failed");
  }
}

function validActor(actor?: string) {
  const value = actor?.trim();
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/.test(value)) {
    throw new Error("Titus membership qualification actor is invalid");
  }
  return value;
}

export async function executeTitusMembershipQualification(
  command: TitusMembershipQualificationCommand,
  desiredState: TitusMembershipQualificationState,
  options: TitusMembershipQualificationOptions,
  gateway: TitusMembershipQualificationGateway,
  now = new Date(),
) {
  const before = planTitusMembershipQualification(
    await inspectSafely(gateway),
    desiredState,
    now,
  );
  if (command === "plan") {
    return summarizeTitusMembershipQualification(before);
  }
  if (command === "verify") {
    if (before.status !== "verified") {
      throw new Error("Titus membership qualification is not verified");
    }
    return summarizeTitusMembershipQualification(before);
  }
  if (before.status === "blocked") {
    throw new Error("Titus membership qualification is blocked");
  }
  if (before.status === "verified") {
    return summarizeTitusMembershipQualification(before);
  }
  requireTitusMembershipQualificationConfirmation(
    before.currentState,
    before.desiredState,
    options.confirmation,
  );
  const actor = validActor(options.actor);
  let applyFailed = false;
  try {
    await gateway.apply(before, actor, now);
  } catch {
    applyFailed = true;
  }
  const after = planTitusMembershipQualification(
    await inspectSafely(gateway),
    desiredState,
    now,
  );
  if (after.status === "verified") {
    return summarizeTitusMembershipQualification(after);
  }
  if (applyFailed) {
    throw new Error("Titus membership qualification apply failed");
  }
  throw new Error("Titus membership qualification did not verify");
}
