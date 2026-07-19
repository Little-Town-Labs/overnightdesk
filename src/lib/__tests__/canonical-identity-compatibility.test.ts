import {
  parseCanonicalIdentityReadMode,
  resolveLegacyWithCanonicalShadow,
} from "@/lib/canonical-identity-compatibility";
import type {
  CanonicalIdentity,
  CanonicalIdentityStore,
  IdentityResolutionAuditEvent,
} from "@/lib/canonical-identity";

const canonicalIdentity: CanonicalIdentity = {
  useCaseId: "11111111-1111-4111-8111-111111111111",
  useCaseNumber: 1,
  useCaseSlug: "mitchel-business",
  runtimeId: "22222222-2222-4222-8222-222222222222",
  runtimeSlug: "hermes-mitchel",
};

const selector = {
  type: "resource_binding" as const,
  provider: "docker",
  kind: "container" as const,
  value: "hermes-mitchel",
};

function createStore(
  result: CanonicalIdentity | null = canonicalIdentity,
): CanonicalIdentityStore & { resolve: jest.Mock } {
  return { resolve: jest.fn().mockResolvedValue(result) };
}

function createInput(
  store: CanonicalIdentityStore,
  audit: (event: IdentityResolutionAuditEvent) => Promise<unknown>,
) {
  return {
    legacyResult: { tenantId: "hermes-mitchel", authorized: true },
    selector,
    expectedUseCaseId: canonicalIdentity.useCaseId,
    expectedRuntimeId: canonicalIdentity.runtimeId,
    store,
    audit,
  };
}

describe("parseCanonicalIdentityReadMode", () => {
  it("defaults to the legacy authority when the flag is absent", () => {
    expect(parseCanonicalIdentityReadMode(undefined)).toBe("legacy");
    expect(parseCanonicalIdentityReadMode("")).toBe("legacy");
  });

  it("allows shadow comparison but rejects an authorization cutover mode", () => {
    expect(parseCanonicalIdentityReadMode("compare")).toBe("compare");
    expect(() => parseCanonicalIdentityReadMode("canonical")).toThrow(
      "CANONICAL_IDENTITY_READ_MODE must be legacy or compare",
    );
  });
});

describe("resolveLegacyWithCanonicalShadow", () => {
  it("returns the legacy result without a canonical query when the flag is off", async () => {
    const store = createStore();
    const audit = jest.fn();
    const input = createInput(store, audit);

    const result = await resolveLegacyWithCanonicalShadow({
      ...input,
      mode: "legacy",
    });

    expect(result).toEqual({
      authority: "legacy",
      value: input.legacyResult,
      comparison: "disabled",
    });
    expect(store.resolve).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("records a matching shadow read while preserving legacy authority", async () => {
    const store = createStore();
    const events: IdentityResolutionAuditEvent[] = [];
    const input = createInput(store, async (event) => events.push(event));

    const result = await resolveLegacyWithCanonicalShadow({
      ...input,
      mode: "compare",
    });

    expect(result).toEqual({
      authority: "legacy",
      value: input.legacyResult,
      comparison: "match",
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(selector.value);
  });

  it("reports a mismatch without replacing the legacy result", async () => {
    const store = createStore({
      ...canonicalIdentity,
      useCaseId: "33333333-3333-4333-8333-333333333333",
    });
    const input = createInput(store, async () => undefined);

    await expect(
      resolveLegacyWithCanonicalShadow({ ...input, mode: "compare" }),
    ).resolves.toEqual({
      authority: "legacy",
      value: input.legacyResult,
      comparison: "mismatch",
    });
  });

  it("contains comparison failures without interrupting legacy authority", async () => {
    const store = createStore();
    store.resolve.mockRejectedValue(new Error("canonical store unavailable"));
    const audit = jest.fn();
    const input = createInput(store, audit);

    await expect(
      resolveLegacyWithCanonicalShadow({ ...input, mode: "compare" }),
    ).resolves.toEqual({
      authority: "legacy",
      value: input.legacyResult,
      comparison: "error",
    });
    expect(audit).not.toHaveBeenCalled();
  });
});
