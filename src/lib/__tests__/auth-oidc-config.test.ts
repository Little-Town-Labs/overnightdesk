import {
  HERMES_DASHBOARD_OIDC_SCOPES,
  HERMES_JWT_OPTIONS,
  HERMES_OAUTH_PROVIDER_OPTIONS,
  HERMES_OIDC_PROVIDER_SCOPES,
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

  it("supports bounded refresh tokens without widening dashboard clients", () => {
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.codeExpiresIn).toBe(120);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.accessTokenExpiresIn).toBe(900);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.idTokenExpiresIn).toBe(900);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.refreshTokenExpiresIn).toBe(
      7 * 24 * 60 * 60,
    );
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.grantTypes).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    expect(HERMES_OAUTH_PROVIDER_OPTIONS.scopes).toEqual(
      HERMES_OIDC_PROVIDER_SCOPES,
    );
    expect(HERMES_OIDC_PROVIDER_SCOPES).toContain("offline_access");
    expect(HERMES_DASHBOARD_OIDC_SCOPES).not.toContain("offline_access");
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
      hasForbiddenOAuthResourceIndicator("/oauth2/token", {
        grant_type: "refresh_token",
        refresh_token: "opaque-refresh-token",
        resource: "https://unexpected.example",
      })
    ).toBe(true);
    expect(
      hasForbiddenOAuthResourceIndicator("/oauth2/token", {
        grant_type: "refresh_token",
        refresh_token: "opaque-refresh-token",
      })
    ).toBe(false);
    expect(
      hasForbiddenOAuthResourceIndicator("/oauth2/authorize", {
        resource: "https://unexpected.example",
      })
    ).toBe(false);
  });
});
