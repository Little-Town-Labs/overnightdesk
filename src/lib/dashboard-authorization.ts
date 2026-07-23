import { z } from "zod";
import type { MembershipRole } from "@/lib/use-case-membership-authorization";

export interface DashboardAuthorizationCandidate {
  instanceId: string;
  ownerId: string;
  subdomain: string | null;
  status: string;
  dashboardAuthStatus: string;
  oidcClientId: string | null;
  useCaseId: string | null;
  runtimeIdentityId: string | null;
}

export type DashboardMembershipDecision =
  | {
      authorized: true;
      role: MembershipRole;
      scope: "use_case" | "runtime";
    }
  | {
      authorized: false;
      reason: "not_authorized" | "authorization_unavailable";
    };

export interface DashboardMembershipAuthorizer {
  authorize(input: {
    userId: string;
    useCaseId: string;
    runtimeIdentityId: string;
  }): Promise<DashboardMembershipDecision>;
}

export type DashboardAuthorizationDecision =
  | {
      authorized: true;
      authority: "canonical" | "legacy_owner";
      instanceId: string;
      role: MembershipRole;
      scope: "use_case" | "runtime" | "instance";
    }
  | {
      authorized: false;
      reason: "not_authorized" | "authorization_unavailable";
    };

const requestSchema = z
  .object({
    requestedHost: z.string().min(1).max(253),
    userId: z.string().min(1).max(255),
  })
  .strict();

const candidateSchema = z
  .object({
    instanceId: z.string().min(1).max(255),
    ownerId: z.string().min(1).max(255),
    subdomain: z.string().min(1).max(253),
    status: z.string().min(1).max(64),
    dashboardAuthStatus: z.string().min(1).max(64),
    oidcClientId: z.string().min(1).max(255).nullable(),
    useCaseId: z.string().uuid().nullable(),
    runtimeIdentityId: z.string().uuid().nullable(),
  })
  .strict();

const membershipDecisionSchema = z.discriminatedUnion("authorized", [
  z
    .object({
      authorized: z.literal(true),
      role: z.enum(["owner", "operator", "member", "viewer"]),
      scope: z.enum(["use_case", "runtime"]),
    })
    .strict(),
  z
    .object({
      authorized: z.literal(false),
      reason: z.enum(["not_authorized", "authorization_unavailable"]),
    })
    .strict(),
]);

function denied(
  reason: "not_authorized" | "authorization_unavailable",
): DashboardAuthorizationDecision {
  return { authorized: false, reason };
}

export function isApprovedDashboardHost(host: string): boolean {
  if (host !== host.toLowerCase() || !host.endsWith(".overnightdesk.com")) {
    return false;
  }
  try {
    const url = new URL(`https://${host}`);
    return (
      url.hostname === host &&
      url.origin === `https://${host}` &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export async function authorizeDashboardAccess(
  rawInput: {
    requestedHost: string;
    userId: string;
    candidates: readonly DashboardAuthorizationCandidate[];
  },
  membership: DashboardMembershipAuthorizer,
): Promise<DashboardAuthorizationDecision> {
  const request = requestSchema.safeParse({
    requestedHost: rawInput.requestedHost,
    userId: rawInput.userId,
  });
  if (!request.success || !isApprovedDashboardHost(request.data.requestedHost)) {
    return denied("not_authorized");
  }

  if (!Array.isArray(rawInput.candidates)) {
    return denied("authorization_unavailable");
  }
  if (rawInput.candidates.length === 0) return denied("not_authorized");
  if (rawInput.candidates.length !== 1) {
    return denied("authorization_unavailable");
  }

  const parsedCandidate = candidateSchema.safeParse(rawInput.candidates[0]);
  if (!parsedCandidate.success) return denied("authorization_unavailable");
  const candidate = parsedCandidate.data;
  if (candidate.subdomain !== request.data.requestedHost) {
    return denied("not_authorized");
  }
  if (
    candidate.status !== "running" ||
    candidate.dashboardAuthStatus !== "active" ||
    candidate.oidcClientId === null
  ) {
    return denied("not_authorized");
  }

  const hasUseCase = candidate.useCaseId !== null;
  const hasRuntime = candidate.runtimeIdentityId !== null;
  if (hasUseCase !== hasRuntime) return denied("authorization_unavailable");

  if (!hasUseCase || !hasRuntime) {
    if (candidate.ownerId !== request.data.userId) {
      return denied("not_authorized");
    }
    return {
      authorized: true,
      authority: "legacy_owner",
      instanceId: candidate.instanceId,
      role: "owner",
      scope: "instance",
    };
  }

  const canonicalUseCaseId = candidate.useCaseId;
  const canonicalRuntimeIdentityId = candidate.runtimeIdentityId;
  if (canonicalUseCaseId === null || canonicalRuntimeIdentityId === null) {
    return denied("authorization_unavailable");
  }

  try {
    const rawDecision = await membership.authorize({
      userId: request.data.userId,
      useCaseId: canonicalUseCaseId,
      runtimeIdentityId: canonicalRuntimeIdentityId,
    });
    const decision = membershipDecisionSchema.safeParse(rawDecision);
    if (!decision.success) return denied("authorization_unavailable");
    if (!decision.data.authorized) return decision.data;
    return {
      authorized: true,
      authority: "canonical",
      instanceId: candidate.instanceId,
      role: decision.data.role,
      scope: decision.data.scope,
    };
  } catch {
    return denied("authorization_unavailable");
  }
}
