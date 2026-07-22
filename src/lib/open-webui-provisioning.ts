import { isDeepStrictEqual } from "node:util";
import type { OpenWebuiDeployment } from "@/lib/open-webui-deployments";

export interface OpenWebuiIdentity {
  useCaseId: string;
  runtimeIdentityId: string;
}

export type OpenWebuiResourceBinding = readonly [
  provider: string,
  kind: "container" | "volume" | "hostname" | "oidc_client" | "phase_path",
  value: string,
];

export interface OpenWebuiClient {
  clientId: string;
  clientSecret: null;
  disabled: boolean;
  skipConsent: true;
  enableEndSession: true;
  subjectType: "public";
  scopes: string[];
  name: string;
  uri: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tokenEndpointAuthMethod: "none";
  grantTypes: ("authorization_code" | "refresh_token")[];
  responseTypes: ["code"];
  public: true;
  type: "user-agent-based";
  requirePKCE: true;
  metadata: {
    kind: "open-webui";
    schemaVersion: 1;
    deploymentId: string;
    useCaseId: string;
    runtimeIdentityId: string;
  };
}

export interface OpenWebuiProvisioningSnapshot {
  useCaseNumber: number;
  useCaseStatus: string;
  runtimeStatus: string;
  activeOwnerMemberships: number;
  resourceBindings: OpenWebuiResourceBinding[];
  secretBoundary: {
    phaseApp: string;
    environment: string;
    pathIdentifier: string;
  };
  client: OpenWebuiClient;
}

export function buildOpenWebuiProvisioningSpec(
  deployment: OpenWebuiDeployment,
  identity: OpenWebuiIdentity,
) {
  const resourceBindings: OpenWebuiResourceBinding[] = [
    ["docker", "container", deployment.deploymentId],
    ["docker", "volume", deployment.volume],
    ["overnightdesk", "hostname", deployment.host],
    ["better-auth", "oidc_client", deployment.oidcClientId],
    ["phase", "phase_path", deployment.phasePath],
  ];
  return {
    resourceBindings,
    secretBoundary: {
      phaseApp: deployment.phaseApp,
      environment: deployment.phaseEnvironment,
      pathIdentifier: deployment.phasePath,
    },
    client: {
      clientId: deployment.oidcClientId,
      clientSecret: null,
      disabled: true,
      skipConsent: true,
      enableEndSession: true,
      subjectType: "public",
      scopes: ["openid", "email", "profile", "offline_access"],
      name: deployment.clientName,
      uri: `https://${deployment.host}`,
      redirectUris: [`https://${deployment.host}/oauth/oidc/callback`],
      postLogoutRedirectUris: [
        "https://www.overnightdesk.com/dashboard/chat?workspace=logged-out",
      ],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      public: true,
      type: "user-agent-based",
      requirePKCE: true,
      metadata: {
        kind: "open-webui",
        schemaVersion: 1,
        deploymentId: deployment.deploymentId,
        ...identity,
      },
    } satisfies OpenWebuiClient,
  };
}

export function classifyOpenWebuiProvisioningSnapshot(
  deployment: OpenWebuiDeployment,
  snapshot: OpenWebuiProvisioningSnapshot,
): "current" | "refresh-required" | "invalid" {
  const expected = buildOpenWebuiProvisioningSpec(deployment, snapshot.client.metadata);
  if (
    snapshot.useCaseNumber !== deployment.useCaseNumber ||
    snapshot.useCaseStatus !== "active" ||
    snapshot.runtimeStatus !== "active" ||
    snapshot.activeOwnerMemberships !== 1 ||
    !isDeepStrictEqual(snapshot.resourceBindings, expected.resourceBindings) ||
    !isDeepStrictEqual(snapshot.secretBoundary, expected.secretBoundary)
  ) {
    return "invalid";
  }
  const normalizedClient = { ...snapshot.client, disabled: true };
  if (isDeepStrictEqual(normalizedClient, expected.client)) return "current";
  const legacyClient = {
    ...expected.client,
    scopes: ["openid", "email", "profile"],
    grantTypes: ["authorization_code"],
  };
  return isDeepStrictEqual(normalizedClient, legacyClient)
    ? "refresh-required"
    : "invalid";
}

export function verifyOpenWebuiProvisioningSnapshot(
  deployment: OpenWebuiDeployment,
  snapshot: OpenWebuiProvisioningSnapshot,
) {
  if (classifyOpenWebuiProvisioningSnapshot(deployment, snapshot) !== "current") {
    throw new Error("Invalid Open WebUI provisioning state");
  }
  return {
    state: snapshot.client.disabled ? ("disabled" as const) : ("enabled" as const),
    useCaseNumber: snapshot.useCaseNumber,
    activeOwnerMemberships: snapshot.activeOwnerMemberships,
    resourceBindings: snapshot.resourceBindings.length,
    secretBoundaries: 1,
    oidcClients: 1,
  };
}
