import {
  buildTitusOpenWebuiProvisioningSpec,
  verifyTitusOpenWebuiProvisioningSnapshot,
} from "@/lib/open-webui-titus-provisioning";
import { TITUS_OPEN_WEBUI } from "@/lib/open-webui-titus-canary";
import { buildOpenWebuiOidcClientPayload } from "@/lib/open-webui-auth-spike";

const identity = {
  useCaseId: "22222222-2222-4222-8222-222222222222",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222223",
};

describe("Titus Open WebUI provisioning specification", () => {
  it("creates only the five exact runtime bindings and dedicated secret boundary", () => {
    const spec = buildTitusOpenWebuiProvisioningSpec(identity);
    expect(spec.resourceBindings).toEqual([
      ["docker", "container", TITUS_OPEN_WEBUI.deploymentId],
      ["docker", "volume", TITUS_OPEN_WEBUI.volume],
      ["overnightdesk", "hostname", TITUS_OPEN_WEBUI.host],
      ["better-auth", "oidc_client", TITUS_OPEN_WEBUI.oidcClientId],
      ["phase", "phase_path", TITUS_OPEN_WEBUI.phasePath],
    ]);
    expect(spec.secretBoundary).toEqual({
      phaseApp: "timeless-tech-solutions",
      environment: "production",
      pathIdentifier: "/agents/open-webui/hermes-titus",
    });
  });

  it("defines a public PKCE client that is disabled by default", () => {
    const client = buildTitusOpenWebuiProvisioningSpec(identity).client;
    expect(client).toMatchObject({
      clientId: "overnightdesk-open-webui-titus-v1",
      clientSecret: null,
      disabled: true,
      redirectUris: [
        "https://titus-chat.overnightdesk.com/oauth/oidc/callback",
      ],
      scopes: ["openid", "email", "profile"],
      tokenEndpointAuthMethod: "none",
      public: true,
      requirePKCE: true,
      postLogoutRedirectUris: [
        "https://www.overnightdesk.com/dashboard/chat?workspace=logged-out",
      ],
      metadata: {
        kind: "open-webui",
        schemaVersion: 1,
        deploymentId: "open-webui-hermes-titus",
        ...identity,
      },
    });
  });

  it("matches the reviewed Open WebUI authorization client contract", () => {
    const spec = buildTitusOpenWebuiProvisioningSpec(identity).client;
    const authorization = buildOpenWebuiOidcClientPayload({
      enabled: true,
      deploymentId: TITUS_OPEN_WEBUI.deploymentId,
      ...identity,
      host: TITUS_OPEN_WEBUI.host,
      oidcClientId: TITUS_OPEN_WEBUI.oidcClientId,
      oidcAudience: TITUS_OPEN_WEBUI.oidcClientId,
      issuer: TITUS_OPEN_WEBUI.issuer,
      hermesBaseUrl: TITUS_OPEN_WEBUI.hermesBaseUrl,
    });
    const provisionedContract = {
      redirect_uris: spec.redirectUris,
      scope: spec.scopes.join(" "),
      token_endpoint_auth_method: spec.tokenEndpointAuthMethod,
      grant_types: spec.grantTypes,
      response_types: spec.responseTypes,
      type: spec.type,
      skip_consent: spec.skipConsent,
      require_pkce: spec.requirePKCE,
      metadata: spec.metadata,
    };
    const authorizationContract = {
      redirect_uris: authorization.redirect_uris,
      scope: authorization.scope,
      token_endpoint_auth_method: authorization.token_endpoint_auth_method,
      grant_types: authorization.grant_types,
      response_types: authorization.response_types,
      type: authorization.type,
      skip_consent: authorization.skip_consent,
      require_pkce: authorization.require_pkce,
      metadata: authorization.metadata,
    };
    expect(provisionedContract).toEqual(authorizationContract);
  });

  it("accepts an exact disabled or enabled snapshot and rejects drift", () => {
    const spec = buildTitusOpenWebuiProvisioningSpec(identity);
    const snapshot = {
      useCaseNumber: 2,
      useCaseStatus: "active",
      runtimeStatus: "active",
      activeOwnerMemberships: 1,
      resourceBindings: spec.resourceBindings,
      secretBoundary: spec.secretBoundary,
      client: spec.client,
    };

    expect(verifyTitusOpenWebuiProvisioningSnapshot(snapshot)).toEqual({
      state: "disabled",
      useCaseNumber: 2,
      activeOwnerMemberships: 1,
      resourceBindings: 5,
      secretBoundaries: 1,
      oidcClients: 1,
    });
    expect(
      verifyTitusOpenWebuiProvisioningSnapshot({
        ...snapshot,
        client: { ...snapshot.client, disabled: false },
      }),
    ).toMatchObject({ state: "enabled" });
    expect(() =>
      verifyTitusOpenWebuiProvisioningSnapshot({
        ...snapshot,
        activeOwnerMemberships: 0,
      }),
    ).toThrow("Invalid Titus Open WebUI provisioning state");
  });

  it("accepts JSONB metadata after PostgreSQL normalizes object key order", () => {
    const spec = buildTitusOpenWebuiProvisioningSpec(identity);
    const client = {
      ...spec.client,
      metadata: {
        runtimeIdentityId: identity.runtimeIdentityId,
        useCaseId: identity.useCaseId,
        deploymentId: "open-webui-hermes-titus",
        schemaVersion: 1 as const,
        kind: "open-webui" as const,
      },
    };

    expect(
      verifyTitusOpenWebuiProvisioningSnapshot({
        useCaseNumber: 2,
        useCaseStatus: "active",
        runtimeStatus: "active",
        activeOwnerMemberships: 1,
        resourceBindings: spec.resourceBindings,
        secretBoundary: spec.secretBoundary,
        client,
      }),
    ).toMatchObject({ state: "disabled" });
  });
});
