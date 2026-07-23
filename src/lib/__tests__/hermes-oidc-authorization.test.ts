import {
  authorizeHermesOidcOwner,
  type HermesOidcAuthorizationContext,
  type HermesOidcAuthorizationGateway,
  type HermesOidcMembershipGateway,
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
      instanceSubdomain: "tenant-a.overnightdesk.com",
      instanceStatus: "running",
      dashboardAuthStatus: "active",
      linkedClientId: "public-client-id",
      useCaseId: null,
      runtimeIdentityId: null,
      oidcBindingValid: true,
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

  function canonicalContext(
    tenant: "titus" | "walter",
  ): HermesOidcAuthorizationContext {
    const isWalter = tenant === "walter";
    const subdomain = isWalter
      ? "aegis-prod.overnightdesk.com"
      : "titus-dashboard.overnightdesk.com";
    return context({
      instanceSubdomain: subdomain,
      useCaseId: isWalter
        ? "00000000-0000-4000-8000-000000000000"
        : "00000000-0000-4000-8000-000000000002",
      runtimeIdentityId: isWalter
        ? "00000000-0000-4000-8000-000000000010"
        : "00000000-0000-4000-8000-000000000012",
      client: {
        ...context().client,
        redirectUris: [`https://${subdomain}/auth/callback`],
      },
    });
  }

  function canonicalQuery(tenant: "titus" | "walter"): string {
    const value = new URLSearchParams(query);
    value.set(
      "redirect_uri",
      tenant === "walter"
        ? "https://aegis-prod.overnightdesk.com/auth/callback"
        : "https://titus-dashboard.overnightdesk.com/auth/callback",
    );
    return value.toString();
  }

  function membershipGateway(
    decision: MembershipAuthorizationDecision,
  ): HermesOidcMembershipGateway & {
    authorize: jest.Mock;
  } {
    return {
      authorize: jest.fn().mockResolvedValue(decision),
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
    ["missing runtime-scoped OIDC binding", context({ oidcBindingValid: false })],
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

  describe("canonical dashboard membership", () => {
    function activeMembership(
      tenant: "titus" | "walter",
      scope: "use_case" | "runtime" = "runtime",
    ): MembershipAuthorizationDecision {
      const linked = canonicalContext(tenant);
      return {
        authorized: true,
        membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
        role: "owner",
        scope,
        useCaseId: linked.useCaseId!,
        runtimeIdentityId: linked.runtimeIdentityId,
      };
    }

    it.each(["titus", "walter"] as const)(
      "allows an active canonically linked %s runtime member without legacy ownership",
      async (tenant) => {
        const membership = membershipGateway(activeMembership(tenant));
        const linked = canonicalContext(tenant);

        await expect(
          authorizeHermesOidcOwner(
            {
              user: { id: "active-member", emailVerified: true },
              scopes: ["openid", "profile", "email"],
              query: canonicalQuery(tenant),
            },
            gateway(linked),
            membership,
          ),
        ).resolves.toBe("instance-1");
        expect(membership.authorize).toHaveBeenCalledWith({
          userId: "active-member",
          useCaseId: linked.useCaseId,
          runtimeIdentityId: linked.runtimeIdentityId,
        });
      },
    );

    it("accepts use-case-wide membership for an exact linked runtime", async () => {
      const membership = membershipGateway(activeMembership("titus", "use_case"));

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "active-member", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: canonicalQuery("titus"),
          },
          gateway(canonicalContext("titus")),
          membership,
        ),
      ).resolves.toBe("instance-1");
    });

    it.each(["non-member", "suspended member", "revoked member", "expired member"])(
      "denies a canonically linked runtime for a %s",
      async () => {
        const membership = membershipGateway({
          authorized: false,
          reason: "not_authorized",
        });

        await expect(
          authorizeHermesOidcOwner(
            {
              user: { id: "owner-1", emailVerified: true },
              scopes: ["openid", "profile", "email"],
              query: canonicalQuery("titus"),
            },
            gateway(canonicalContext("titus")),
            membership,
          ),
        ).rejects.toThrow("Hermes dashboard authorization denied");
      },
    );

    it("restores authorization only after current canonical membership returns", async () => {
      const membership = membershipGateway({
        authorized: false,
        reason: "not_authorized",
      });
      membership.authorize
        .mockResolvedValueOnce({ authorized: false, reason: "not_authorized" })
        .mockResolvedValueOnce(activeMembership("titus"));
      const request = {
        user: { id: "owner-1", emailVerified: true },
        scopes: ["openid", "profile", "email"],
        query: canonicalQuery("titus"),
      };

      await expect(
        authorizeHermesOidcOwner(
          request,
          gateway(canonicalContext("titus")),
          membership,
        ),
      ).rejects.toThrow("Hermes dashboard authorization denied");
      await expect(
        authorizeHermesOidcOwner(
          request,
          gateway(canonicalContext("titus")),
          membership,
        ),
      ).resolves.toBe("instance-1");
    });

    it("fails closed on partial canonical linkage without consulting membership", async () => {
      const membership = membershipGateway(activeMembership("titus"));

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: canonicalQuery("titus"),
          },
          gateway(canonicalContext("titus")),
          membership,
        ),
      ).resolves.toBe("instance-1");

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: canonicalQuery("titus"),
          },
          gateway({
            ...canonicalContext("titus"),
            runtimeIdentityId: null,
          }),
          membership,
        ),
      ).rejects.toThrow("Hermes dashboard authorization denied");
      expect(membership.authorize).toHaveBeenCalledTimes(1);
    });

    it("keeps an explicitly unlinked legacy dashboard on exact-owner authority", async () => {
      const membership = membershipGateway(activeMembership("titus"));

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query,
          },
          gateway(context()),
          membership,
        ),
      ).resolves.toBe("instance-1");
      expect(membership.authorize).not.toHaveBeenCalled();

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "other-user", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query,
          },
          gateway(context()),
          membership,
        ),
      ).rejects.toThrow("Hermes dashboard authorization denied");
    });

    it("returns a fixed value-free failure when membership storage is unavailable", async () => {
      const membership = membershipGateway({
        authorized: false,
        reason: "authorization_unavailable",
      });
      membership.authorize.mockRejectedValue(
        new Error("owner@example.com cookie-value postgres://secret"),
      );

      await expect(
        authorizeHermesOidcOwner(
          {
            user: { id: "owner-1", emailVerified: true },
            scopes: ["openid", "profile", "email"],
            query: canonicalQuery("titus"),
          },
          gateway(canonicalContext("titus")),
          membership,
        ),
      ).rejects.toThrow(/^Hermes dashboard authorization denied$/);
    });
  });
});
