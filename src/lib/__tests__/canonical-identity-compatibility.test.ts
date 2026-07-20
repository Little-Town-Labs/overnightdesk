import {
  parseCanonicalIdentityReadMode,
  requireCanonicalComparisonConfirmation,
  resolveLegacyWithCanonicalShadow,
} from "@/lib/canonical-identity-compatibility";
import {
  compareWalterLegacyOwnerWithCanonicalMembership,
  parseWalterMembershipAuthorizationMode,
  requireWalterCanonicalAuthorityConfirmation,
  requireWalterMembershipComparisonConfirmation,
} from "@/lib/walter-membership-compatibility";
import type {
  CanonicalIdentity,
  CanonicalIdentityStore,
  IdentityResolutionAuditEvent,
} from "@/lib/canonical-identity";
import type { UseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";

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

describe("requireCanonicalComparisonConfirmation", () => {
  it("requires a separate exact confirmation only when comparison writes audits", () => {
    expect(() =>
      requireCanonicalComparisonConfirmation("legacy", undefined),
    ).not.toThrow();
    expect(() =>
      requireCanonicalComparisonConfirmation(
        "compare",
        "COMPARE_TENET_1_SHADOW",
      ),
    ).not.toThrow();
    expect(() =>
      requireCanonicalComparisonConfirmation("compare", undefined),
    ).toThrow(
      "IDENTITY_COMPARISON_CONFIRM must equal COMPARE_TENET_1_SHADOW",
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

describe("Walter legacy-owner/canonical-membership shadow comparison", () => {
  const userId = "better-auth-user-gary";
  const confirmation = "COMPARE_WALTER_MEMBERSHIP_SHADOW";

  function authorizer(
    decision: Awaited<ReturnType<UseCaseMembershipAuthorizer["authorize"]>>,
  ): UseCaseMembershipAuthorizer & { authorize: jest.Mock } {
    return {
      authorize: jest.fn().mockResolvedValue(decision),
      invalidateUser: jest.fn(),
    };
  }

  it("defaults to rollback-safe legacy mode and accepts the guarded canonical mode", () => {
    expect(parseWalterMembershipAuthorizationMode(undefined)).toBe("legacy");
    expect(parseWalterMembershipAuthorizationMode("")).toBe("legacy");
    expect(parseWalterMembershipAuthorizationMode("compare")).toBe("compare");
    expect(parseWalterMembershipAuthorizationMode("canonical")).toBe(
      "canonical",
    );
    expect(() => parseWalterMembershipAuthorizationMode("enabled")).toThrow(
      "WALTER_MEMBERSHIP_AUTH_MODE must be legacy, compare, or canonical",
    );
  });

  it("requires a separate exact confirmation for canonical authority", () => {
    expect(() =>
      requireWalterCanonicalAuthorityConfirmation("legacy", undefined),
    ).not.toThrow();
    expect(() =>
      requireWalterCanonicalAuthorityConfirmation(
        "canonical",
        "ENABLE_WALTER_CANONICAL_MEMBERSHIP",
      ),
    ).not.toThrow();
    expect(() =>
      requireWalterCanonicalAuthorityConfirmation("canonical", undefined),
    ).toThrow(
      "WALTER_MEMBERSHIP_CANONICAL_CONFIRM must equal ENABLE_WALTER_CANONICAL_MEMBERSHIP",
    );
  });

  it("requires an exact Walter-specific confirmation before comparison", () => {
    expect(() =>
      requireWalterMembershipComparisonConfirmation("legacy", undefined),
    ).not.toThrow();
    expect(() =>
      requireWalterMembershipComparisonConfirmation(
        "compare",
        "COMPARE_WALTER_MEMBERSHIP_SHADOW",
      ),
    ).not.toThrow();
    expect(() =>
      requireWalterMembershipComparisonConfirmation("compare", undefined),
    ).toThrow(
      "WALTER_MEMBERSHIP_COMPARISON_CONFIRM must equal COMPARE_WALTER_MEMBERSHIP_SHADOW",
    );
  });

  it("does not start canonical comparison without the exact confirmation", async () => {
    const canonical = authorizer({
      authorized: false,
      reason: "not_authorized",
    });
    const audit = jest.fn();

    await expect(
      compareWalterLegacyOwnerWithCanonicalMembership({
        mode: "compare",
        legacyAuthorized: true,
        userId,
        authorizer: canonical,
        audit,
      }),
    ).rejects.toThrow(
      "WALTER_MEMBERSHIP_COMPARISON_CONFIRM must equal COMPARE_WALTER_MEMBERSHIP_SHADOW",
    );
    expect(canonical.authorize).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("performs zero canonical or audit work after rollback to legacy mode", async () => {
    const canonical = authorizer({
      authorized: false,
      reason: "not_authorized",
    });
    const audit = jest.fn();

    await expect(
      compareWalterLegacyOwnerWithCanonicalMembership({
        mode: "legacy",
        legacyAuthorized: true,
        userId,
        authorizer: canonical,
        audit,
      }),
    ).resolves.toEqual({
      authority: "legacy_owner",
      authorized: true,
      comparison: "disabled",
    });
    expect(canonical.authorize).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("records a match without exposing the Better Auth subject or membership", async () => {
    const canonical = authorizer({
      authorized: true,
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      role: "owner",
      scope: "use_case",
      useCaseId: "00000000-0000-4000-8000-000000000000",
      runtimeIdentityId: "00000000-0000-4000-8000-000000000010",
    });
    const events: unknown[] = [];

    await expect(
      compareWalterLegacyOwnerWithCanonicalMembership({
        mode: "compare",
        confirmation,
        legacyAuthorized: true,
        userId,
        authorizer: canonical,
        audit: async (event) => events.push(event),
      }),
    ).resolves.toEqual({
      authority: "legacy_owner",
      authorized: true,
      comparison: "match",
    });
    expect(events).toEqual([
      {
        eventType: "walter_authorization_shadow_compared",
        authority: "legacy_owner",
        comparison: "match",
        legacyDecision: "allow",
        canonicalDecision: "allow",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(userId);
    expect(JSON.stringify(events)).not.toContain(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
    );
  });

  it("keeps a legacy grant authoritative when canonical membership denies", async () => {
    const canonical = authorizer({
      authorized: false,
      reason: "not_authorized",
    });

    await expect(
      compareWalterLegacyOwnerWithCanonicalMembership({
        mode: "compare",
        confirmation,
        legacyAuthorized: true,
        userId,
        authorizer: canonical,
        audit: async () => undefined,
      }),
    ).resolves.toEqual({
      authority: "legacy_owner",
      authorized: true,
      comparison: "mismatch",
    });
  });

  it("keeps a legacy denial authoritative when canonical membership grants", async () => {
    const canonical = authorizer({
      authorized: true,
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      role: "owner",
      scope: "use_case",
      useCaseId: "00000000-0000-4000-8000-000000000000",
      runtimeIdentityId: "00000000-0000-4000-8000-000000000010",
    });

    await expect(
      compareWalterLegacyOwnerWithCanonicalMembership({
        mode: "compare",
        confirmation,
        legacyAuthorized: false,
        userId,
        authorizer: canonical,
        audit: async () => undefined,
      }),
    ).resolves.toEqual({
      authority: "legacy_owner",
      authorized: false,
      comparison: "mismatch",
    });
  });

  it.each([
    ["canonical authorization is unavailable", "authorization"],
    ["comparison audit is unavailable", "audit"],
  ])(
    "contains %s without changing legacy authority",
    async (_name, failure) => {
      const canonical = authorizer(
        failure === "authorization"
          ? { authorized: false, reason: "authorization_unavailable" }
          : {
              authorized: true,
              membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
              role: "owner",
              scope: "use_case",
              useCaseId: "00000000-0000-4000-8000-000000000000",
              runtimeIdentityId: "00000000-0000-4000-8000-000000000010",
            },
      );

      await expect(
        compareWalterLegacyOwnerWithCanonicalMembership({
          mode: "compare",
          confirmation,
          legacyAuthorized: true,
          userId,
          authorizer: canonical,
          audit:
            failure === "audit"
              ? async () => {
                  throw new Error("audit unavailable");
                }
              : async () => undefined,
        }),
      ).resolves.toEqual({
        authority: "legacy_owner",
        authorized: true,
        comparison: "error",
      });
    },
  );

  it("contains a thrown canonical dependency failure without changing legacy authority", async () => {
    const canonical = authorizer({
      authorized: false,
      reason: "authorization_unavailable",
    });
    canonical.authorize.mockRejectedValue(new Error("membership store failed"));
    const events: unknown[] = [];

    await expect(
      compareWalterLegacyOwnerWithCanonicalMembership({
        mode: "compare",
        confirmation,
        legacyAuthorized: true,
        userId,
        authorizer: canonical,
        audit: async (event) => events.push(event),
      }),
    ).resolves.toEqual({
      authority: "legacy_owner",
      authorized: true,
      comparison: "error",
    });
    expect(events).toEqual([
      {
        eventType: "walter_authorization_shadow_compared",
        authority: "legacy_owner",
        comparison: "error",
        legacyDecision: "allow",
        canonicalDecision: "unavailable",
      },
    ]);
  });
});
