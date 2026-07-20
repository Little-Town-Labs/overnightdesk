import { z } from "zod";
import type { UseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";

const walterMembershipModeSchema = z.enum([
  "legacy",
  "compare",
  "canonical",
]);

export type WalterMembershipAuthorizationMode = z.infer<
  typeof walterMembershipModeSchema
>;
export type WalterMembershipShadowMode = Exclude<
  WalterMembershipAuthorizationMode,
  "canonical"
>;

export function parseWalterMembershipAuthorizationMode(
  value: string | undefined,
): WalterMembershipAuthorizationMode {
  if (!value) return "legacy";
  const parsed = walterMembershipModeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      "WALTER_MEMBERSHIP_AUTH_MODE must be legacy, compare, or canonical",
    );
  }
  return parsed.data;
}

export function requireWalterCanonicalAuthorityConfirmation(
  mode: WalterMembershipAuthorizationMode,
  confirmation: string | undefined,
): void {
  if (
    mode === "canonical" &&
    confirmation !== "ENABLE_WALTER_CANONICAL_MEMBERSHIP"
  ) {
    throw new Error(
      "WALTER_MEMBERSHIP_CANONICAL_CONFIRM must equal ENABLE_WALTER_CANONICAL_MEMBERSHIP",
    );
  }
}

export function requireWalterMembershipComparisonConfirmation(
  mode: WalterMembershipAuthorizationMode,
  confirmation: string | undefined,
): void {
  if (
    mode === "compare" &&
    confirmation !== "COMPARE_WALTER_MEMBERSHIP_SHADOW"
  ) {
    throw new Error(
      "WALTER_MEMBERSHIP_COMPARISON_CONFIRM must equal COMPARE_WALTER_MEMBERSHIP_SHADOW",
    );
  }
}

export interface WalterAuthorizationShadowAuditEvent {
  eventType: "walter_authorization_shadow_compared";
  authority: "legacy_owner";
  comparison: "match" | "mismatch" | "error";
  legacyDecision: "allow" | "deny";
  canonicalDecision: "allow" | "deny" | "unavailable";
}

interface WalterAuthorizationShadowInput {
  mode: WalterMembershipShadowMode;
  confirmation?: string;
  legacyAuthorized: boolean;
  userId: string;
  authorizer: Pick<UseCaseMembershipAuthorizer, "authorize">;
  audit: (event: WalterAuthorizationShadowAuditEvent) => Promise<unknown>;
}

export interface WalterAuthorizationShadowResult {
  authority: "legacy_owner";
  authorized: boolean;
  comparison: "disabled" | "match" | "mismatch" | "error";
}

function walterShadowResult(
  legacyAuthorized: boolean,
  comparison: WalterAuthorizationShadowResult["comparison"],
): WalterAuthorizationShadowResult {
  return {
    authority: "legacy_owner",
    authorized: legacyAuthorized,
    comparison,
  };
}

function walterShadowAuditEvent(
  legacyAuthorized: boolean,
  canonicalAuthorized: boolean | null,
  comparison: "match" | "mismatch" | "error",
): WalterAuthorizationShadowAuditEvent {
  return {
    eventType: "walter_authorization_shadow_compared",
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

async function recordWalterShadowError(
  input: WalterAuthorizationShadowInput,
): Promise<WalterAuthorizationShadowResult> {
  try {
    await input.audit(
      walterShadowAuditEvent(input.legacyAuthorized, null, "error"),
    );
  } catch {
    // Shadow telemetry must never interrupt the legacy authorization path.
  }
  return walterShadowResult(input.legacyAuthorized, "error");
}

/**
 * Observes Walter's canonical membership decision without allowing it to
 * replace the legacy owner decision. Legacy mode performs no canonical work.
 */
export async function compareWalterLegacyOwnerWithCanonicalMembership(
  input: WalterAuthorizationShadowInput,
): Promise<WalterAuthorizationShadowResult> {
  requireWalterMembershipComparisonConfirmation(input.mode, input.confirmation);
  if (input.mode === "legacy") {
    return walterShadowResult(input.legacyAuthorized, "disabled");
  }

  let canonicalAuthorized: boolean;
  try {
    const decision = await input.authorizer.authorize({ userId: input.userId });
    if (
      !decision.authorized &&
      decision.reason === "authorization_unavailable"
    ) {
      return recordWalterShadowError(input);
    }
    canonicalAuthorized = decision.authorized;
  } catch {
    return recordWalterShadowError(input);
  }

  const comparison =
    canonicalAuthorized === input.legacyAuthorized ? "match" : "mismatch";
  try {
    await input.audit(
      walterShadowAuditEvent(
        input.legacyAuthorized,
        canonicalAuthorized,
        comparison,
      ),
    );
  } catch {
    return walterShadowResult(input.legacyAuthorized, "error");
  }
  return walterShadowResult(input.legacyAuthorized, comparison);
}
