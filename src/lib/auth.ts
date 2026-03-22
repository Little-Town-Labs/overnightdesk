import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/email";

export const auth = betterAuth({
  appName: "OvernightDesk",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

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

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
