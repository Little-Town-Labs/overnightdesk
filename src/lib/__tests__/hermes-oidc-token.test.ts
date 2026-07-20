import {
  authorizeHermesOidcToken,
  type HermesOidcAuthorizationContext,
  type HermesOidcTokenGateway,
  type HermesOidcWalterAuthorizationConfig,
} from "@/lib/hermes-oidc";
import type { MembershipAuthorizationDecision } from "@/lib/use-case-membership-authorization";

describe("Hermes OIDC token-time authorization", () => {
  const activeContext: HermesOidcAuthorizationContext = {
    instanceId: "instance-1",
    instanceUserId: "owner-1",
    instanceTenantId: "tenant-0",
    instanceSubdomain: "aegis-prod.overnightdesk.com",
    instanceStatus: "running",
    dashboardAuthStatus: "active",
    linkedClientId: "public-client-id",
    client: {
      clientId: "public-client-id",
      clientSecret: null,
      disabled: false,
      redirectUris: ["https://aegis-prod.overnightdesk.com/auth/callback"],
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

  function walterAuthorization(
    mode: "legacy" | "canonical",
    decision: MembershipAuthorizationDecision,
  ): HermesOidcWalterAuthorizationConfig & {
    gateway: { authorize: jest.Mock; recordComparison: jest.Mock };
  } {
    return {
      mode,
      canonicalConfirmation: "ENABLE_WALTER_CANONICAL_MEMBERSHIP",
      gateway: {
        authorize: jest.fn().mockResolvedValue(decision),
        recordComparison: jest.fn().mockResolvedValue(undefined),
      },
    };
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

  it("issues a token to an active canonical member without legacy ownership", async () => {
    const authorization = walterAuthorization("canonical", {
      authorized: true,
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      role: "owner",
      scope: "use_case",
      useCaseId: "00000000-0000-4000-8000-000000000000",
      runtimeIdentityId: "00000000-0000-4000-8000-000000000010",
    });

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "active-member", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext),
        authorization,
      ),
    ).resolves.toEqual({});
  });

  it("denies token issuance after canonical membership is suspended or expired", async () => {
    const authorization = walterAuthorization("canonical", {
      authorized: false,
      reason: "not_authorized",
    });

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext),
        authorization,
      ),
    ).rejects.toThrow("denied");
  });

  it("returns to legacy owner checks with zero canonical work after rollback", async () => {
    const authorization = walterAuthorization("legacy", {
      authorized: false,
      reason: "not_authorized",
    });

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext),
        authorization,
      ),
    ).resolves.toEqual({});
    expect(authorization.gateway.authorize).not.toHaveBeenCalled();
    expect(authorization.gateway.recordComparison).not.toHaveBeenCalled();
  });
});
