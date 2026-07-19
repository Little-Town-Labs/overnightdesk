import { z } from "zod";

const uuid = z.string().uuid();
const boundedIdentifier = z.string().min(1).max(512);

const selectorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("use_case_id"), value: uuid }),
  z.object({ type: z.literal("runtime_id"), value: uuid }),
  z.object({
    type: z.literal("use_case_number"),
    value: z.number().int().positive().safe(),
  }),
  z.object({ type: z.literal("instance_id"), value: boundedIdentifier }),
  z.object({ type: z.literal("legacy_tenant_id"), value: boundedIdentifier }),
  z.object({
    type: z.literal("resource_binding"),
    provider: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/),
    kind: z.enum([
      "platform_instance",
      "orchestrator_tenant",
      "container",
      "volume",
      "hostname",
      "phase_path",
      "oidc_client",
      "intake_route",
    ]),
    value: boundedIdentifier,
  }),
]);

export type CanonicalIdentitySelector = z.infer<typeof selectorSchema>;

export interface CanonicalIdentity {
  useCaseId: string;
  useCaseNumber: number | null;
  useCaseSlug: string;
  runtimeId: string | null;
  runtimeSlug: string | null;
}

export interface CanonicalIdentityStore {
  resolve(
    selector: CanonicalIdentitySelector
  ): Promise<CanonicalIdentity | null>;
}

export interface IdentityResolutionAuditEvent {
  eventType:
    | "canonical_resolution_match"
    | "canonical_resolution_mismatch";
  selectorType: CanonicalIdentitySelector["type"];
  expectedUseCaseId: string;
  resolvedUseCaseId: string | null;
  expectedRuntimeId: string | null;
  resolvedRuntimeId: string | null;
}

export async function resolveCanonicalIdentity(
  selector: CanonicalIdentitySelector,
  store: CanonicalIdentityStore
): Promise<CanonicalIdentity | null> {
  const parsed = selectorSchema.safeParse(selector);
  if (!parsed.success) {
    throw new Error("Invalid canonical identity selector");
  }

  return store.resolve(parsed.data);
}

interface CompareCanonicalResolutionInput {
  selector: CanonicalIdentitySelector;
  expectedUseCaseId: string;
  expectedRuntimeId: string | null;
  store: CanonicalIdentityStore;
  audit: (event: IdentityResolutionAuditEvent) => Promise<unknown>;
}

export async function compareCanonicalResolution({
  selector,
  expectedUseCaseId,
  expectedRuntimeId,
  store,
  audit,
}: CompareCanonicalResolutionInput): Promise<CanonicalIdentity | null> {
  const resolved = await resolveCanonicalIdentity(selector, store);
  const matches =
    resolved?.useCaseId === expectedUseCaseId &&
    resolved.runtimeId === expectedRuntimeId;

  await audit({
    eventType: matches
      ? "canonical_resolution_match"
      : "canonical_resolution_mismatch",
    selectorType: selector.type,
    expectedUseCaseId,
    resolvedUseCaseId: resolved?.useCaseId ?? null,
    expectedRuntimeId,
    resolvedRuntimeId: resolved?.runtimeId ?? null,
  });

  return resolved;
}
