import { z } from "zod";
import {
  compareCanonicalResolution,
  type CanonicalIdentitySelector,
  type CanonicalIdentityStore,
  type IdentityResolutionAuditEvent,
} from "@/lib/canonical-identity";

const readModeSchema = z.enum(["legacy", "compare"]);

export type CanonicalIdentityReadMode = z.infer<typeof readModeSchema>;

export function parseCanonicalIdentityReadMode(
  value: string | undefined,
): CanonicalIdentityReadMode {
  if (!value) return "legacy";
  const parsed = readModeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      "CANONICAL_IDENTITY_READ_MODE must be legacy or compare",
    );
  }
  return parsed.data;
}

interface LegacyWithCanonicalShadowInput<TLegacy> {
  mode: CanonicalIdentityReadMode;
  legacyResult: TLegacy;
  selector: CanonicalIdentitySelector;
  expectedUseCaseId: string;
  expectedRuntimeId: string | null;
  store: CanonicalIdentityStore;
  audit: (event: IdentityResolutionAuditEvent) => Promise<unknown>;
}

export interface LegacyWithCanonicalShadowResult<TLegacy> {
  authority: "legacy";
  value: TLegacy;
  comparison: "disabled" | "match" | "mismatch" | "error";
}

export async function resolveLegacyWithCanonicalShadow<TLegacy>({
  mode,
  legacyResult,
  selector,
  expectedUseCaseId,
  expectedRuntimeId,
  store,
  audit,
}: LegacyWithCanonicalShadowInput<TLegacy>): Promise<
  LegacyWithCanonicalShadowResult<TLegacy>
> {
  if (mode === "legacy") {
    return {
      authority: "legacy",
      value: legacyResult,
      comparison: "disabled",
    };
  }

  try {
    const canonical = await compareCanonicalResolution({
      selector,
      expectedUseCaseId,
      expectedRuntimeId,
      store,
      audit,
    });
    const comparison =
      canonical?.useCaseId === expectedUseCaseId &&
      canonical.runtimeId === expectedRuntimeId
        ? "match"
        : "mismatch";
    return { authority: "legacy", value: legacyResult, comparison };
  } catch {
    return { authority: "legacy", value: legacyResult, comparison: "error" };
  }
}
