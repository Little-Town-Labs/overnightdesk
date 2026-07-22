import {
  OPEN_WEBUI_OIDC_SCOPES,
  authorizeOpenWebuiOidc,
  buildOpenWebuiOidcClientPayload,
  type OpenWebuiWorkspaceAssignment,
} from "@/lib/open-webui-auth-spike";
import {
  findOpenWebuiDeployment,
  type OpenWebuiDeployment,
} from "@/lib/open-webui-deployments";
import type { HermesOidcClientRecord } from "@/lib/hermes-oidc";
import {
  createUseCaseMembershipAuthorizer,
  recordMembershipAuthorizationAuditEvent,
  type MembershipAuthorizationDecision,
} from "@/lib/use-case-membership-authorization";

const ENABLE_CONFIRMATION = "ENABLE_OPEN_WEBUI_CANONICAL_GARY";
const LEGACY_TITUS_CONFIRMATION = "ENABLE_TITUS_OPEN_WEBUI_GARY";

export interface OpenWebuiCanonicalAuthorizationConfig {
  mode?: string;
  confirmation?: string;
}

export interface OpenWebuiCanonicalAuthorizationContext {
  deployment: OpenWebuiDeployment;
  assignment: OpenWebuiWorkspaceAssignment;
  useCaseNumber: number | null;
  useCaseStatus: string;
  runtimeStatus: string;
  bindingsValid: boolean;
  client: HermesOidcClientRecord;
}

export interface OpenWebuiCanonicalGateway {
  findByClientId(clientId: string): Promise<OpenWebuiCanonicalAuthorizationContext | null>;
  findByDeploymentId(
    deploymentId: string,
  ): Promise<OpenWebuiCanonicalAuthorizationContext | null>;
  findByHost(host: string): Promise<OpenWebuiCanonicalAuthorizationContext | null>;
  authorize(input: {
    userId: string;
    useCaseId: string;
    runtimeIdentityId: string;
  }): Promise<MembershipAuthorizationDecision>;
}

export function parseOpenWebuiAuthorizationMode(
  rawMode?: string,
  confirmation?: string,
): "disabled" | "canonical" {
  const mode = rawMode?.trim() || "disabled";
  if (mode === "disabled") return mode;
  if (mode !== "canonical") throw new Error("Invalid Open WebUI authorization mode");
  if (confirmation !== ENABLE_CONFIRMATION) {
    throw new Error("Open WebUI canonical confirmation is required");
  }
  return mode;
}

function configuredMode(config?: OpenWebuiCanonicalAuthorizationConfig) {
  if (config) return parseOpenWebuiAuthorizationMode(config.mode, config.confirmation);
  const mode = process.env.OPEN_WEBUI_AUTH_MODE ?? process.env.TITUS_OPEN_WEBUI_AUTH_MODE;
  const configuredConfirmation =
    process.env.OPEN_WEBUI_AUTH_CONFIRM ?? process.env.TITUS_OPEN_WEBUI_CANARY_CONFIRM;
  const confirmation =
    configuredConfirmation === LEGACY_TITUS_CONFIRMATION
      ? ENABLE_CONFIRMATION
      : configuredConfirmation;
  return parseOpenWebuiAuthorizationMode(mode, confirmation);
}

function exactClientContract(context: OpenWebuiCanonicalAuthorizationContext) {
  const expected = buildOpenWebuiOidcClientPayload(context.assignment);
  const metadata = context.client.metadata;
  return (
    context.client.clientId === context.deployment.oidcClientId &&
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

function exactContext(context: OpenWebuiCanonicalAuthorizationContext | null) {
  if (!context) return false;
  const deployment = context.deployment;
  return Boolean(
    context.useCaseNumber === deployment.useCaseNumber &&
      context.useCaseStatus === "active" &&
      context.runtimeStatus === "active" &&
      context.bindingsValid &&
      context.assignment.enabled &&
      context.assignment.deploymentId === deployment.deploymentId &&
      context.assignment.host === deployment.host &&
      context.assignment.oidcClientId === deployment.oidcClientId &&
      context.assignment.oidcAudience === deployment.oidcClientId &&
      context.assignment.issuer === deployment.issuer &&
      context.assignment.hermesBaseUrl === deployment.hermesBaseUrl &&
      exactClientContract(context),
  );
}

function deny(): never {
  throw new Error("Open WebUI canonical authorization denied");
}

function membershipAuthorizer(
  gateway: OpenWebuiCanonicalGateway,
  context: OpenWebuiCanonicalAuthorizationContext,
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

export async function authorizeOpenWebuiCanonicalOidc(
  input: {
    user: { id: string; emailVerified: boolean };
    scopes: string[];
    query: string;
  },
  gateway: OpenWebuiCanonicalGateway = defaultOpenWebuiCanonicalGateway,
  config?: OpenWebuiCanonicalAuthorizationConfig,
): Promise<string> {
  if (configuredMode(config) !== "canonical") deny();
  const clientId = new URLSearchParams(input.query).get("client_id");
  if (!clientId || !findOpenWebuiDeployment("clientId", clientId)) deny();
  const context = await gateway.findByClientId(clientId);
  if (!exactContext(context) || context!.deployment.oidcClientId !== clientId) deny();
  await authorizeOpenWebuiOidc(
    input,
    context!.assignment,
    membershipAuthorizer(gateway, context!),
  );
  return context!.deployment.deploymentId;
}

export async function authorizeOpenWebuiCanonicalToken(
  input: {
    user: { id: string; emailVerified: boolean };
    scopes: string[];
    metadata?: Record<string, unknown>;
  },
  gateway: OpenWebuiCanonicalGateway = defaultOpenWebuiCanonicalGateway,
  config?: OpenWebuiCanonicalAuthorizationConfig,
): Promise<Record<string, never>> {
  if (configuredMode(config) !== "canonical") deny();
  const deploymentId = input.metadata?.deploymentId;
  if (
    input.metadata?.kind !== "open-webui" ||
    input.metadata.schemaVersion !== 1 ||
    typeof deploymentId !== "string" ||
    !findOpenWebuiDeployment("deploymentId", deploymentId) ||
    !input.user.emailVerified ||
    input.scopes.join(" ") !== OPEN_WEBUI_OIDC_SCOPES.join(" ")
  ) {
    deny();
  }
  const context = await gateway.findByDeploymentId(deploymentId);
  if (!exactContext(context) || context!.deployment.deploymentId !== deploymentId) deny();
  const decision = await gateway.authorize({
    userId: input.user.id,
    useCaseId: context!.assignment.useCaseId,
    runtimeIdentityId: context!.assignment.runtimeIdentityId,
  });
  if (!decision.authorized) deny();
  return {};
}

export async function authorizeOpenWebuiCanonicalEdge(
  input: {
    userId: string;
    host: string;
    transport: "http" | "sse" | "websocket";
  },
  gateway: OpenWebuiCanonicalGateway = defaultOpenWebuiCanonicalGateway,
  config?: OpenWebuiCanonicalAuthorizationConfig,
): Promise<{ authorized: boolean; deploymentId?: string }> {
  if (configuredMode(config) !== "canonical") return { authorized: false };
  const deployment = findOpenWebuiDeployment("host", input.host);
  if (!deployment) return { authorized: false };
  const context = await gateway.findByHost(input.host);
  if (!exactContext(context) || context!.deployment.host !== input.host) {
    return { authorized: false };
  }
  const decision = await gateway.authorize({
    userId: input.userId,
    useCaseId: context!.assignment.useCaseId,
    runtimeIdentityId: context!.assignment.runtimeIdentityId,
  });
  return decision.authorized
    ? { authorized: true, deploymentId: deployment.deploymentId }
    : { authorized: false };
}

async function loadDefaultContext(
  deployment: OpenWebuiDeployment,
): Promise<OpenWebuiCanonicalAuthorizationContext | null> {
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
  const identities = await db
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
        eq(useCaseNumberAllocation.number, deployment.useCaseNumber),
        eq(useCase.slug, deployment.useCaseSlug),
        eq(runtimeIdentity.slug, deployment.runtimeSlug),
      ),
    );
  if (identities.length !== 1) return null;
  const identity = identities[0];
  const [clients, bindings, secretBindings] = await Promise.all([
    db.select().from(oauthClient).where(eq(oauthClient.clientId, deployment.oidcClientId)),
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
          eq(secretBoundaryBinding.runtimeIdentityId, identity.runtimeIdentityId),
        ),
      ),
  ]);
  if (clients.length !== 1) return null;
  const requiredBindings = [
    ["docker", "container", deployment.deploymentId],
    ["docker", "volume", deployment.volume],
    ["overnightdesk", "hostname", deployment.host],
    ["better-auth", "oidc_client", deployment.oidcClientId],
    ["phase", "phase_path", deployment.phasePath],
  ];
  const bindingsValid =
    requiredBindings.every(([provider, kind, value]) =>
      bindings.some(
        (binding) =>
          binding.provider === provider &&
          binding.kind === kind &&
          binding.value === value &&
          binding.state === "active",
      ),
    ) &&
    secretBindings.some(
      (binding) =>
        binding.phaseApp === deployment.phaseApp &&
        binding.environment === deployment.phaseEnvironment &&
        binding.pathIdentifier === deployment.phasePath,
    );
  const client = clients[0] as HermesOidcClientRecord;
  return {
    deployment,
    assignment: {
      enabled: !client.disabled,
      deploymentId: deployment.deploymentId,
      useCaseId: identity.useCaseId,
      runtimeIdentityId: identity.runtimeIdentityId,
      host: deployment.host,
      oidcClientId: deployment.oidcClientId,
      oidcAudience: deployment.oidcClientId,
      issuer: deployment.issuer,
      hermesBaseUrl: deployment.hermesBaseUrl,
    },
    useCaseNumber: identity.useCaseNumber,
    useCaseStatus: identity.useCaseStatus,
    runtimeStatus: identity.runtimeStatus,
    bindingsValid,
    client,
  };
}

async function loadBy(
  selector: "clientId" | "deploymentId" | "host",
  value: string,
) {
  const deployment = findOpenWebuiDeployment(selector, value);
  return deployment ? loadDefaultContext(deployment) : null;
}

export const defaultOpenWebuiCanonicalGateway: OpenWebuiCanonicalGateway = {
  findByClientId: (value) => loadBy("clientId", value),
  findByDeploymentId: (value) => loadBy("deploymentId", value),
  findByHost: (value) => loadBy("host", value),
  async authorize({ userId, useCaseId, runtimeIdentityId }) {
    const { useCaseMembershipStore } = await import("@/lib/use-case-membership-store");
    return createUseCaseMembershipAuthorizer({
      store: useCaseMembershipStore,
      assignment: { useCaseId, runtimeIdentityId },
      audit: recordMembershipAuthorizationAuditEvent,
    }).authorize({ userId });
  },
};
