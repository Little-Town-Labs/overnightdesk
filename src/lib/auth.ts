import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import {
  getOAuthProviderState,
  oauthProvider,
} from "@better-auth/oauth-provider";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/email";
import { isAdmin, isInvitedEmail } from "@/lib/billing";
import { getBetterAuthUrl } from "@/lib/config";
import {
  HERMES_JWT_OPTIONS,
  HERMES_OAUTH_PROVIDER_OPTIONS,
  hasForbiddenOAuthResourceIndicator,
} from "@/lib/hermes-oidc-config";
import { recordHermesOidcAuditEvent } from "@/lib/hermes-oidc-audit";
import {
  authorizeOAuthProviderLogin,
  authorizeOAuthProviderToken,
} from "@/lib/oauth-provider-authorization";
import { recordOpenWebuiAuditEvent } from "@/lib/open-webui-audit";
import { TITUS_OPEN_WEBUI } from "@/lib/open-webui-titus-canary";

async function requireOAuthAuthorization(
  user: { id: string; emailVerified: boolean },
  scopes: string[],
  requestId?: string,
  recordAudit = true
): Promise<string> {
  let clientId: string | undefined;
  try {
    const state = await getOAuthProviderState();
    if (!state?.query) throw new Error("missing provider state");
    clientId = new URLSearchParams(state.query).get("client_id") ?? undefined;
    if (recordAudit) {
      if (clientId === TITUS_OPEN_WEBUI.oidcClientId) {
        await recordOpenWebuiAuditEvent({
          category: "start",
          deploymentId: TITUS_OPEN_WEBUI.deploymentId,
          clientId,
          requestId,
        });
      } else {
        await recordHermesOidcAuditEvent({
          category: "start",
          clientId,
          requestId,
        });
      }
    }
    const authorization = await authorizeOAuthProviderLogin({
      user,
      scopes,
      query: state.query,
    });
    if (recordAudit) {
      if (authorization.kind === "open-webui") {
        await recordOpenWebuiAuditEvent({
          category: "success",
          deploymentId: authorization.referenceId,
          clientId,
          requestId,
        });
      } else {
        await recordHermesOidcAuditEvent({
          category: "success",
          instanceId: authorization.referenceId,
          clientId,
          requestId,
        });
      }
    }
    return authorization.referenceId;
  } catch {
    if (recordAudit) {
      if (clientId === TITUS_OPEN_WEBUI.oidcClientId) {
        await recordOpenWebuiAuditEvent({
          category: "denied",
          reason: "invalid_client",
          deploymentId: TITUS_OPEN_WEBUI.deploymentId,
          clientId,
          requestId,
        }).catch(() => undefined);
      } else {
        await recordHermesOidcAuditEvent({
          category: "denied",
          reason: "invalid_client",
          clientId,
          requestId,
        }).catch(() => undefined);
      }
    }
    throw new APIError("FORBIDDEN", {
      error: "access_denied",
      error_description: "Access denied",
    });
  }
}

export const auth = betterAuth({
  appName: "OvernightDesk",
  baseURL: getBetterAuthUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  disabledPaths: ["/token"],
  trustedOrigins: [
    "https://overnightdesk.com",
    "https://www.overnightdesk.com",
    "https://aegis-prod.overnightdesk.com",
    "https://aero-fett.overnightdesk.com",
  ],
  advanced: {
    defaultCookieAttributes: {
      domain: ".overnightdesk.com",
      sameSite: "lax",
      secure: true,
    },
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(
        { email: user.email, name: user.name },
        url
      );
    },
    resetPasswordTokenExpiresIn: 3600,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(
        { email: user.email, name: user.name },
        url
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 86400, // 24 hours
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email;
          if (isAdmin(email) || isInvitedEmail(email)) {
            return;
          }
          throw new APIError("FORBIDDEN", {
            message:
              "Registration is currently invite-only. Please contact us for access.",
          });
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (hasForbiddenOAuthResourceIndicator(ctx.path, ctx.body)) {
        throw new APIError("BAD_REQUEST", {
          error: "invalid_request",
          error_description: "Resource indicators are not supported",
        });
      }
    }),
  },

  plugins: [
    jwt(HERMES_JWT_OPTIONS),
    oauthProvider({
      ...HERMES_OAUTH_PROVIDER_OPTIONS,
      postLogin: {
        page: "/sign-in",
        shouldRedirect: async ({ headers, user, scopes }) => {
          await requireOAuthAuthorization(
            user,
            scopes,
            headers.get("x-request-id") ?? undefined
          );
          return false;
        },
        consentReferenceId: ({ user, scopes }) =>
          requireOAuthAuthorization(user, scopes, undefined, false),
      },
      customIdTokenClaims: async ({ user, scopes, metadata }) => {
        try {
          return await authorizeOAuthProviderToken({ user, scopes, metadata });
        } catch {
          throw new APIError("FORBIDDEN", {
            error: "access_denied",
            error_description: "Access denied",
          });
        }
      },
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
