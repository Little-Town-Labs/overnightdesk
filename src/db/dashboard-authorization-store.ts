import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instance } from "@/db/schema";
import {
  authorizeDashboardAccess,
  isApprovedDashboardHost,
  type DashboardAuthorizationCandidate,
  type DashboardAuthorizationDecision,
  type DashboardMembershipAuthorizer,
} from "@/lib/dashboard-authorization";
import {
  createUseCaseMembershipAuthorizer,
  recordMembershipAuthorizationAuditEvent,
} from "@/lib/use-case-membership-authorization";
import { createDrizzleUseCaseMembershipStore } from "@/lib/use-case-membership-store";
import {
  recordHermesOidcAuditEvent,
  type HermesOidcAuditEvent,
} from "@/lib/hermes-oidc-audit";

type Database = typeof db;

export interface DashboardAuthorizationCandidateReader {
  findByExactHost(host: string): Promise<DashboardAuthorizationCandidate[]>;
}

export interface DashboardAuthorizationStore {
  authorize(input: {
    requestedHost: string;
    userId: string;
    requestId?: string;
  }): Promise<DashboardAuthorizationDecision>;
}

type DashboardAuthorizationAudit = (
  event: HermesOidcAuditEvent,
) => Promise<unknown>;

function denialAuditEvent(
  reason: "not_authorized" | "authorization_unavailable",
  candidates: readonly DashboardAuthorizationCandidate[],
  requestId?: string,
): HermesOidcAuditEvent {
  const candidate = candidates.length === 1 ? candidates[0] : null;
  const authority = candidate
    ? candidate.useCaseId !== null && candidate.runtimeIdentityId !== null
      ? "canonical"
      : candidate.useCaseId === null && candidate.runtimeIdentityId === null
        ? "legacy_owner"
        : "unknown"
    : "unknown";
  return {
    category: "denied",
    reason,
    authority,
    ...(candidate ? { instanceId: candidate.instanceId } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function createDrizzleCandidateReader(
  database: Database,
): DashboardAuthorizationCandidateReader {
  return {
    async findByExactHost(host) {
      return database
        .select({
          instanceId: instance.id,
          ownerId: instance.userId,
          subdomain: instance.subdomain,
          status: instance.status,
          dashboardAuthStatus: instance.hermesDashboardAuthStatus,
          oidcClientId: instance.hermesOidcClientId,
          useCaseId: instance.useCaseId,
          runtimeIdentityId: instance.runtimeIdentityId,
        })
        .from(instance)
        .where(eq(instance.subdomain, host));
    },
  };
}

function createCanonicalMembershipAuthorizer(
  database: Database,
): DashboardMembershipAuthorizer {
  const membershipStore = createDrizzleUseCaseMembershipStore(database);
  return {
    async authorize({ userId, useCaseId, runtimeIdentityId }) {
      const authorizer = createUseCaseMembershipAuthorizer({
        store: membershipStore,
        assignment: { useCaseId, runtimeIdentityId },
        audit: recordMembershipAuthorizationAuditEvent,
      });
      const decision = await authorizer.authorize({ userId });
      if (!decision.authorized) return decision;
      return {
        authorized: true,
        role: decision.role,
        scope: decision.scope,
      };
    },
  };
}

export function createDashboardAuthorizationStore({
  reader,
  membership,
  audit = recordHermesOidcAuditEvent,
}: {
  reader: DashboardAuthorizationCandidateReader;
  membership: DashboardMembershipAuthorizer;
  audit?: DashboardAuthorizationAudit;
}): DashboardAuthorizationStore {
  return {
    async authorize(input) {
      if (!isApprovedDashboardHost(input.requestedHost)) {
        await audit(
          denialAuditEvent("not_authorized", [], input.requestId),
        ).catch(() => undefined);
        return { authorized: false, reason: "not_authorized" };
      }
      try {
        const candidates = await reader.findByExactHost(input.requestedHost);
        const decision = await authorizeDashboardAccess(
          { ...input, candidates },
          membership,
        );
        if (!decision.authorized) {
          await audit(
            denialAuditEvent(decision.reason, candidates, input.requestId),
          ).catch(() => undefined);
        }
        return decision;
      } catch {
        await audit(
          denialAuditEvent("authorization_unavailable", [], input.requestId),
        ).catch(() => undefined);
        return { authorized: false, reason: "authorization_unavailable" };
      }
    },
  };
}

export function createDrizzleDashboardAuthorizationStore(
  database: Database = db,
): DashboardAuthorizationStore {
  return createDashboardAuthorizationStore({
    reader: createDrizzleCandidateReader(database),
    membership: createCanonicalMembershipAuthorizer(database),
  });
}

export const dashboardAuthorizationStore =
  createDrizzleDashboardAuthorizationStore();
