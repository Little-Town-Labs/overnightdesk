import {
  authorizeOpenWebuiOidc,
  buildOpenWebuiOidcClientPayload,
  type OpenWebuiWorkspaceAssignment,
} from "@/lib/open-webui-auth-spike";
import type { HermesOidcClientRecord } from "@/lib/hermes-oidc";
import {
  createUseCaseMembershipAuthorizer,
  recordMembershipAuthorizationAuditEvent,
  type MembershipAuthorizationDecision,
} from "@/lib/use-case-membership-authorization";

export const TITUS_OPEN_WEBUI = {
  useCaseNumber: 2,
  useCaseSlug: "timeless-tech-solutions",
  runtimeSlug: "hermes-titus",
  deploymentId: "open-webui-hermes-titus",
  host: "titus-chat.overnightdesk.com",
  oidcClientId: "overnightdesk-open-webui-titus-v1",
  issuer: "https://www.overnightdesk.com/api/auth",
  hermesBaseUrl: "http://hermes-titus:8642/v1",
  volume: "open-webui-hermes-titus-data",
  phaseApp: "timeless-tech-solutions",
  phaseEnvironment: "production",
  phasePath: "/agents/open-webui/hermes-titus",
} as const;

const ENABLE_CONFIRMATION = "ENABLE_TITUS_OPEN_WEBUI_GARY";

export type TitusOpenWebuiCanaryMode = "disabled" | "canonical";

export interface TitusOpenWebuiCanaryConfig {
  mode?: string;
  confirmation?: string;
}

export interface TitusOpenWebuiAuthorizationContext {
  assignment: OpenWebuiWorkspaceAssignment;
  useCaseNumber: number | null;
  useCaseStatus: string;
  runtimeStatus: string;
  bindingsValid: boolean;
  client: HermesOidcClientRecord;
}

export interface TitusOpenWebuiGateway {
  findByClientId(
    clientId: string,
  ): Promise<TitusOpenWebuiAuthorizationContext | null>;
  findByDeploymentId(
    deploymentId: string,
  ): Promise<TitusOpenWebuiAuthorizationContext | null>;
  findByHost(host: string): Promise<TitusOpenWebuiAuthorizationContext | null>;
  authorize(input: {
    userId: string;
    useCaseId: string;
    runtimeIdentityId: string;
  }): Promise<MembershipAuthorizationDecision>;
}

export function parseTitusOpenWebuiCanaryMode(
  rawMode?: string,
  confirmation?: string,
): TitusOpenWebuiCanaryMode {
  const mode = rawMode?.trim() || "disabled";
  if (mode === "disabled") return mode;
  if (mode !== "canonical") {
    throw new Error("Invalid Titus Open WebUI canary mode");
  }
  if (confirmation !== ENABLE_CONFIRMATION) {
    throw new Error("Titus Open WebUI canonical confirmation is required");
  }
  return mode;
}

function configuredMode(config?: TitusOpenWebuiCanaryConfig) {
  return parseTitusOpenWebuiCanaryMode(
    config?.mode ?? process.env.TITUS_OPEN_WEBUI_AUTH_MODE,
    config?.confirmation ?? process.env.TITUS_OPEN_WEBUI_CANARY_CONFIRM,
  );
}

function exactClientContract(context: TitusOpenWebuiAuthorizationContext) {
  const expected = buildOpenWebuiOidcClientPayload(context.assignment);
  const metadata = context.client.metadata;
  return (
    context.client.clientId === TITUS_OPEN_WEBUI.oidcClientId &&
    !context.client.clientSecret &&
    !context.client.disabled &&
    context.client.redirectUris.length === 1 &&
    context.client.redirectUris[0] === expected.redirect_uris[0] &&
    context.client.scopes?.join(" ") === expected.scope &&
    context.client.tokenEndpointAuthMethod === expected.token_endpoint_auth_method &&
    context.client.grantTypes?.join(" ") === expected.grant_types.join(" ") &&
    context.client.responseTypes?.join(" ") === expected.response_types.join(" ") &&
    context.client.public === true &&
    context.client.type === expected.type &&
    context.client.requirePKCE === true &&
    context.client.skipConsent === true &&
    metadata?.kind === "open-webui" &&
    metadata.schemaVersion === 1 &&
    metadata.deploymentId === context.assignment.deploymentId &&
    metadata.useCaseId === context.assignment.useCaseId &&
    metadata.runtimeIdentityId === context.assignment.runtimeIdentityId
  );
}

function exactTitusContext(context: TitusOpenWebuiAuthorizationContext | null) {
  return Boolean(
    context &&
      context.useCaseNumber === TITUS_OPEN_WEBUI.useCaseNumber &&
      context.useCaseStatus === "active" &&
      context.runtimeStatus === "active" &&
      context.bindingsValid &&
      context.assignment.enabled &&
      context.assignment.deploymentId === TITUS_OPEN_WEBUI.deploymentId &&
      context.assignment.host === TITUS_OPEN_WEBUI.host &&
      context.assignment.oidcClientId === TITUS_OPEN_WEBUI.oidcClientId &&
      context.assignment.oidcAudience === TITUS_OPEN_WEBUI.oidcClientId &&
      context.assignment.issuer === TITUS_OPEN_WEBUI.issuer &&
      context.assignment.hermesBaseUrl === TITUS_OPEN_WEBUI.hermesBaseUrl &&
      exactClientContract(context),
  );
}

function membershipAuthorizer(
  gateway: TitusOpenWebuiGateway,
  context: TitusOpenWebuiAuthorizationContext,
) {
  return {
    authorize: ({ userId }: { userId: string }) =>
      gateway.authorize({
        userId,
        useCaseId: context.assignment.useCaseId,
        runtimeIdentityId: context.assignment.runtimeIdentityId,
      }),
    invalidateUser: () => undefined,
  };
}

function deny(): never {
  throw new Error("Titus Open WebUI authorization denied");
}

export async function authorizeTitusOpenWebuiOidc(
  input: {
    user: { id: string; emailVerified: boolean };
    scopes: string[];
    query: string;
  },
  gateway: TitusOpenWebuiGateway = defaultTitusOpenWebuiGateway,
  config?: TitusOpenWebuiCanaryConfig,
): Promise<string> {
  if (configuredMode(config) !== "canonical") deny();
  const clientId = new URLSearchParams(input.query).get("client_id");
  if (clientId !== TITUS_OPEN_WEBUI.oidcClientId) deny();
  const context = await gateway.findByClientId(clientId);
  if (!exactTitusContext(context)) deny();
  await authorizeOpenWebuiOidc(
    input,
    context!.assignment,
    membershipAuthorizer(gateway, context!),
  );
  return context!.assignment.deploymentId;
}

export async function authorizeTitusOpenWebuiToken(
  input: {
    user: { id: string; emailVerified: boolean };
    scopes: string[];
    metadata?: Record<string, unknown>;
  },
  gateway: TitusOpenWebuiGateway = defaultTitusOpenWebuiGateway,
  config?: TitusOpenWebuiCanaryConfig,
): Promise<Record<string, never>> {
  if (configuredMode(config) !== "canonical") deny();
  if (
    input.metadata?.kind !== "open-webui" ||
    input.metadata.schemaVersion !== 1 ||
    input.metadata.deploymentId !== TITUS_OPEN_WEBUI.deploymentId ||
    !input.user.emailVerified ||
    input.scopes.join(" ") !== "openid email profile"
  ) {
    deny();
  }
  const context = await gateway.findByDeploymentId(
    TITUS_OPEN_WEBUI.deploymentId,
  );
  if (!exactTitusContext(context)) deny();
  const decision = await gateway.authorize({
    userId: input.user.id,
    useCaseId: context!.assignment.useCaseId,
    runtimeIdentityId: context!.assignment.runtimeIdentityId,
  });
  if (!decision.authorized) deny();
  return {};
}

export async function authorizeTitusOpenWebuiEdge(
  input: {
    userId: string;
    host: string;
    transport: "http" | "sse" | "websocket";
  },
  gateway: TitusOpenWebuiGateway = defaultTitusOpenWebuiGateway,
  config?: TitusOpenWebuiCanaryConfig,
): Promise<boolean> {
  if (configuredMode(config) !== "canonical") return false;
  if (input.host !== TITUS_OPEN_WEBUI.host) return false;
  const context = await gateway.findByHost(input.host);
  if (!exactTitusContext(context)) return false;
  const decision = await gateway.authorize({
    userId: input.userId,
    useCaseId: context!.assignment.useCaseId,
    runtimeIdentityId: context!.assignment.runtimeIdentityId,
  });
  return decision.authorized;
}

async function loadDefaultContext(): Promise<TitusOpenWebuiAuthorizationContext | null> {
  const [{ db }, schema, { and, eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const {
    oauthClient,
    resourceBinding,
    runtimeIdentity,
    secretBoundaryBinding,
    useCase,
    useCaseNumberAllocation,
  } = schema;
  const identityRows = await db
    .select({
      useCaseId: useCase.id,
      useCaseNumber: useCaseNumberAllocation.number,
      useCaseStatus: useCase.status,
      runtimeIdentityId: runtimeIdentity.id,
      runtimeStatus: runtimeIdentity.status,
    })
    .from(useCaseNumberAllocation)
    .innerJoin(useCase, eq(useCaseNumberAllocation.useCaseId, useCase.id))
    .innerJoin(runtimeIdentity, eq(runtimeIdentity.useCaseId, useCase.id))
    .where(
      and(
        eq(useCaseNumberAllocation.number, TITUS_OPEN_WEBUI.useCaseNumber),
        eq(useCase.slug, TITUS_OPEN_WEBUI.useCaseSlug),
        eq(runtimeIdentity.slug, TITUS_OPEN_WEBUI.runtimeSlug),
      ),
    )
    .limit(1);
  const identity = identityRows[0];
  if (!identity) return null;

  const [clients, bindings, secretBindings] = await Promise.all([
    db
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, TITUS_OPEN_WEBUI.oidcClientId))
      .limit(1),
    db
      .select({
        provider: resourceBinding.provider,
        kind: resourceBinding.kind,
        value: resourceBinding.value,
        state: resourceBinding.state,
      })
      .from(resourceBinding)
      .where(
        and(
          eq(resourceBinding.useCaseId, identity.useCaseId),
          eq(resourceBinding.runtimeIdentityId, identity.runtimeIdentityId),
        ),
      ),
    db
      .select({
        phaseApp: secretBoundaryBinding.phaseApp,
        environment: secretBoundaryBinding.environment,
        pathIdentifier: secretBoundaryBinding.pathIdentifier,
      })
      .from(secretBoundaryBinding)
      .where(
        and(
          eq(secretBoundaryBinding.useCaseId, identity.useCaseId),
          eq(
            secretBoundaryBinding.runtimeIdentityId,
            identity.runtimeIdentityId,
          ),
        ),
      ),
  ]);
  const client = clients[0] as HermesOidcClientRecord | undefined;
  if (!client) return null;

  const requiredBindings = [
    ["docker", "container", TITUS_OPEN_WEBUI.deploymentId],
    ["docker", "volume", TITUS_OPEN_WEBUI.volume],
    ["overnightdesk", "hostname", TITUS_OPEN_WEBUI.host],
    ["better-auth", "oidc_client", TITUS_OPEN_WEBUI.oidcClientId],
    ["phase", "phase_path", TITUS_OPEN_WEBUI.phasePath],
  ];
  const bindingsValid = requiredBindings.every(([provider, kind, value]) =>
    bindings.some(
      (binding) =>
        binding.provider === provider &&
        binding.kind === kind &&
        binding.value === value &&
        binding.state === "active",
    ),
  ) && secretBindings.some(
    (binding) =>
      binding.phaseApp === TITUS_OPEN_WEBUI.phaseApp &&
      binding.environment === TITUS_OPEN_WEBUI.phaseEnvironment &&
      binding.pathIdentifier === TITUS_OPEN_WEBUI.phasePath,
  );

  return {
    assignment: {
      enabled: true,
      deploymentId: TITUS_OPEN_WEBUI.deploymentId,
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
      host: TITUS_OPEN_WEBUI.host,
      oidcClientId: TITUS_OPEN_WEBUI.oidcClientId,
      oidcAudience: TITUS_OPEN_WEBUI.oidcClientId,
      issuer: TITUS_OPEN_WEBUI.issuer,
      hermesBaseUrl: TITUS_OPEN_WEBUI.hermesBaseUrl,
    },
    useCaseNumber: identity.useCaseNumber,
    useCaseStatus: identity.useCaseStatus,
    runtimeStatus: identity.runtimeStatus,
    bindingsValid,
    client,
  };
}

export const defaultTitusOpenWebuiGateway: TitusOpenWebuiGateway = {
  findByClientId: (clientId) =>
    clientId === TITUS_OPEN_WEBUI.oidcClientId
      ? loadDefaultContext()
      : Promise.resolve(null),
  findByDeploymentId: (deploymentId) =>
    deploymentId === TITUS_OPEN_WEBUI.deploymentId
      ? loadDefaultContext()
      : Promise.resolve(null),
  findByHost: (host) =>
    host === TITUS_OPEN_WEBUI.host
      ? loadDefaultContext()
      : Promise.resolve(null),
  async authorize({ userId, useCaseId, runtimeIdentityId }) {
    const { useCaseMembershipStore } = await import(
      "@/lib/use-case-membership-store"
    );
    return createUseCaseMembershipAuthorizer({
      store: useCaseMembershipStore,
      assignment: { useCaseId, runtimeIdentityId },
      audit: recordMembershipAuthorizationAuditEvent,
    }).authorize({ userId });
  },
};
