import { isDeepStrictEqual } from "node:util";
import { TITUS_OPEN_WEBUI } from "@/lib/open-webui-titus-canary";

export interface TitusOpenWebuiIdentity {
  useCaseId: string;
  runtimeIdentityId: string;
}

export type TitusOpenWebuiResourceBinding = readonly [
  provider: string,
  kind: "container" | "volume" | "hostname" | "oidc_client" | "phase_path",
  value: string,
];

export interface TitusOpenWebuiClient {
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

export interface TitusOpenWebuiProvisioningSnapshot {
  useCaseNumber: number;
  useCaseStatus: string;
  runtimeStatus: string;
  activeOwnerMemberships: number;
  resourceBindings: TitusOpenWebuiResourceBinding[];
  secretBoundary: {
    phaseApp: string;
    environment: string;
    pathIdentifier: string;
  };
  client: TitusOpenWebuiClient;
}

const RESOURCE_BINDINGS: TitusOpenWebuiResourceBinding[] = [
  ["docker", "container", TITUS_OPEN_WEBUI.deploymentId],
  ["docker", "volume", TITUS_OPEN_WEBUI.volume],
  ["overnightdesk", "hostname", TITUS_OPEN_WEBUI.host],
  ["better-auth", "oidc_client", TITUS_OPEN_WEBUI.oidcClientId],
  ["phase", "phase_path", TITUS_OPEN_WEBUI.phasePath],
];

export function buildTitusOpenWebuiProvisioningSpec(
  identity: TitusOpenWebuiIdentity,
) {
  return {
    resourceBindings: RESOURCE_BINDINGS.map((binding) => [...binding]) as TitusOpenWebuiResourceBinding[],
    secretBoundary: {
      phaseApp: TITUS_OPEN_WEBUI.phaseApp,
      environment: TITUS_OPEN_WEBUI.phaseEnvironment,
      pathIdentifier: TITUS_OPEN_WEBUI.phasePath,
    },
    client: {
      clientId: TITUS_OPEN_WEBUI.oidcClientId,
      clientSecret: null,
      disabled: true,
      skipConsent: true,
      enableEndSession: true,
      subjectType: "public",
      scopes: ["openid", "email", "profile", "offline_access"],
      name: "Titus Open WebUI",
      uri: `https://${TITUS_OPEN_WEBUI.host}`,
      redirectUris: [`https://${TITUS_OPEN_WEBUI.host}/oauth/oidc/callback`],
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
        deploymentId: TITUS_OPEN_WEBUI.deploymentId,
        ...identity,
      },
    } satisfies TitusOpenWebuiClient,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

export function verifyTitusOpenWebuiProvisioningSnapshot(
  snapshot: TitusOpenWebuiProvisioningSnapshot,
) {
  if (classifyTitusOpenWebuiProvisioningSnapshot(snapshot) !== "current") {
    throw new Error("Invalid Titus Open WebUI provisioning state");
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

export function classifyTitusOpenWebuiProvisioningSnapshot(
  snapshot: TitusOpenWebuiProvisioningSnapshot,
): "current" | "refresh-required" | "invalid" {
  const expected = buildTitusOpenWebuiProvisioningSpec(
    snapshot.client.metadata,
  );
  if (
    snapshot.useCaseNumber !== TITUS_OPEN_WEBUI.useCaseNumber ||
    snapshot.useCaseStatus !== "active" ||
    snapshot.runtimeStatus !== "active" ||
    snapshot.activeOwnerMemberships !== 1 ||
    !sameJson(snapshot.resourceBindings, expected.resourceBindings) ||
    !sameJson(snapshot.secretBoundary, expected.secretBoundary)
  ) {
    return "invalid";
  }

  const normalizedClient = { ...snapshot.client, disabled: true };
  if (sameJson(normalizedClient, expected.client)) return "current";

  const legacyClient = {
    ...expected.client,
    scopes: ["openid", "email", "profile"],
    grantTypes: ["authorization_code"],
  };
  return sameJson(normalizedClient, legacyClient)
    ? "refresh-required"
    : "invalid";
}
