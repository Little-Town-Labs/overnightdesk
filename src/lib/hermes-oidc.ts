import { HERMES_OIDC_SCOPES } from "@/lib/hermes-oidc-config";

const HERMES_AUTH_PATH = "/api/auth";
const HERMES_CALLBACK_PATH = "/auth/callback";

export interface HermesOidcClientInput {
  instanceId: string;
  subdomain: string;
}

export interface HermesOidcInstanceInput extends HermesOidcClientInput {
  ownerId: string;
}

export interface HermesOidcClientRecord {
  clientId: string;
  clientSecret?: string | null;
  disabled: boolean;
  redirectUris: string[];
  scopes: string[] | null;
  tokenEndpointAuthMethod: string | null;
  grantTypes: string[] | null;
  responseTypes: string[] | null;
  public: boolean | null;
  type: string | null;
  requirePKCE: boolean | null;
  skipConsent: boolean | null;
  metadata: Record<string, unknown> | null;
}

export interface HermesOidcInstanceRecord {
  id: string;
  userId: string;
  subdomain: string | null;
  hermesOidcClientId: string | null;
}

export interface HermesOidcLifecycleGateway {
  findInstance(instanceId: string): Promise<HermesOidcInstanceRecord | null>;
  findClient(clientId: string): Promise<HermesOidcClientRecord | null>;
  createClient(
    payload: ReturnType<typeof buildHermesOidcClientPayload>
  ): Promise<{ clientId: string; clientSecret?: string | null }>;
  linkPending(instanceId: string, clientId: string): Promise<boolean>;
  removeClient(clientId: string): Promise<void>;
  setClientDisabled(clientId: string, disabled: boolean): Promise<boolean>;
  setInstanceAuthStatus(
    instanceId: string,
    clientId: string,
    status: "pending" | "active" | "disabled" | "error"
  ): Promise<boolean>;
}

function getHermesTenantOrigin(subdomain: string): string {
  const tenantId = subdomain.endsWith(".overnightdesk.com")
    ? subdomain.slice(0, -".overnightdesk.com".length)
    : "";
  if (
    subdomain.length === 0 ||
    subdomain.length > 253 ||
    subdomain !== subdomain.toLowerCase() ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(subdomain) ||
    subdomain.includes("..") ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantId)
  ) {
    throw new Error("Invalid Hermes tenant host");
  }

  const url = new URL(`https://${subdomain}`);
  if (url.hostname !== subdomain || url.port || url.username || url.password) {
    throw new Error("Invalid Hermes tenant host");
  }

  return url.origin;
}

export function getHermesOidcIssuer(baseUrl: string): string {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/$/, "");

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid Better Auth base URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Better Auth base URL must use HTTPS");
  }
  if (path && path !== HERMES_AUTH_PATH) {
    throw new Error("Better Auth base URL must use the canonical auth path");
  }

  return `${url.origin}${HERMES_AUTH_PATH}`;
}

export function getHermesOidcPublicUrl(subdomain: string): string {
  return getHermesTenantOrigin(subdomain);
}

export function getHermesOidcCallbackUrl(subdomain: string): string {
  return `${getHermesTenantOrigin(subdomain)}${HERMES_CALLBACK_PATH}`;
}

export function buildHermesOidcClientPayload({
  instanceId,
  subdomain,
}: HermesOidcClientInput) {
  if (!instanceId) {
    throw new Error("Instance ID is required");
  }

  return {
    redirect_uris: [getHermesOidcCallbackUrl(subdomain)],
    scope: HERMES_OIDC_SCOPES.join(" "),
    client_name: "OvernightDesk Hermes Dashboard",
    token_endpoint_auth_method: "none" as const,
    grant_types: ["authorization_code" as const],
    response_types: ["code" as const],
    type: "user-agent-based" as const,
    disabled: true,
    skip_consent: true,
    require_pkce: true,
    metadata: {
      kind: "hermes-dashboard",
      schemaVersion: 1,
      instanceId,
    },
  };
}

function hasExactClientContract(
  client: HermesOidcClientRecord,
  input: HermesOidcClientInput
): boolean {
  const expected = buildHermesOidcClientPayload(input);
  return (
    !client.clientSecret &&
    client.redirectUris.length === 1 &&
    client.redirectUris[0] === expected.redirect_uris[0] &&
    client.scopes?.join(" ") === expected.scope &&
    client.tokenEndpointAuthMethod === expected.token_endpoint_auth_method &&
    client.grantTypes?.length === 1 &&
    client.grantTypes[0] === expected.grant_types[0] &&
    client.responseTypes?.length === 1 &&
    client.responseTypes[0] === expected.response_types[0] &&
    client.public === true &&
    client.type === expected.type &&
    client.requirePKCE === true &&
    client.skipConsent === true &&
    client.metadata?.kind === expected.metadata.kind &&
    client.metadata?.schemaVersion === expected.metadata.schemaVersion &&
    client.metadata?.instanceId === expected.metadata.instanceId
  );
}

async function requireCanonicalInstance(
  input: HermesOidcInstanceInput,
  gateway: HermesOidcLifecycleGateway
): Promise<HermesOidcInstanceRecord> {
  const instance = await gateway.findInstance(input.instanceId);
  if (
    !instance ||
    instance.userId !== input.ownerId ||
    instance.subdomain !== input.subdomain
  ) {
    throw new Error("Hermes dashboard client is unavailable");
  }
  return instance;
}

const defaultLifecycleGateway: HermesOidcLifecycleGateway = {
  async findInstance(instanceId) {
    const [{ db }, schema, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const rows = await db
      .select({
        id: schema.instance.id,
        userId: schema.instance.userId,
        subdomain: schema.instance.subdomain,
        hermesOidcClientId: schema.instance.hermesOidcClientId,
      })
      .from(schema.instance)
      .where(eq(schema.instance.id, instanceId))
      .limit(1);
    return rows[0] ?? null;
  },
  async findClient(clientId) {
    const [{ db }, schema, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const rows = await db
      .select()
      .from(schema.oauthClient)
      .where(eq(schema.oauthClient.clientId, clientId))
      .limit(1);
    return rows[0] ?? null;
  },
  async createClient(payload) {
    const { auth } = await import("@/lib/auth");
    const created = await auth.api.adminCreateOAuthClient({ body: payload });
    return {
      clientId: created.client_id,
      clientSecret: created.client_secret,
    };
  },
  async linkPending(instanceId, clientId) {
    const [{ db }, schema, { and, eq, isNull }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const rows = await db
      .update(schema.instance)
      .set({
        hermesOidcClientId: clientId,
        hermesDashboardAuthStatus: "pending",
        hermesDashboardAuthUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.instance.id, instanceId),
          isNull(schema.instance.hermesOidcClientId)
        )
      )
      .returning({ id: schema.instance.id });
    return rows.length === 1;
  },
  async removeClient(clientId) {
    const [{ db }, schema, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    await db.delete(schema.oauthClient).where(eq(schema.oauthClient.clientId, clientId));
  },
  async setClientDisabled(clientId, disabled) {
    const [{ db }, schema, { eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const rows = await db
      .update(schema.oauthClient)
      .set({ disabled, updatedAt: new Date() })
      .where(eq(schema.oauthClient.clientId, clientId))
      .returning({ clientId: schema.oauthClient.clientId });
    return rows.length === 1;
  },
  async setInstanceAuthStatus(instanceId, clientId, status) {
    const [{ db }, schema, { and, eq }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const rows = await db
      .update(schema.instance)
      .set({
        hermesDashboardAuthStatus: status,
        hermesDashboardAuthUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.instance.id, instanceId),
          eq(schema.instance.hermesOidcClientId, clientId)
        )
      )
      .returning({ id: schema.instance.id });
    return rows.length === 1;
  },
};

export async function ensureHermesOidcClient(
  input: HermesOidcInstanceInput,
  gateway: HermesOidcLifecycleGateway = defaultLifecycleGateway
): Promise<{ clientId: string; created: boolean }> {
  const instance = await requireCanonicalInstance(input, gateway);
  if (instance.hermesOidcClientId) {
    const existing = await gateway.findClient(instance.hermesOidcClientId);
    if (!existing || !hasExactClientContract(existing, input)) {
      throw new Error("Hermes dashboard client is unavailable");
    }
    return { clientId: existing.clientId, created: false };
  }

  const created = await gateway.createClient(buildHermesOidcClientPayload(input));
  if (created.clientSecret) {
    await gateway.removeClient(created.clientId);
    throw new Error("Hermes dashboard public client invariant failed");
  }

  if (await gateway.linkPending(input.instanceId, created.clientId)) {
    return { clientId: created.clientId, created: true };
  }

  await gateway.removeClient(created.clientId);
  const winner = await requireCanonicalInstance(input, gateway);
  if (!winner.hermesOidcClientId) {
    throw new Error("Hermes dashboard client is unavailable");
  }
  const winningClient = await gateway.findClient(winner.hermesOidcClientId);
  if (!winningClient || !hasExactClientContract(winningClient, input)) {
    throw new Error("Hermes dashboard client is unavailable");
  }
  return { clientId: winningClient.clientId, created: false };
}

export async function activateHermesOidcClient(
  input: HermesOidcInstanceInput,
  gateway: HermesOidcLifecycleGateway = defaultLifecycleGateway
): Promise<void> {
  const instance = await requireCanonicalInstance(input, gateway);
  if (!instance.hermesOidcClientId) {
    throw new Error("Hermes dashboard client is unavailable");
  }
  const client = await gateway.findClient(instance.hermesOidcClientId);
  if (!client || !hasExactClientContract(client, input)) {
    throw new Error("Hermes dashboard client is unavailable");
  }

  if (!(await gateway.setClientDisabled(client.clientId, false))) {
    throw new Error("Hermes dashboard client activation failed");
  }
  if (
    !(await gateway.setInstanceAuthStatus(input.instanceId, client.clientId, "active"))
  ) {
    await gateway.setClientDisabled(client.clientId, true);
    throw new Error("Hermes dashboard client activation failed");
  }
}

export function buildHermesDashboardAuthConfig({
  clientId,
  subdomain,
  issuerBaseUrl,
}: {
  clientId: string;
  subdomain: string;
  issuerBaseUrl: string;
}) {
  if (!clientId) {
    throw new Error("OIDC client ID is required");
  }

  return {
    provider: "self-hosted" as const,
    issuer: getHermesOidcIssuer(issuerBaseUrl),
    clientId,
    publicUrl: getHermesOidcPublicUrl(subdomain),
    callbackUrl: getHermesOidcCallbackUrl(subdomain),
    scopes: HERMES_OIDC_SCOPES,
  };
}
