import { createHash } from "node:crypto";
import { z } from "zod";

export type MembershipRole = "owner" | "operator" | "member" | "viewer";
export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";

export interface CanonicalRuntimeAssignment {
  useCaseId: string;
  runtimeIdentityId: string | null;
}

export interface MembershipAuthorizationRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  expiresAt: Date | null;
}

export interface MembershipLookup extends CanonicalRuntimeAssignment {
  userId: string;
  now: Date;
}

export interface MembershipAuthorizationStore {
  findActiveMembership(
    lookup: MembershipLookup
  ): Promise<MembershipAuthorizationRecord | null>;
}

export interface MembershipAuthorizationRequest {
  userId: string;
}

export type MembershipAuthorizationDecision =
  | {
      authorized: true;
      membershipId: string;
      role: MembershipRole;
      scope: "use_case" | "runtime";
      useCaseId: string;
      runtimeIdentityId: string | null;
    }
  | {
      authorized: false;
      reason: "not_authorized" | "authorization_unavailable";
    };

export interface MembershipAuthorizationAuditEvent
  extends CanonicalRuntimeAssignment {
  eventType:
    | "membership_authorization_granted"
    | "membership_authorization_denied";
  reason:
    | "active_membership"
    | "not_authorized"
    | "authorization_unavailable";
  cache: "hit" | "miss";
  membershipId?: string;
  role?: MembershipRole;
  scope?: "use_case" | "runtime";
  subjectFingerprint?: string;
}

export function buildMembershipAuthorizationAuditRecord(
  event: MembershipAuthorizationAuditEvent
) {
  const outcome =
    event.eventType === "membership_authorization_granted"
      ? "granted"
      : "denied";
  const details: Record<string, string | null> = {
    reason: event.reason,
    useCaseId: event.useCaseId,
    runtimeIdentityId: event.runtimeIdentityId,
    cache: event.cache,
  };
  if (event.membershipId) details.membershipId = event.membershipId;
  if (event.role) details.role = event.role;
  if (event.scope) details.scope = event.scope;
  if (event.subjectFingerprint) {
    details.subjectFingerprint = event.subjectFingerprint;
  }

  return {
    actor: "membership-authorizer",
    action: `use_case_membership_authorization.${outcome}`,
    target: `use_case:${event.useCaseId}`,
    details,
  };
}

export async function recordMembershipAuthorizationAuditEvent(
  event: MembershipAuthorizationAuditEvent
): Promise<void> {
  const [{ db }, { platformAuditLog }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  await db
    .insert(platformAuditLog)
    .values(buildMembershipAuthorizationAuditRecord(event));
}

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
  assignment: CanonicalRuntimeAssignment;
  audit: (event: MembershipAuthorizationAuditEvent) => Promise<unknown>;
  now?: () => Date;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

const canonicalAssignmentSchema = z
  .object({
    useCaseId: z.string().uuid(),
    runtimeIdentityId: z.string().uuid().nullable(),
  })
  .strict();
const authorizationRequestSchema = z
  .object({ userId: z.string().min(1).max(255) })
  .strict();

// Cross-process invalidation is not available yet. Production callers receive
// uncached decisions unless they deliberately configure and qualify a TTL.
const DEFAULT_CACHE_TTL_MS = 0;
const DEFAULT_MAX_CACHE_ENTRIES = 1_024;

function cacheKey(userId: string, assignment: CanonicalRuntimeAssignment): string {
  return JSON.stringify([
    userId,
    assignment.useCaseId,
    assignment.runtimeIdentityId,
  ]);
}

function grantedAuditEvent(
  decision: Extract<MembershipAuthorizationDecision, { authorized: true }>,
  cache: "hit" | "miss",
  subjectFingerprint: string
): MembershipAuthorizationAuditEvent {
  return {
    eventType: "membership_authorization_granted",
    reason: "active_membership",
    useCaseId: decision.useCaseId,
    runtimeIdentityId: decision.runtimeIdentityId,
    membershipId: decision.membershipId,
    role: decision.role,
    scope: decision.scope,
    cache,
    subjectFingerprint,
  };
}

function fingerprintSubject(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

type GrantDecision = Extract<
  MembershipAuthorizationDecision,
  { authorized: true }
>;

class MembershipAuthorizer implements UseCaseMembershipAuthorizer {
  private readonly grants = new Map<string, CachedGrant>();

  constructor(
    private readonly store: MembershipAuthorizationStore,
    private readonly assignment: CanonicalRuntimeAssignment,
    private readonly audit: CreateAuthorizerInput["audit"],
    private readonly now: () => Date,
    private readonly cacheTtlMs: number,
    private readonly maxCacheEntries: number
  ) {}

  async authorize(
    rawRequest: MembershipAuthorizationRequest
  ): Promise<MembershipAuthorizationDecision> {
    const parsedRequest = authorizationRequestSchema.safeParse(rawRequest);
    if (!parsedRequest.success) return this.deny("not_authorized");

    const request = parsedRequest.data;
    const fingerprint = fingerprintSubject(request.userId);
    const decisionTime = this.now();
    const cached = this.readCachedGrant(request.userId, decisionTime);
    if (cached) return this.auditGrant(cached, "hit", fingerprint);

    const lookup = await this.lookupMembership(request.userId, decisionTime);
    if (lookup.status === "unavailable") {
      return this.deny("authorization_unavailable", fingerprint);
    }
    if (!lookup.membership) return this.deny("not_authorized", fingerprint);

    const decision = this.buildDecision(lookup.membership);
    const audited = await this.auditGrant(decision, "miss", fingerprint);
    if (!audited.authorized) return audited;
    this.rememberGrant(request.userId, decision, lookup.membership, decisionTime);
    return decision;
  }

  invalidateUser(userId: string): void {
    for (const [key, grant] of this.grants) {
      if (grant.userId === userId) this.grants.delete(key);
    }
  }

  private readCachedGrant(
    userId: string,
    decisionTime: Date
  ): GrantDecision | null {
    const key = cacheKey(userId, this.assignment);
    const cached = this.grants.get(key);
    if (cached && cached.validUntil > decisionTime.getTime()) {
      return cached.decision;
    }
    if (cached) this.grants.delete(key);
    return null;
  }

  private async lookupMembership(userId: string, now: Date) {
    try {
      const membership = await this.store.findActiveMembership({
        ...this.assignment,
        userId,
        now,
      });
      return { status: "available" as const, membership };
    } catch {
      return { status: "unavailable" as const, membership: null };
    }
  }

  private buildDecision(membership: MembershipAuthorizationRecord): GrantDecision {
    return {
      authorized: true,
      membershipId: membership.id,
      role: membership.role,
      scope: membership.runtimeIdentityId === null ? "use_case" : "runtime",
      ...this.assignment,
    };
  }

  private async auditGrant(
    decision: GrantDecision,
    cache: "hit" | "miss",
    fingerprint: string
  ): Promise<MembershipAuthorizationDecision> {
    try {
      await this.audit(grantedAuditEvent(decision, cache, fingerprint));
      return decision;
    } catch {
      return { authorized: false, reason: "authorization_unavailable" };
    }
  }

  private async deny(
    reason: "not_authorized" | "authorization_unavailable",
    subjectFingerprint?: string
  ): Promise<MembershipAuthorizationDecision> {
    try {
      await this.audit({
        eventType: "membership_authorization_denied",
        reason,
        ...this.assignment,
        cache: "miss",
        subjectFingerprint,
      });
    } catch {
      return { authorized: false, reason: "authorization_unavailable" };
    }
    return { authorized: false, reason };
  }

  private rememberGrant(
    userId: string,
    decision: GrantDecision,
    membership: MembershipAuthorizationRecord,
    decisionTime: Date
  ): void {
    if (this.cacheTtlMs === 0) return;
    const key = cacheKey(userId, this.assignment);
    if (!this.grants.has(key) && this.grants.size >= this.maxCacheEntries) {
      const oldestKey = this.grants.keys().next().value;
      if (oldestKey !== undefined) this.grants.delete(oldestKey);
    }
    const membershipExpiry = membership.expiresAt?.getTime() ?? Infinity;
    this.grants.set(key, {
      userId,
      decision,
      validUntil: Math.min(
        decisionTime.getTime() + this.cacheTtlMs,
        membershipExpiry
      ),
    });
  }
}

/**
 * Creates one server-bound authorization boundary. Callers provide only the
 * authenticated stable user ID; aliases and display identifiers are excluded.
 */
export function createUseCaseMembershipAuthorizer({
  store,
  assignment: rawAssignment,
  audit,
  now = () => new Date(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES,
}: CreateAuthorizerInput): UseCaseMembershipAuthorizer {
  const parsedAssignment = canonicalAssignmentSchema.safeParse(rawAssignment);
  if (!parsedAssignment.success) {
    throw new Error("Invalid canonical runtime assignment");
  }
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new Error("Membership authorization cache TTL must be non-negative");
  }
  if (!Number.isSafeInteger(maxCacheEntries) || maxCacheEntries < 1) {
    throw new Error("Membership authorization cache size must be positive");
  }

  return new MembershipAuthorizer(
    store,
    parsedAssignment.data,
    audit,
    now,
    cacheTtlMs,
    maxCacheEntries
  );
}
