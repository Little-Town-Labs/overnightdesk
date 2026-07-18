import {
  authorizeHermesOidcToken,
  type HermesOidcAuthorizationContext,
  type HermesOidcTokenGateway,
} from "@/lib/hermes-oidc";

describe("Hermes OIDC token-time authorization", () => {
  const activeContext: HermesOidcAuthorizationContext = {
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
      metadata: { kind: "hermes-dashboard", schemaVersion: 1, instanceId: "instance-1" },
    },
  };

  function gateway(
    value: HermesOidcAuthorizationContext | null
  ): HermesOidcTokenGateway {
    return { findByInstanceId: jest.fn().mockResolvedValue(value) };
  }

  it("accepts the still-active owner and returns no elevated claims", async () => {
    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext)
      )
    ).resolves.toEqual({});
  });

  it.each([
    ["ownership change", { ...activeContext, instanceUserId: "owner-2" }],
    ["instance stop", { ...activeContext, instanceStatus: "error" }],
    ["linkage disable", { ...activeContext, dashboardAuthStatus: "disabled" }],
    ["client disable", { ...activeContext, client: { ...activeContext.client, disabled: true } }],
  ])("denies token creation after %s", async (_name, value) => {
    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(value)
      )
    ).rejects.toThrow("denied");
  });
});
