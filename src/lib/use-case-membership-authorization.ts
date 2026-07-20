export type MembershipRole = "owner" | "operator" | "member" | "viewer";
export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";

export interface MembershipAuthorizationRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  expiresAt: Date | null;
}

export interface MembershipAuthorizationStore {
  listForUser(userId: string): Promise<MembershipAuthorizationRecord[]>;
}

export interface MembershipAuthorizationRequest {
  userId: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
}

export type MembershipAuthorizationDecision =
  | {
      authorized: true;
      membershipId: string;
      role: MembershipRole;
      scope: "use_case" | "runtime";
    }
  | {
      authorized: false;
      reason: "not_authorized" | "authorization_unavailable";
    };

export interface UseCaseMembershipAuthorizer {
  authorize(
    request: MembershipAuthorizationRequest
  ): Promise<MembershipAuthorizationDecision>;
  invalidateUser(userId: string): void;
}

interface CachedGrant {
  userId: string;
  decision: Extract<MembershipAuthorizationDecision, { authorized: true }>;
  validUntil: number;
}

interface CreateAuthorizerInput {
  store: MembershipAuthorizationStore;
  now?: () => Date;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

// Cross-process invalidation is not available yet, so production callers must
// opt into caching only when they can invalidate every relevant process.
const DEFAULT_CACHE_TTL_MS = 0;
const DEFAULT_MAX_CACHE_ENTRIES = 1_024;

function cacheKey(request: MembershipAuthorizationRequest): string {
  return JSON.stringify([
    request.userId,
    request.useCaseId,
    request.runtimeIdentityId,
  ]);
}

function isEligibleMembership(
  membership: MembershipAuthorizationRecord,
  request: MembershipAuthorizationRequest,
  nowMs: number
): boolean {
  const isInRequestedScope =
    membership.runtimeIdentityId === null ||
    (request.runtimeIdentityId !== null &&
      membership.runtimeIdentityId === request.runtimeIdentityId);

  return (
    membership.userId === request.userId &&
    membership.useCaseId === request.useCaseId &&
    membership.status === "active" &&
    isInRequestedScope &&
    (membership.expiresAt === null || membership.expiresAt.getTime() > nowMs)
  );
}

function selectMembership(
  memberships: MembershipAuthorizationRecord[],
  request: MembershipAuthorizationRequest,
  nowMs: number
): MembershipAuthorizationRecord | null {
  const eligible = memberships.filter((membership) =>
    isEligibleMembership(membership, request, nowMs)
  );

  return (
    eligible.find(
      (membership) =>
        request.runtimeIdentityId !== null &&
        membership.runtimeIdentityId === request.runtimeIdentityId
    ) ??
    eligible.find((membership) => membership.runtimeIdentityId === null) ??
    null
  );
}

export function createUseCaseMembershipAuthorizer({
  store,
  now = () => new Date(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES,
}: CreateAuthorizerInput): UseCaseMembershipAuthorizer {
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new Error("Membership authorization cache TTL must be non-negative");
  }
  if (!Number.isSafeInteger(maxCacheEntries) || maxCacheEntries < 1) {
    throw new Error("Membership authorization cache size must be positive");
  }

  const grants = new Map<string, CachedGrant>();

  function rememberGrant(key: string, grant: CachedGrant): void {
    if (cacheTtlMs === 0) return;

    if (!grants.has(key) && grants.size >= maxCacheEntries) {
      const oldestKey = grants.keys().next().value;
      if (oldestKey !== undefined) grants.delete(oldestKey);
    }
    grants.set(key, grant);
  }

  return {
    async authorize(request) {
      const key = cacheKey(request);
      const nowMs = now().getTime();
      const cached = grants.get(key);
      if (cached && cached.validUntil > nowMs) return cached.decision;
      if (cached) grants.delete(key);

      let memberships: MembershipAuthorizationRecord[];
      try {
        memberships = await store.listForUser(request.userId);
      } catch {
        return { authorized: false, reason: "authorization_unavailable" };
      }

      const membership = selectMembership(memberships, request, nowMs);
      if (!membership) {
        return { authorized: false, reason: "not_authorized" };
      }

      const decision = {
        authorized: true as const,
        membershipId: membership.id,
        role: membership.role,
        scope:
          membership.runtimeIdentityId === null
            ? ("use_case" as const)
            : ("runtime" as const),
      };
      const membershipExpiry = membership.expiresAt?.getTime() ?? Infinity;
      rememberGrant(key, {
        userId: request.userId,
        decision,
        validUntil: Math.min(nowMs + cacheTtlMs, membershipExpiry),
      });

      return decision;
    },

    invalidateUser(userId) {
      for (const [key, grant] of grants) {
        if (grant.userId === userId) grants.delete(key);
      }
    },
  };
}
