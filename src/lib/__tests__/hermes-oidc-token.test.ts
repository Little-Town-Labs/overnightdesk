import {
  authorizeHermesOidcToken,
  type HermesOidcAuthorizationContext,
  type HermesOidcMembershipGateway,
  type HermesOidcTokenGateway,
} from "@/lib/hermes-oidc";
import type { MembershipAuthorizationDecision } from "@/lib/use-case-membership-authorization";

describe("Hermes OIDC token-time authorization", () => {
  const activeContext: HermesOidcAuthorizationContext = {
    instanceId: "instance-1",
    instanceUserId: "owner-1",
    instanceSubdomain: "aegis-prod.overnightdesk.com",
    instanceStatus: "running",
    dashboardAuthStatus: "active",
    linkedClientId: "public-client-id",
    useCaseId: "00000000-0000-4000-8000-000000000000",
    runtimeIdentityId: "00000000-0000-4000-8000-000000000010",
    oidcBindingValid: true,
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

  function membershipGateway(
    decision: MembershipAuthorizationDecision,
  ): HermesOidcMembershipGateway & {
    authorize: jest.Mock;
  } {
    return {
      authorize: jest.fn().mockResolvedValue(decision),
    };
  }

  const activeMembership: MembershipAuthorizationDecision = {
    authorized: true,
    membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
    role: "owner",
    scope: "runtime",
    useCaseId: activeContext.useCaseId!,
    runtimeIdentityId: activeContext.runtimeIdentityId,
  };

  it("accepts a still-active runtime member and returns no elevated claims", async () => {
    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext),
        membershipGateway(activeMembership),
      )
    ).resolves.toEqual({});
  });

  it.each([
    ["instance stop", { ...activeContext, instanceStatus: "error" }],
    ["linkage disable", { ...activeContext, dashboardAuthStatus: "disabled" }],
    ["OIDC binding rollback", { ...activeContext, oidcBindingValid: false }],
    ["client disable", { ...activeContext, client: { ...activeContext.client, disabled: true } }],
  ])("denies token creation after %s", async (_name, value) => {
    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(value),
        membershipGateway(activeMembership),
      )
    ).rejects.toThrow("denied");
  });

  it("does not treat legacy instance ownership as authority for a canonical link", async () => {
    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway({ ...activeContext, instanceUserId: "former-owner" }),
        membershipGateway(activeMembership),
      ),
    ).resolves.toEqual({});
  });

  it("issues a token to an active canonical member without legacy ownership", async () => {
    const membership = membershipGateway(activeMembership);

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "active-member", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext),
        membership,
      ),
    ).resolves.toEqual({});
  });

  it("denies token issuance after canonical membership is suspended or expired", async () => {
    const membership = membershipGateway({
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
        membership,
      ),
    ).rejects.toThrow("denied");
  });

  it("uses exact-owner compatibility only for an explicitly unlinked legacy instance", async () => {
    const legacyContext: HermesOidcAuthorizationContext = {
      ...activeContext,
      instanceSubdomain: "legacy-tenant.overnightdesk.com",
      useCaseId: null,
      runtimeIdentityId: null,
      client: {
        ...activeContext.client,
        redirectUris: ["https://legacy-tenant.overnightdesk.com/auth/callback"],
      },
    };
    const membership = membershipGateway({
      authorized: false,
      reason: "authorization_unavailable",
    });

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: legacyContext.client.metadata ?? undefined,
        },
        gateway(legacyContext),
        membership,
      ),
    ).resolves.toEqual({});
    expect(membership.authorize).not.toHaveBeenCalled();
  });

  it("fails closed on a partial canonical link before membership lookup", async () => {
    const membership = membershipGateway(activeMembership);

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway({ ...activeContext, runtimeIdentityId: null }),
        membership,
      ),
    ).rejects.toThrow("Hermes dashboard authorization denied");
    expect(membership.authorize).not.toHaveBeenCalled();
  });

  it("returns a fixed value-free failure when canonical token authority is unavailable", async () => {
    const membership = membershipGateway({
      authorized: false,
      reason: "authorization_unavailable",
    });
    membership.authorize.mockRejectedValue(
      new Error("owner@example.com refresh-token postgres://secret"),
    );

    await expect(
      authorizeHermesOidcToken(
        {
          user: { id: "owner-1", emailVerified: true },
          scopes: ["openid", "profile", "email"],
          metadata: activeContext.client.metadata ?? undefined,
        },
        gateway(activeContext),
        membership,
      ),
    ).rejects.toThrow(/^Hermes dashboard authorization denied$/);
  });
});
