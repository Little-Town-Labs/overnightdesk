"use client";

import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClientPlugins = [oauthProviderClient()];

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: authClientPlugins,
});

export const { signIn, signUp, signOut, useSession } = authClient;
