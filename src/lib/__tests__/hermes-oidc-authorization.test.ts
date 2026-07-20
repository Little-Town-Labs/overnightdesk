import {
  authorizeHermesOidcOwner,
  type HermesOidcAuthorizationContext,
  type HermesOidcAuthorizationGateway,
  type HermesOidcWalterAuthorizationConfig,
} from "@/lib/hermes-oidc";
import type { MembershipAuthorizationDecision } from "@/lib/use-case-membership-authorization";

describe("Hermes OIDC owner authorization", () => {
  const query = new URLSearchParams({
    client_id: "public-client-id",
    response_type: "code",
    redirect_uri: "https://tenant-a.overnightdesk.com/auth/callback",
    scope: "openid profile email",
    state: "state-value",
    nonce: "nonce-value",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
  }).toString();

  function context(
    overrides: Partial<HermesOidcAuthorizationContext> = {}
  ): HermesOidcAuthorizationContext {
    return {
      instanceId: "instance-1",
      instanceUserId: "owner-1",
      instanceTenantId: "tenant-a",
      instanceSubdomain: "tenant-a.overnightdesk.com",
      instanceStatus: "running",
      dashboardAuthStatus: "active",
      linkedClientId: "public-client-id",
      client: {
        clientId: "public-client-id",
        clientSecret: null,
        disabled: false,
        redirectUris: ["https://tenant-a.overnightdesk.com/auth/callback"],
        scopes: ["openid", "profile", "email"],
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        public: true,
        type: "user-agent-based",
        requirePKCE: true,
        skipConsent: true,
        metadata: {
          kind: "hermes-dashboard",
          schemaVersion: 1,
          instanceId: "instance-1",
        },
      },
      ...overrides,
    };
  }

  function gateway(
    value: HermesOidcAuthorizationContext | null = context()
  ): HermesOidcAuthorizationGateway {
    return { findByClientId: jest.fn().mockResolvedValue(value) };
  }

  function walterContext(): HermesOidcAuthorizationContext {
    return context({
      instanceTenantId: "tenant-0",
      instanceSubdomain: "aegis-prod.overnightdesk.com",
      client: {
        ...context().client,
        redirectUris: [
          "https://aegis-prod.overnightdesk.com/auth/callback",
        ],
      },
    });
  }

  function walterQuery(): string {
    const value = new URLSearchParams(query);
    value.set(
      "redirect_uri",
      "https://aegis-prod.overnightdesk.com/auth/callback",
    );
    return value.toString();
  }

  function walterAuthorization(
    mode: "legacy" | "compare" | "canonical",
    decision: MembershipAuthorizationDecision,
  ): HermesOidcWalterAuthorizationConfig & {
    gateway: {
      authorize: jest.Mock;
      recordComparison: jest.Mock;
    };
  } {
    return {
      mode,
      comparisonConfirmation: "COMPARE_WALTER_MEMBERSHIP_SHADOW",
      canonicalConfirmation: "ENABLE_WALTER_CANONICAL_MEMBERSHIP",
      gateway: {
        authorize: jest.fn().mockResolvedValue(decision),
        recordComparison: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  it("authorizes only the verified canonical owner with the exact contract", async () => {
    await expect(
      authorizeHermesOidcOwner(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          query,
        },
        gateway()
      )
    ).resolves.toBe("instance-1");
  });

  it("authorizes Hermes authorization-code PKCE requests without a nonce", async () => {
    const hermesQuery = new URLSearchParams(query);
    hermesQuery.delete("nonce");

    await expect(
      authorizeHermesOidcOwner(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          query: hermesQuery.toString(),
        },
        gateway()
      )
    ).resolves.toBe("instance-1");
  });

  it.each([
    ["unknown client", null],
    ["wrong owner", context({ instanceUserId: "owner-2" })],
    ["wrong client link", context({ linkedClientId: "other-client" })],
    ["inactive instance", context({ instanceStatus: "error" })],
    ["inactive linkage", context({ dashboardAuthStatus: "pending" })],
    ["disabled client", context({ client: { ...context().client, disabled: true } })],
    ["malformed metadata", context({ client: { ...context().client, metadata: null } })],
  ])("denies %s", async (_name, value) => {
    await expect(
      authorizeHermesOidcOwner(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          query,
        },
        gateway(value)
      )
    ).rejects.toThrow("denied");
  });

  it("denies an unverified owner", async () => {
    await expect(
      authorizeHermesOidcOwner(
        {
          user: { id: "owner-1", emailVerified: false },
          scopes: ["openid", "profile", "email"],
          query,
        },
        gateway()
      )
    ).rejects.toThrow("denied");
  });

  it.each([
    ["callback", { redirect_uri: "https://other.overnightdesk.com/auth/callback" }],
    ["response type", { response_type: "token" }],
    ["scope", { scope: "openid profile email admin" }],
    ["state", { state: "" }],
    ["nonce", { nonce: "" }],
    ["PKCE method", { code_challenge_method: "plain" }],
    ["PKCE challenge", { code_challenge: "short" }],
  ])("denies an invalid %s", async (_name, change) => {
    const altered = new URLSearchParams(query);
    for (const [key, value] of Object.entries(change)) altered.set(key, value);

    await expect(
      authorizeHermesOidcOwner(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: altered.get("scope")?.split(" ") ?? [],
          query: altered.toString(),
        },
        gateway()
      )
    ).rejects.toThrow("denied");
  });

  describe("Walter canonical membership cutover", () => {
    const activeMembership: MembershipAuthorizationDecision = {
      authorized: true,
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      role: "owner",
      scope: "use_case",
      useCaseId: "00000000-0000-4000-8000-000000000000",
      runtimeIdentityId: "00000000-0000-4000-8000-000000000010",
    };

    it("allows an active canonical member without legacy ownership", async () => {
      const authorization = walterAuthorization(
        "canonical",
        activeMembership,
      );

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "active-member", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: walterQuery(),
          },
          gateway(walterContext()),
          authorization,
        ),
      ).resolves.toBe("instance-1");
      expect(authorization.gateway.authorize).toHaveBeenCalledWith({
        userId: "active-member",
        legacyTenantId: "tenant-0",
      });
    });

    it.each(["non-member", "suspended member", "expired member"])(
      "denies the legacy owner when canonical authority sees a %s",
      async () => {
        const authorization = walterAuthorization("canonical", {
          authorized: false,
          reason: "not_authorized",
        });

        await expect(
          authorizeHermesOidcOwner(
            {
              user: { id: "owner-1", emailVerified: true },
              scopes: ["openid", "profile", "email"],
              query: walterQuery(),
            },
            gateway(walterContext()),
            authorization,
          ),
        ).rejects.toThrow("denied");
      },
    );

    it("fails closed when canonical authorization is unavailable", async () => {
      const authorization = walterAuthorization("canonical", {
        authorized: false,
        reason: "authorization_unavailable",
      });

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: walterQuery(),
          },
          gateway(walterContext()),
          authorization,
        ),
      ).rejects.toThrow("denied");
    });

    it("keeps the legacy owner authoritative in compare mode", async () => {
      const authorization = walterAuthorization("compare", {
        authorized: false,
        reason: "not_authorized",
      });

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: walterQuery(),
          },
          gateway(walterContext()),
          authorization,
        ),
      ).resolves.toBe("instance-1");
      expect(authorization.gateway.recordComparison).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: "legacy_owner",
          comparison: "mismatch",
          legacyDecision: "allow",
          canonicalDecision: "deny",
        }),
      );
    });

    it("does not let a canonical grant override a legacy denial in compare mode", async () => {
      const authorization = walterAuthorization("compare", activeMembership);

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "active-member", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: walterQuery(),
          },
          gateway(walterContext()),
          authorization,
        ),
      ).rejects.toThrow("denied");
    });

    it("performs zero canonical work after rollback to legacy mode", async () => {
      const authorization = walterAuthorization("legacy", {
        authorized: false,
        reason: "not_authorized",
      });

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: walterQuery(),
          },
          gateway(walterContext()),
          authorization,
        ),
      ).resolves.toBe("instance-1");
      expect(authorization.gateway.authorize).not.toHaveBeenCalled();
      expect(authorization.gateway.recordComparison).not.toHaveBeenCalled();
    });

    it("requires the exact canonical confirmation before membership lookup", async () => {
      const authorization = walterAuthorization(
        "canonical",
        activeMembership,
      );
      authorization.canonicalConfirmation = undefined;

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: walterQuery(),
          },
          gateway(walterContext()),
          authorization,
        ),
      ).rejects.toThrow("denied");
      expect(authorization.gateway.authorize).not.toHaveBeenCalled();
    });

    it("leaves non-Walter OIDC clients on legacy owner authorization", async () => {
      const authorization = walterAuthorization(
        "canonical",
        activeMembership,
      );

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query,
          },
          gateway(context()),
          authorization,
        ),
      ).resolves.toBe("instance-1");
      expect(authorization.gateway.authorize).not.toHaveBeenCalled();
    });
  });
});
