import { z } from "zod";
import releasePin from "../../infra/open-webui/release.json";
import type { UseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";

export const OPEN_WEBUI_RELEASE = releasePin;
export const OPEN_WEBUI_REQUEST_LIMIT_BYTES = 64 * 1024;
export const OPEN_WEBUI_OIDC_SCOPES = ["openid", "email", "profile"] as const;

const APPROVED_FRAME_ANCESTORS = [
  "https://overnightdesk.com",
  "https://www.overnightdesk.com",
] as const;
const OPEN_WEBUI_CALLBACK_PATH = "/oauth/oidc/callback";

export interface OpenWebuiWorkspaceAssignment {
  enabled: boolean;
  deploymentId: string;
  useCaseId: string;
  runtimeIdentityId: string;
  host: string;
  oidcClientId: string;
  oidcAudience: string;
  issuer: string;
  hermesBaseUrl: string;
}

const assignmentSchema = z
  .object({
    enabled: z.boolean(),
    deploymentId: z.string().min(1).max(128),
    useCaseId: z.string().uuid(),
    runtimeIdentityId: z.string().uuid(),
    host: z.string().min(1).max(253),
    oidcClientId: z.string().min(1).max(255),
    oidcAudience: z.string().min(1).max(255),
    issuer: z.string().url(),
    hermesBaseUrl: z.string().url(),
  })
  .strict();

const requestSchema = z
  .object({
    userId: z.string().min(1).max(255).nullable(),
    platformSessionActive: z.boolean(),
    openWebuiSessionActive: z.boolean(),
    requestedHost: z.string().min(1).max(253),
    oidcClientId: z.string().min(1).max(255),
    oidcAudience: z.string().min(1).max(255),
    frameAncestor: z.string().url().nullable().optional(),
    transport: z.enum(["http", "sse", "websocket"]),
    capability: z.enum([
      "text_chat",
      "file_upload",
      "web_search",
      "code_execution",
      "audio",
      "camera",
    ]),
    contentLength: z.number().int().nonnegative(),
    backendAvailable: z.boolean(),
    trustedIdentityHeaderPresent: z.boolean(),
    attemptsToolAuthorityExpansion: z.boolean(),
  })
  .strict();

export type OpenWebuiWorkspaceDecision =
  | { outcome: "granted" }
  | { outcome: "oidc_required" }
  | {
      outcome: "denied";
      reason:
        | "assignment_disabled"
        | "session_required"
        | "assignment_mismatch"
        | "frame_denied"
        | "trusted_header_rejected"
        | "request_too_large"
        | "capability_disabled"
        | "tool_authority_rejected"
        | "backend_unavailable"
        | "not_authorized"
        | "authorization_unavailable";
    };

function parseAssignment(
  assignment: OpenWebuiWorkspaceAssignment,
): OpenWebuiWorkspaceAssignment {
  const parsed = assignmentSchema.safeParse(assignment);
  if (!parsed.success) throw new Error("Invalid Open WebUI assignment");
  const hostUrl = new URL(`https://${parsed.data.host}`);
  const issuerUrl = new URL(parsed.data.issuer);
  const hermesUrl = new URL(parsed.data.hermesBaseUrl);
  if (
    hostUrl.hostname !== parsed.data.host ||
    hostUrl.port ||
    parsed.data.host !== parsed.data.host.toLowerCase() ||
    !parsed.data.host.endsWith(".overnightdesk.com") ||
    parsed.data.oidcAudience !== parsed.data.oidcClientId ||
    issuerUrl.protocol !== "https:" ||
    issuerUrl.hostname !== "www.overnightdesk.com" ||
    issuerUrl.pathname.replace(/\/$/, "") !== "/api/auth" ||
    hermesUrl.protocol !== "http:" ||
    !/^hermes-[a-z0-9-]+$/.test(hermesUrl.hostname) ||
    hermesUrl.port !== "8642" ||
    hermesUrl.pathname.replace(/\/$/, "") !== "/v1" ||
    hermesUrl.username ||
    hermesUrl.password ||
    hermesUrl.search ||
    hermesUrl.hash
  ) {
    throw new Error("Invalid Open WebUI assignment");
  }
  return parsed.data;
}

function callbackUrl(assignment: OpenWebuiWorkspaceAssignment): string {
  return `https://${assignment.host}${OPEN_WEBUI_CALLBACK_PATH}`;
}

export function buildOpenWebuiOidcClientPayload(
  rawAssignment: OpenWebuiWorkspaceAssignment,
) {
  const assignment = parseAssignment(rawAssignment);
  return {
    redirect_uris: [callbackUrl(assignment)],
    scope: OPEN_WEBUI_OIDC_SCOPES.join(" "),
    client_name: `OvernightDesk Open WebUI - ${assignment.deploymentId}`,
    token_endpoint_auth_method: "none" as const,
    grant_types: ["authorization_code" as const],
    response_types: ["code" as const],
    type: "user-agent-based" as const,
    skip_consent: true,
    require_pkce: true,
    metadata: {
      kind: "open-webui",
      schemaVersion: 1,
      deploymentId: assignment.deploymentId,
      useCaseId: assignment.useCaseId,
      runtimeIdentityId: assignment.runtimeIdentityId,
    },
  };
}

export function buildOpenWebuiAccountKey(
  issuer: string,
  subject: string,
): string {
  const issuerUrl = new URL(issuer);
  if (
    issuerUrl.protocol !== "https:" ||
    issuerUrl.username ||
    issuerUrl.password ||
    issuerUrl.search ||
    issuerUrl.hash ||
    subject.length < 1 ||
    subject.length > 255
  ) {
    throw new Error("Invalid Open WebUI account identity");
  }
  return `${encodeURIComponent(issuerUrl.toString().replace(/\/$/, ""))}::${encodeURIComponent(subject)}`;
}

function isExactOidcRequest(
  input: { scopes: string[]; query: string },
  assignment: OpenWebuiWorkspaceAssignment,
): boolean {
  const query = new URLSearchParams(input.query);
  const requestedScopes = (query.get("scope") ?? "").split(" ").filter(Boolean);
  const challenge = query.get("code_challenge") ?? "";
  const state = query.get("state") ?? "";
  const nonce = query.get("nonce") ?? "";
  return (
    query.get("client_id") === assignment.oidcClientId &&
    query.get("response_type") === "code" &&
    query.get("redirect_uri") === callbackUrl(assignment) &&
    requestedScopes.join(" ") === OPEN_WEBUI_OIDC_SCOPES.join(" ") &&
    input.scopes.join(" ") === OPEN_WEBUI_OIDC_SCOPES.join(" ") &&
    state.length > 0 &&
    state.length <= 512 &&
    nonce.length > 0 &&
    nonce.length <= 512 &&
    query.get("code_challenge_method") === "S256" &&
    /^[A-Za-z0-9_-]{43,128}$/.test(challenge)
  );
}

function denyOidc(): never {
  throw new Error("Open WebUI OIDC authorization denied");
}

export async function authorizeOpenWebuiOidc(
  input: {
    user: { id: string; emailVerified: boolean };
    scopes: string[];
    query: string;
  },
  rawAssignment: OpenWebuiWorkspaceAssignment,
  authorizer: UseCaseMembershipAuthorizer,
): Promise<{ deploymentId: string; accountKey: string }> {
  const assignment = parseAssignment(rawAssignment);
  if (!assignment.enabled || !input.user.emailVerified) denyOidc();
  if (!isExactOidcRequest(input, assignment)) denyOidc();
  const decision = await authorizer.authorize({ userId: input.user.id });
  if (!decision.authorized) denyOidc();
  return {
    deploymentId: assignment.deploymentId,
    accountKey: buildOpenWebuiAccountKey(assignment.issuer, input.user.id),
  };
}

export function buildOpenWebuiSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": `frame-ancestors 'self' ${APPROVED_FRAME_ANCESTORS.join(" ")}`,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

export function buildOpenWebuiRuntimeConfig(
  rawAssignment: OpenWebuiWorkspaceAssignment,
): Record<string, string> {
  const assignment = parseAssignment(rawAssignment);
  return {
    WEBUI_URL: `https://${assignment.host}`,
    OPENID_PROVIDER_URL: `${assignment.issuer}/.well-known/openid-configuration`,
    OPENID_REDIRECT_URI: callbackUrl(assignment),
    OAUTH_CLIENT_ID: assignment.oidcClientId,
    OAUTH_CLIENT_SECRET: "",
    OAUTH_CODE_CHALLENGE_METHOD: "S256",
    OAUTH_SCOPES: OPEN_WEBUI_OIDC_SCOPES.join(" "),
    OAUTH_MERGE_ACCOUNTS_BY_EMAIL: "false",
    ENABLE_OAUTH_PERSISTENT_CONFIG: "false",
    ENABLE_OAUTH_ID_TOKEN_COOKIE: "false",
    ENABLE_OAUTH_SIGNUP: "true",
    ENABLE_SIGNUP: "false",
    ENABLE_LOGIN_FORM: "false",
    OAUTH_AUTO_REDIRECT: "true",
    WEBUI_AUTH_COOKIE_SAME_SITE: "lax",
    WEBUI_AUTH_COOKIE_SECURE: "true",
    WEBUI_AUTH_SIGNOUT_REDIRECT_URL:
      "https://www.overnightdesk.com/dashboard/chat?workspace=logged-out",
    GLOBAL_LOG_LEVEL: "ERROR",
    ENABLE_AUDIT_LOGS_FILE: "false",
    AUDIT_LOG_LEVEL: "NONE",
    ENABLE_OLLAMA_API: "false",
    OPENAI_API_BASE_URL: assignment.hermesBaseUrl,
    USER_PERMISSIONS_CHAT_FILE_UPLOAD: "false",
    USER_PERMISSIONS_CHAT_WEB_UPLOAD: "false",
    USER_PERMISSIONS_CHAT_STT: "false",
    USER_PERMISSIONS_CHAT_TTS: "false",
    USER_PERMISSIONS_CHAT_CALL: "false",
    USER_PERMISSIONS_FEATURES_WEB_SEARCH: "false",
    USER_PERMISSIONS_FEATURES_IMAGE_GENERATION: "false",
    USER_PERMISSIONS_FEATURES_CODE_INTERPRETER: "false",
    USER_PERMISSIONS_WORKSPACE_TOOLS_ACCESS: "false",
    ...Object.fromEntries(
      Object.entries(buildOpenWebuiSecurityHeaders()).map(([key, value]) => [
        key.toUpperCase().replaceAll("-", "_"),
        value,
      ]),
    ),
  };
}

function staticRequestDenial(
  request: z.infer<typeof requestSchema>,
  assignment: OpenWebuiWorkspaceAssignment,
): OpenWebuiWorkspaceDecision | null {
  if (!assignment.enabled) return { outcome: "denied", reason: "assignment_disabled" };
  if (!request.platformSessionActive || !request.userId) {
    return { outcome: "denied", reason: "session_required" };
  }
  if (
    request.requestedHost !== assignment.host ||
    request.oidcClientId !== assignment.oidcClientId ||
    request.oidcAudience !== assignment.oidcAudience
  ) {
    return { outcome: "denied", reason: "assignment_mismatch" };
  }
  if (
    request.frameAncestor &&
    !APPROVED_FRAME_ANCESTORS.includes(
      request.frameAncestor as (typeof APPROVED_FRAME_ANCESTORS)[number],
    )
  ) {
    return { outcome: "denied", reason: "frame_denied" };
  }
  if (request.trustedIdentityHeaderPresent) {
    return { outcome: "denied", reason: "trusted_header_rejected" };
  }
  if (request.contentLength > OPEN_WEBUI_REQUEST_LIMIT_BYTES) {
    return { outcome: "denied", reason: "request_too_large" };
  }
  if (request.capability !== "text_chat") {
    return { outcome: "denied", reason: "capability_disabled" };
  }
  if (request.attemptsToolAuthorityExpansion) {
    return { outcome: "denied", reason: "tool_authority_rejected" };
  }
  if (!request.backendAvailable) {
    return { outcome: "denied", reason: "backend_unavailable" };
  }
  return null;
}

export async function evaluateOpenWebuiWorkspaceRequest(
  rawRequest: unknown,
  rawAssignment: OpenWebuiWorkspaceAssignment,
  authorizer: UseCaseMembershipAuthorizer,
): Promise<OpenWebuiWorkspaceDecision> {
  const assignment = parseAssignment(rawAssignment);
  const parsed = requestSchema.safeParse(rawRequest);
  if (!parsed.success) return { outcome: "denied", reason: "assignment_mismatch" };
  const staticDenial = staticRequestDenial(parsed.data, assignment);
  if (staticDenial) return staticDenial;
  const decision = await authorizer.authorize({ userId: parsed.data.userId! });
  if (!decision.authorized) {
    return { outcome: "denied", reason: decision.reason };
  }
  if (!parsed.data.openWebuiSessionActive) return { outcome: "oidc_required" };
  return { outcome: "granted" };
}

const sessionTransitionSchema = z
  .object({
    action: z.enum(["oidc_callback", "open_webui_logout", "platform_logout"]),
    platformSessionActive: z.boolean(),
    openWebuiSessionActive: z.boolean(),
  })
  .strict();

export function transitionOpenWebuiSession(rawState: unknown) {
  const state = sessionTransitionSchema.parse(rawState);
  if (state.action === "platform_logout") {
    return { platformSessionActive: false, openWebuiSessionActive: state.openWebuiSessionActive };
  }
  if (state.action === "open_webui_logout") {
    return { platformSessionActive: state.platformSessionActive, openWebuiSessionActive: false };
  }
  return {
    platformSessionActive: state.platformSessionActive,
    openWebuiSessionActive: state.platformSessionActive,
  };
}

export function rollbackOpenWebuiAssignment(
  rawAssignment: OpenWebuiWorkspaceAssignment,
) {
  const assignment = parseAssignment(rawAssignment);
  return {
    assignment: { ...assignment, enabled: false },
    preserved: {
      openWebuiVolume: true,
      hermesRuntime: true,
      matrix: true,
      email: true,
    },
  };
}
