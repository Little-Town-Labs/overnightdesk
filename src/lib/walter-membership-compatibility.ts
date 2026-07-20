import { z } from "zod";
import {
  compareLegacyOwnerWithCanonicalMembership,
  type MembershipAuthorizationShadowAuditEvent,
  type MembershipAuthorizationShadowResult,
} from "@/lib/membership-authorization-shadow";
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

export type WalterAuthorizationShadowAuditEvent =
  MembershipAuthorizationShadowAuditEvent<"walter_authorization_shadow_compared">;

interface WalterAuthorizationShadowInput {
  mode: WalterMembershipShadowMode;
  confirmation?: string;
  legacyAuthorized: boolean;
  userId: string;
  authorizer: Pick<UseCaseMembershipAuthorizer, "authorize">;
  audit: (event: WalterAuthorizationShadowAuditEvent) => Promise<unknown>;
}

export type WalterAuthorizationShadowResult =
  MembershipAuthorizationShadowResult;

/**
 * Observes Walter's canonical membership decision without allowing it to
 * replace the legacy owner decision. Legacy mode performs no canonical work.
 */
export async function compareWalterLegacyOwnerWithCanonicalMembership(
  input: WalterAuthorizationShadowInput,
): Promise<WalterAuthorizationShadowResult> {
  requireWalterMembershipComparisonConfirmation(input.mode, input.confirmation);
  return compareLegacyOwnerWithCanonicalMembership({
    mode: input.mode,
    eventType: "walter_authorization_shadow_compared",
    legacyAuthorized: input.legacyAuthorized,
    userId: input.userId,
    authorizer: input.authorizer,
    audit: input.audit,
  });
}
