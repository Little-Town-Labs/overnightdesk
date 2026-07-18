import type { OAuthOptions } from "@better-auth/oauth-provider";
import type { JwtOptions } from "better-auth/plugins";

export const HERMES_OIDC_SCOPES = ["openid", "profile", "email"] as const;

export const HERMES_JWT_OPTIONS = {
  jwks: {
    keyPairConfig: {
      alg: "RS256",
      modulusLength: 2048,
    },
    rotationInterval: 30 * 24 * 60 * 60,
    gracePeriod: 60 * 60,
  },
  disableSettingJwtHeader: true,
} satisfies JwtOptions;

export const HERMES_OAUTH_PROVIDER_OPTIONS = {
  scopes: [...HERMES_OIDC_SCOPES],
  grantTypes: ["authorization_code"],
  accessTokenExpiresIn: 15 * 60,
  idTokenExpiresIn: 15 * 60,
  codeExpiresIn: 2 * 60,
  allowDynamicClientRegistration: false,
  allowUnauthenticatedClientRegistration: false,
  loginPage: "/sign-in",
  consentPage: "/oauth/consent",
  silenceWarnings: {
    oauthAuthServerConfig: true,
    openidConfig: true,
  },
  clientPrivileges: async (_context) => false,
} satisfies OAuthOptions<(typeof HERMES_OIDC_SCOPES)[number][]>;
