import {
  TITUS_OPEN_WEBUI,
  authorizeTitusOpenWebuiEdge,
  authorizeTitusOpenWebuiOidc,
  authorizeTitusOpenWebuiToken,
  parseTitusOpenWebuiCanaryMode,
  type TitusOpenWebuiAuthorizationContext,
  type TitusOpenWebuiGateway,
} from "@/lib/open-webui-titus-canary";
import type { MembershipAuthorizationDecision } from "@/lib/use-case-membership-authorization";

const activeMembership = {
  authorized: true,
  membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
  role: "owner",
  scope: "use_case",
  useCaseId: "22222222-2222-4222-8222-222222222222",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222223",
} satisfies MembershipAuthorizationDecision;

function context(
  overrides: Partial<TitusOpenWebuiAuthorizationContext> = {},
): TitusOpenWebuiAuthorizationContext {
  return {
    assignment: {
      enabled: true,
      deploymentId: TITUS_OPEN_WEBUI.deploymentId,
      useCaseId: activeMembership.useCaseId,
      runtimeIdentityId: activeMembership.runtimeIdentityId,
      host: TITUS_OPEN_WEBUI.host,
      oidcClientId: TITUS_OPEN_WEBUI.oidcClientId,
      oidcAudience: TITUS_OPEN_WEBUI.oidcClientId,
      issuer: TITUS_OPEN_WEBUI.issuer,
      hermesBaseUrl: TITUS_OPEN_WEBUI.hermesBaseUrl,
    },
    useCaseNumber: 2,
    useCaseStatus: "active",
    runtimeStatus: "active",
    bindingsValid: true,
    client: {
      clientId: TITUS_OPEN_WEBUI.oidcClientId,
      clientSecret: null,
      disabled: false,
      redirectUris: [
        `https://${TITUS_OPEN_WEBUI.host}/oauth/oidc/callback`,
      ],
      scopes: ["openid", "email", "profile"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      public: true,
      type: "user-agent-based",
      requirePKCE: true,
      skipConsent: true,
      metadata: {
        kind: "open-webui",
        schemaVersion: 1,
        deploymentId: TITUS_OPEN_WEBUI.deploymentId,
        useCaseId: activeMembership.useCaseId,
        runtimeIdentityId: activeMembership.runtimeIdentityId,
      },
    },
    ...overrides,
  };
}

function gateway(
  value: TitusOpenWebuiAuthorizationContext | null = context(),
  decision: MembershipAuthorizationDecision = activeMembership,
): TitusOpenWebuiGateway & { authorize: jest.Mock } {
  return {
    findByClientId: jest.fn().mockResolvedValue(value),
    findByDeploymentId: jest.fn().mockResolvedValue(value),
    findByHost: jest.fn().mockResolvedValue(value),
    authorize: jest.fn().mockResolvedValue(decision),
  };
}

const enabled = {
  mode: "canonical",
  confirmation: "ENABLE_TITUS_OPEN_WEBUI_GARY",
};

function oidcQuery() {
  return new URLSearchParams({
    client_id: TITUS_OPEN_WEBUI.oidcClientId,
    response_type: "code",
    redirect_uri: `https://${TITUS_OPEN_WEBUI.host}/oauth/oidc/callback`,
    scope: "openid email profile",
    state: "fixture-state",
    nonce: "fixture-nonce",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
  }).toString();
}

describe("Titus Open WebUI canary gate", () => {
  it("defaults to disabled and requires the exact canonical confirmation", () => {
    expect(parseTitusOpenWebuiCanaryMode()).toBe("disabled");
    expect(() =>
      parseTitusOpenWebuiCanaryMode("canonical", "wrong"),
    ).toThrow("confirmation");
    expect(
      parseTitusOpenWebuiCanaryMode(
        "canonical",
        "ENABLE_TITUS_OPEN_WEBUI_GARY",
      ),
    ).toBe("canonical");
    expect(() => parseTitusOpenWebuiCanaryMode("legacy", "anything")).toThrow(
      "mode",
    );
  });

  it("authorizes the exact active Tenet 2 OIDC client and membership", async () => {
    const store = gateway();
    await expect(
      authorizeTitusOpenWebuiOidc(
        {
          user: { id: "gary-user-id", emailVerified: true },
          scopes: ["openid", "email", "profile"],
          query: oidcQuery(),
        },
        store,
        enabled,
      ),
    ).resolves.toBe(TITUS_OPEN_WEBUI.deploymentId);
    expect(store.authorize).toHaveBeenCalledWith({
      userId: "gary-user-id",
      useCaseId: activeMembership.useCaseId,
      runtimeIdentityId: activeMembership.runtimeIdentityId,
    });
  });

  it.each([
    ["disabled canary", context(), { mode: "disabled" }],
    ["wrong Tenet", context({ useCaseNumber: 1 }), enabled],
    ["inactive runtime", context({ runtimeStatus: "suspended" }), enabled],
    ["invalid bindings", context({ bindingsValid: false }), enabled],
    [
      "disabled client",
      context({ client: { ...context().client, disabled: true } }),
      enabled,
    ],
  ])("denies OIDC for %s", async (_name, value, canary) => {
    await expect(
      authorizeTitusOpenWebuiOidc(
        {
          user: { id: "gary-user-id", emailVerified: true },
          scopes: ["openid", "email", "profile"],
          query: oidcQuery(),
        },
        gateway(value),
        canary,
      ),
    ).rejects.toThrow("denied");
  });

  it("rechecks membership when issuing the ID token", async () => {
    const store = gateway();
    await expect(
      authorizeTitusOpenWebuiToken(
        {
          user: { id: "gary-user-id", emailVerified: true },
          scopes: ["openid", "email", "profile"],
          metadata: context().client.metadata ?? undefined,
        },
        store,
        enabled,
      ),
    ).resolves.toEqual({});
    expect(store.authorize).toHaveBeenCalledTimes(1);
  });

  it("denies token issuance and every edge transport after membership loss", async () => {
    const store = gateway(context(), {
      authorized: false,
      reason: "not_authorized",
    });
    await expect(
      authorizeTitusOpenWebuiToken(
        {
          user: { id: "gary-user-id", emailVerified: true },
          scopes: ["openid", "email", "profile"],
          metadata: context().client.metadata ?? undefined,
        },
        store,
        enabled,
      ),
    ).rejects.toThrow("denied");

    for (const transport of ["http", "sse", "websocket"] as const) {
      await expect(
        authorizeTitusOpenWebuiEdge(
          {
            userId: "gary-user-id",
            host: TITUS_OPEN_WEBUI.host,
            transport,
          },
          store,
          enabled,
        ),
      ).resolves.toBe(false);
    }
  });

  it("performs zero membership work when the canary is disabled", async () => {
    const store = gateway();
    await expect(
      authorizeTitusOpenWebuiEdge(
        {
          userId: "gary-user-id",
          host: TITUS_OPEN_WEBUI.host,
          transport: "http",
        },
        store,
        { mode: "disabled" },
      ),
    ).resolves.toBe(false);
    expect(store.findByHost).not.toHaveBeenCalled();
    expect(store.authorize).not.toHaveBeenCalled();
  });
});
