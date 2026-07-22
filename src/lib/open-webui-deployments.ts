export interface OpenWebuiDeployment {
  useCaseNumber: number;
  useCaseSlug: string;
  runtimeSlug: string;
  deploymentId: string;
  host: string;
  oidcClientId: string;
  issuer: string;
  hermesBaseUrl: string;
  volume: string;
  phaseApp: string;
  phaseEnvironment: "production";
  phasePath: string;
  clientName: string;
  auditKey: string;
}

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
  clientName: "Titus Open WebUI",
  auditKey: "titus",
} as const satisfies OpenWebuiDeployment;

export const WALTER_OPEN_WEBUI = {
  useCaseNumber: 0,
  useCaseSlug: "overnightdesk-platform-operations",
  runtimeSlug: "hermes-walter",
  deploymentId: "open-webui-hermes-walter",
  host: "walter-chat.overnightdesk.com",
  oidcClientId: "overnightdesk-open-webui-walter-v1",
  issuer: "https://www.overnightdesk.com/api/auth",
  hermesBaseUrl: "http://hermes-walter:8642/v1",
  volume: "open-webui-hermes-walter-data",
  phaseApp: "overnightdesk",
  phaseEnvironment: "production",
  phasePath: "/agents/open-webui/hermes-walter",
  clientName: "Walter Open WebUI",
  auditKey: "walter",
} as const satisfies OpenWebuiDeployment;

export const OPEN_WEBUI_DEPLOYMENTS = [
  TITUS_OPEN_WEBUI,
  WALTER_OPEN_WEBUI,
] as const satisfies readonly OpenWebuiDeployment[];

type DeploymentSelector = "clientId" | "deploymentId" | "host";

const selectorField: Record<DeploymentSelector, keyof OpenWebuiDeployment> = {
  clientId: "oidcClientId",
  deploymentId: "deploymentId",
  host: "host",
};

export function findOpenWebuiDeployment(
  selector: DeploymentSelector,
  value: string,
): OpenWebuiDeployment | null {
  const field = selectorField[selector];
  return OPEN_WEBUI_DEPLOYMENTS.find((deployment) => deployment[field] === value) ?? null;
}
