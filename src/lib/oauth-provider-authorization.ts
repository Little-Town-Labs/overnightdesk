import {
  authorizeHermesOidcOwner,
  authorizeHermesOidcToken,
} from "@/lib/hermes-oidc";
import {
  authorizeTitusOpenWebuiOidc,
  authorizeTitusOpenWebuiToken,
} from "@/lib/open-webui-titus-canary";

export type OAuthProviderClientKind = "hermes-dashboard" | "open-webui";

interface OAuthLoginInput {
  user: { id: string; emailVerified: boolean };
  scopes: string[];
  query: string;
}

interface OAuthTokenInput {
  user: { id: string; emailVerified: boolean };
  scopes: string[];
  metadata?: Record<string, unknown>;
}

export interface OAuthProviderAuthorizationDependencies {
  resolveClientKind(clientId: string): Promise<OAuthProviderClientKind | null>;
  authorizeHermesLogin(input: OAuthLoginInput): Promise<string>;
  authorizeOpenWebuiLogin(input: OAuthLoginInput): Promise<string>;
  authorizeHermesToken(input: OAuthTokenInput): Promise<Record<string, never>>;
  authorizeOpenWebuiToken(input: OAuthTokenInput): Promise<Record<string, never>>;
}

async function resolveDefaultClientKind(
  clientId: string,
): Promise<OAuthProviderClientKind | null> {
  const [{ db }, { oauthClient }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const rows = await db
    .select({ metadata: oauthClient.metadata })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  const kind = rows[0]?.metadata?.kind;
  return kind === "hermes-dashboard" || kind === "open-webui" ? kind : null;
}

const defaultDependencies: OAuthProviderAuthorizationDependencies = {
  resolveClientKind: resolveDefaultClientKind,
  authorizeHermesLogin: authorizeHermesOidcOwner,
  authorizeOpenWebuiLogin: authorizeTitusOpenWebuiOidc,
  authorizeHermesToken: authorizeHermesOidcToken,
  authorizeOpenWebuiToken: authorizeTitusOpenWebuiToken,
};

function deny(): never {
  throw new Error("OAuth provider authorization denied");
}

export async function authorizeOAuthProviderLogin(
  input: OAuthLoginInput,
  dependencies: OAuthProviderAuthorizationDependencies = defaultDependencies,
): Promise<{
  kind: OAuthProviderClientKind;
  referenceId: string;
  clientId: string;
}> {
  const clientId = new URLSearchParams(input.query).get("client_id");
  if (!clientId) deny();
  const kind = await dependencies.resolveClientKind(clientId);
  if (kind === "hermes-dashboard") {
    return {
      kind,
      referenceId: await dependencies.authorizeHermesLogin(input),
      clientId,
    };
  }
  if (kind === "open-webui") {
    return {
      kind,
      referenceId: await dependencies.authorizeOpenWebuiLogin(input),
      clientId,
    };
  }
  deny();
}

export async function authorizeOAuthProviderToken(
  input: OAuthTokenInput,
  dependencies: OAuthProviderAuthorizationDependencies = defaultDependencies,
): Promise<Record<string, never>> {
  if (input.metadata?.kind === "hermes-dashboard") {
    return dependencies.authorizeHermesToken(input);
  }
  if (input.metadata?.kind === "open-webui") {
    return dependencies.authorizeOpenWebuiToken(input);
  }
  deny();
}
