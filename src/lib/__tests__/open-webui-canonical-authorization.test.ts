import {
  authorizeOpenWebuiCanonicalEdge,
  authorizeOpenWebuiCanonicalOidc,
  authorizeOpenWebuiCanonicalToken,
  parseOpenWebuiAuthorizationMode,
  type OpenWebuiCanonicalAuthorizationContext,
  type OpenWebuiCanonicalGateway,
} from "@/lib/open-webui-canonical-authorization";
import {
  TITUS_OPEN_WEBUI,
  WALTER_OPEN_WEBUI,
  type OpenWebuiDeployment,
} from "@/lib/open-webui-deployments";
import type { MembershipAuthorizationDecision } from "@/lib/use-case-membership-authorization";

const membership = {
  authorized: true,
  membershipId: "00000000-0000-4000-8000-000000000003",
  role: "owner",
  scope: "use_case",
  useCaseId: "00000000-0000-4000-8000-000000000001",
  runtimeIdentityId: "00000000-0000-4000-8000-000000000002",
} satisfies MembershipAuthorizationDecision;

function context(
  deployment: OpenWebuiDeployment,
  overrides: Partial<OpenWebuiCanonicalAuthorizationContext> = {},
): OpenWebuiCanonicalAuthorizationContext {
  return {
    deployment,
    assignment: {
      enabled: true,
      deploymentId: deployment.deploymentId,
      useCaseId: membership.useCaseId,
      runtimeIdentityId: membership.runtimeIdentityId,
      host: deployment.host,
      oidcClientId: deployment.oidcClientId,
      oidcAudience: deployment.oidcClientId,
      issuer: deployment.issuer,
      hermesBaseUrl: deployment.hermesBaseUrl,
    },
    useCaseNumber: deployment.useCaseNumber,
    useCaseStatus: "active",
    runtimeStatus: "active",
    bindingsValid: true,
    client: {
      clientId: deployment.oidcClientId,
      clientSecret: null,
      disabled: false,
      redirectUris: [`https://${deployment.host}/oauth/oidc/callback`],
      scopes: ["openid", "email", "profile", "offline_access"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      public: true,
      type: "user-agent-based",
      requirePKCE: true,
      skipConsent: true,
      metadata: {
        kind: "open-webui",
        schemaVersion: 1,
        deploymentId: deployment.deploymentId,
        useCaseId: membership.useCaseId,
        runtimeIdentityId: membership.runtimeIdentityId,
      },
    },
    ...overrides,
  };
}

function gateway(
  deployment: OpenWebuiDeployment,
  decision: MembershipAuthorizationDecision = membership,
): OpenWebuiCanonicalGateway & { authorize: jest.Mock } {
  const value = context(deployment);
  return {
    findByClientId: jest.fn().mockResolvedValue(value),
    findByDeploymentId: jest.fn().mockResolvedValue(value),
    findByHost: jest.fn().mockResolvedValue(value),
    authorize: jest.fn().mockResolvedValue(decision),
  };
}

function query(deployment: OpenWebuiDeployment) {
  return new URLSearchParams({
    client_id: deployment.oidcClientId,
    response_type: "code",
    redirect_uri: `https://${deployment.host}/oauth/oidc/callback`,
    scope: "openid email profile offline_access",
    state: "state",
    nonce: "nonce",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
  }).toString();
}

const config = { mode: "canonical", confirmation: "ENABLE_OPEN_WEBUI_CANONICAL_GARY" };

describe("canonical Open WebUI authorization", () => {
  it("defaults disabled and requires the exact shared canonical confirmation", () => {
    expect(parseOpenWebuiAuthorizationMode()).toBe("disabled");
    expect(() =>
      parseOpenWebuiAuthorizationMode("canonical", "wrong"),
    ).toThrow("confirmation");
    expect(
      parseOpenWebuiAuthorizationMode(
        "canonical",
        "ENABLE_OPEN_WEBUI_CANONICAL_GARY",
      ),
    ).toBe("canonical");
    expect(() => parseOpenWebuiAuthorizationMode("legacy", "anything")).toThrow(
      "mode",
    );
  });

  it.each([TITUS_OPEN_WEBUI, WALTER_OPEN_WEBUI])(
    "authorizes exact OIDC, token, and edge membership for $deploymentId",
    async (deployment) => {
      const store = gateway(deployment);
      await expect(authorizeOpenWebuiCanonicalOidc({
        user: { id: "owner", emailVerified: true },
        scopes: ["openid", "email", "profile", "offline_access"],
        query: query(deployment),
      }, store, config)).resolves.toBe(deployment.deploymentId);
      await expect(authorizeOpenWebuiCanonicalToken({
        user: { id: "owner", emailVerified: true },
        scopes: ["openid", "email", "profile", "offline_access"],
        metadata: context(deployment).client.metadata ?? undefined,
      }, store, config)).resolves.toEqual({});
      await expect(authorizeOpenWebuiCanonicalEdge({
        userId: "owner",
        host: deployment.host,
        transport: "websocket",
      }, store, config)).resolves.toEqual({
        authorized: true,
        deploymentId: deployment.deploymentId,
      });
    },
  );

  it("denies a Walter client combined with any Titus context", async () => {
    const store = gateway(TITUS_OPEN_WEBUI);
    await expect(authorizeOpenWebuiCanonicalOidc({
      user: { id: "owner", emailVerified: true },
      scopes: ["openid", "email", "profile", "offline_access"],
      query: query(WALTER_OPEN_WEBUI),
    }, store, config)).rejects.toThrow("denied");
  });

  it("denies every transport after membership loss", async () => {
    const store = gateway(WALTER_OPEN_WEBUI, {
      authorized: false,
      reason: "not_authorized",
    });
    for (const transport of ["http", "sse", "websocket"] as const) {
      await expect(authorizeOpenWebuiCanonicalEdge({
        userId: "owner",
        host: WALTER_OPEN_WEBUI.host,
        transport,
      }, store, config)).resolves.toEqual({ authorized: false });
    }
  });
});
