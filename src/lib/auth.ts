import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
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
import {
  HERMES_JWT_OPTIONS,
  HERMES_OAUTH_PROVIDER_OPTIONS,
} from "@/lib/hermes-oidc-config";
import {
  authorizeHermesOidcOwner,
  authorizeHermesOidcToken,
} from "@/lib/hermes-oidc";

async function requireHermesAuthorization(
  user: { id: string; emailVerified: boolean },
  scopes: string[]
): Promise<string> {
  try {
    const state = await getOAuthProviderState();
    if (!state?.query) throw new Error("missing provider state");
    return await authorizeHermesOidcOwner({ user, scopes, query: state.query });
  } catch {
    throw new APIError("FORBIDDEN", {
      error: "access_denied",
      error_description: "Access denied",
    });
  }
}

export const auth = betterAuth({
  appName: "OvernightDesk",
  baseURL: process.env.BETTER_AUTH_URL,
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

  plugins: [
    jwt(HERMES_JWT_OPTIONS),
    oauthProvider({
      ...HERMES_OAUTH_PROVIDER_OPTIONS,
      postLogin: {
        page: "/sign-in",
        shouldRedirect: async ({ user, scopes }) => {
          await requireHermesAuthorization(user, scopes);
          return false;
        },
        consentReferenceId: ({ user, scopes }) =>
          requireHermesAuthorization(user, scopes),
      },
      customIdTokenClaims: async ({ user, scopes, metadata }) => {
        try {
          return await authorizeHermesOidcToken({ user, scopes, metadata });
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
