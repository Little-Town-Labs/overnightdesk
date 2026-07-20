import type { UseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";

export type MembershipAuthorizationShadowMode = "legacy" | "compare";
export type MembershipAuthorizationShadowComparison =
  | "disabled"
  | "match"
  | "mismatch"
  | "error";

export interface MembershipAuthorizationShadowAuditEvent<
  EventType extends string,
> {
  eventType: EventType;
  authority: "legacy_owner";
  comparison: Exclude<MembershipAuthorizationShadowComparison, "disabled">;
  legacyDecision: "allow" | "deny";
  canonicalDecision: "allow" | "deny" | "unavailable";
}

export interface MembershipAuthorizationShadowInput<EventType extends string> {
  mode: MembershipAuthorizationShadowMode;
  eventType: EventType;
  legacyAuthorized: boolean;
  userId: string;
  authorizer: Pick<UseCaseMembershipAuthorizer, "authorize">;
  audit: (
    event: MembershipAuthorizationShadowAuditEvent<EventType>,
  ) => Promise<unknown>;
}

export interface MembershipAuthorizationShadowResult {
  authority: "legacy_owner";
  authorized: boolean;
  comparison: MembershipAuthorizationShadowComparison;
}

function shadowResult(
  legacyAuthorized: boolean,
  comparison: MembershipAuthorizationShadowComparison,
): MembershipAuthorizationShadowResult {
  return {
    authority: "legacy_owner",
    authorized: legacyAuthorized,
    comparison,
  };
}

function shadowAuditEvent<EventType extends string>(
  eventType: EventType,
  legacyAuthorized: boolean,
  canonicalAuthorized: boolean | null,
  comparison: "match" | "mismatch" | "error",
): MembershipAuthorizationShadowAuditEvent<EventType> {
  return {
    eventType,
    authority: "legacy_owner",
    comparison,
    legacyDecision: legacyAuthorized ? "allow" : "deny",
    canonicalDecision:
      canonicalAuthorized === null
        ? "unavailable"
        : canonicalAuthorized
          ? "allow"
          : "deny",
  };
}

async function recordShadowError<EventType extends string>(
  input: MembershipAuthorizationShadowInput<EventType>,
): Promise<MembershipAuthorizationShadowResult> {
  try {
    await input.audit(
      shadowAuditEvent(
        input.eventType,
        input.legacyAuthorized,
        null,
        "error",
      ),
    );
  } catch {
    // Shadow telemetry must never interrupt the legacy authorization path.
  }
  return shadowResult(input.legacyAuthorized, "error");
}

/**
 * Observes canonical membership without allowing it to replace the legacy
 * owner decision. Legacy mode performs no canonical or audit work.
 */
export async function compareLegacyOwnerWithCanonicalMembership<
  EventType extends string,
>(
  input: MembershipAuthorizationShadowInput<EventType>,
): Promise<MembershipAuthorizationShadowResult> {
  if (input.mode === "legacy") {
    return shadowResult(input.legacyAuthorized, "disabled");
  }

  let canonicalAuthorized: boolean;
  try {
    const decision = await input.authorizer.authorize({ userId: input.userId });
    if (
      !decision.authorized &&
      decision.reason === "authorization_unavailable"
    ) {
      return recordShadowError(input);
    }
    canonicalAuthorized = decision.authorized;
  } catch {
    return recordShadowError(input);
  }

  const comparison =
    canonicalAuthorized === input.legacyAuthorized ? "match" : "mismatch";
  try {
    await input.audit(
      shadowAuditEvent(
        input.eventType,
        input.legacyAuthorized,
        canonicalAuthorized,
        comparison,
      ),
    );
  } catch {
    return shadowResult(input.legacyAuthorized, "error");
  }
  return shadowResult(input.legacyAuthorized, comparison);
}
