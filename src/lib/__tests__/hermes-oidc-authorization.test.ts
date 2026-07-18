import {
  authorizeHermesOidcOwner,
  type HermesOidcAuthorizationContext,
  type HermesOidcAuthorizationGateway,
} from "@/lib/hermes-oidc";

describe("Hermes OIDC owner authorization", () => {
  const query = new URLSearchParams({
    client_id: "public-client-id",
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
});
