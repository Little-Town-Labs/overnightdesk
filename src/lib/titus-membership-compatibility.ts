import { z } from "zod";
import {
  compareLegacyOwnerWithCanonicalMembership,
  type MembershipAuthorizationShadowAuditEvent,
  type MembershipAuthorizationShadowResult,
} from "@/lib/membership-authorization-shadow";
import type { UseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";

const titusMembershipModeSchema = z.enum(["legacy", "compare"]);

export type TitusMembershipAuthorizationMode = z.infer<
  typeof titusMembershipModeSchema
>;

export function parseTitusMembershipAuthorizationMode(
  value: string | undefined,
): TitusMembershipAuthorizationMode {
  if (!value) return "legacy";
  const parsed = titusMembershipModeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("TITUS_MEMBERSHIP_AUTH_MODE must be legacy or compare");
  }
  return parsed.data;
}

export function requireTitusMembershipComparisonConfirmation(
  mode: TitusMembershipAuthorizationMode,
  confirmation: string | undefined,
): void {
  if (
    mode === "compare" &&
    confirmation !== "COMPARE_TITUS_MEMBERSHIP_SHADOW"
  ) {
    throw new Error(
      "TITUS_MEMBERSHIP_COMPARISON_CONFIRM must equal COMPARE_TITUS_MEMBERSHIP_SHADOW",
    );
  }
}

export type TitusAuthorizationShadowAuditEvent =
  MembershipAuthorizationShadowAuditEvent<"titus_authorization_shadow_compared">;

interface TitusAuthorizationShadowInput {
  mode: TitusMembershipAuthorizationMode;
  confirmation?: string;
  legacyAuthorized: boolean;
  userId: string;
  authorizer: Pick<UseCaseMembershipAuthorizer, "authorize">;
  audit: (event: TitusAuthorizationShadowAuditEvent) => Promise<unknown>;
}

export type TitusAuthorizationShadowResult =
  MembershipAuthorizationShadowResult;

/**
 * Observes Titus canonical membership behind a Titus-specific confirmation.
 * This pre-consumer boundary cannot select canonical authority.
 */
export async function compareTitusLegacyOwnerWithCanonicalMembership(
  input: TitusAuthorizationShadowInput,
): Promise<TitusAuthorizationShadowResult> {
  requireTitusMembershipComparisonConfirmation(input.mode, input.confirmation);
  return compareLegacyOwnerWithCanonicalMembership({
    mode: input.mode,
    eventType: "titus_authorization_shadow_compared",
    legacyAuthorized: input.legacyAuthorized,
    userId: input.userId,
    authorizer: input.authorizer,
    audit: input.audit,
  });
}
