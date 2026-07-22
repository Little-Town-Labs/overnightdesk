import {
  authorizeOpenWebuiCanonicalEdge,
  authorizeOpenWebuiCanonicalOidc,
  authorizeOpenWebuiCanonicalToken,
  defaultOpenWebuiCanonicalGateway,
  type OpenWebuiCanonicalAuthorizationConfig,
  type OpenWebuiCanonicalAuthorizationContext,
  type OpenWebuiCanonicalGateway,
} from "@/lib/open-webui-canonical-authorization";
export { TITUS_OPEN_WEBUI } from "@/lib/open-webui-deployments";

const LEGACY_CONFIRMATION = "ENABLE_TITUS_OPEN_WEBUI_GARY";
const CANONICAL_CONFIRMATION = "ENABLE_OPEN_WEBUI_CANONICAL_GARY";

export type TitusOpenWebuiCanaryMode = "disabled" | "canonical";
export interface TitusOpenWebuiCanaryConfig {
  mode?: string;
  confirmation?: string;
}
export type TitusOpenWebuiAuthorizationContext = OpenWebuiCanonicalAuthorizationContext;
export type TitusOpenWebuiGateway = OpenWebuiCanonicalGateway;

export function parseTitusOpenWebuiCanaryMode(
  rawMode?: string,
  confirmation?: string,
): TitusOpenWebuiCanaryMode {
  const mode = rawMode?.trim() || "disabled";
  if (mode === "disabled") return mode;
  if (mode !== "canonical") throw new Error("Invalid Titus Open WebUI canary mode");
  if (confirmation !== LEGACY_CONFIRMATION) {
    throw new Error("Titus Open WebUI canonical confirmation is required");
  }
  return mode;
}

function canonicalConfig(config?: TitusOpenWebuiCanaryConfig): OpenWebuiCanonicalAuthorizationConfig | undefined {
  if (!config) return undefined;
  const mode = parseTitusOpenWebuiCanaryMode(config.mode, config.confirmation);
  return {
    mode,
    confirmation: mode === "canonical" ? CANONICAL_CONFIRMATION : undefined,
  };
}

export function authorizeTitusOpenWebuiOidc(
  input: Parameters<typeof authorizeOpenWebuiCanonicalOidc>[0],
  gateway: TitusOpenWebuiGateway = defaultOpenWebuiCanonicalGateway,
  config?: TitusOpenWebuiCanaryConfig,
) {
  return authorizeOpenWebuiCanonicalOidc(input, gateway, canonicalConfig(config));
}

export function authorizeTitusOpenWebuiToken(
  input: Parameters<typeof authorizeOpenWebuiCanonicalToken>[0],
  gateway: TitusOpenWebuiGateway = defaultOpenWebuiCanonicalGateway,
  config?: TitusOpenWebuiCanaryConfig,
) {
  return authorizeOpenWebuiCanonicalToken(input, gateway, canonicalConfig(config));
}

export async function authorizeTitusOpenWebuiEdge(
  input: Parameters<typeof authorizeOpenWebuiCanonicalEdge>[0],
  gateway: TitusOpenWebuiGateway = defaultOpenWebuiCanonicalGateway,
  config?: TitusOpenWebuiCanaryConfig,
) {
  const result = await authorizeOpenWebuiCanonicalEdge(
    input,
    gateway,
    canonicalConfig(config),
  );
  return result.authorized;
}

export const defaultTitusOpenWebuiGateway = defaultOpenWebuiCanonicalGateway;
