import {
  HERMES_JWT_OPTIONS,
  HERMES_OAUTH_PROVIDER_OPTIONS,
  HERMES_OIDC_SCOPES,
  hasForbiddenOAuthResourceIndicator,
} from "@/lib/hermes-oidc-config";

describe("Hermes OIDC provider configuration", () => {
  it("uses the Hermes-compatible RS256 signing profile", () => {
    expect(HERMES_JWT_OPTIONS.jwks?.keyPairConfig).toEqual({
      alg: "RS256",
      modulusLength: 2048,
    });
    expect(HERMES_JWT_OPTIONS.jwks?.rotationInterval).toBe(30 * 24 * 60 * 60);
    expect(HERMES_JWT_OPTIONS.jwks?.gracePeriod).toBe(60 * 60);
    expect(HERMES_JWT_OPTIONS.disableSettingJwtHeader).toBe(true);
  });

  it("limits Hermes to short-lived authorization-code tokens", () => {
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.codeExpiresIn).toBe(120);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.accessTokenExpiresIn).toBe(900);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.idTokenExpiresIn).toBe(900);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.grantTypes).toEqual([
      "authorization_code",
    ]);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.scopes).toEqual(HERMES_OIDC_SCOPES);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.scopes).not.toContain("offline_access");
  });

  it("keeps every client-registration and browser CRUD path closed", async () => {
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.allowDynamicClientRegistration).toBe(
      false
    );
    expect(
      HERMES_OAUTH_PROVIDER_OPTIONS.allowUnauthenticatedClientRegistration
    ).toBe(false);
    await expect(
      HERMES_OAUTH_PROVIDER_OPTIONS.clientPrivileges?.({
        headers: new Headers(),
        action: "create",
      })
    ).resolves.toBe(false);
  });
});

describe("OAuth resource-indicator mitigation", () => {
  it("rejects token resource indicators while allowing the fixed Hermes exchange", () => {
    expect(
      hasForbiddenOAuthResourceIndicator("/oauth2/token", {
        grant_type: "authorization_code",
        resource: "https://unexpected.example",
      })
    ).toBe(true);
    expect(
      hasForbiddenOAuthResourceIndicator("/oauth2/token", {
        grant_type: "authorization_code",
      })
    ).toBe(false);
    expect(
      hasForbiddenOAuthResourceIndicator("/oauth2/authorize", {
        resource: "https://unexpected.example",
      })
    ).toBe(false);
  });
});
