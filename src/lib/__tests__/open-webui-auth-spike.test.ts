import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OPEN_WEBUI_RELEASE,
  OPEN_WEBUI_REQUEST_LIMIT_BYTES,
  authorizeOpenWebuiOidc,
  buildOpenWebuiAccountKey,
  buildOpenWebuiOidcClientPayload,
  buildOpenWebuiRuntimeConfig,
  buildOpenWebuiSecurityHeaders,
  evaluateOpenWebuiWorkspaceRequest,
  rollbackOpenWebuiAssignment,
  transitionOpenWebuiSession,
} from "@/lib/open-webui-auth-spike";
import {
  FixtureMembershipStore,
  MEMBERSHIP_FIXTURE_IDS,
  MEMBERSHIP_FIXTURE_NOW,
  controlledMembershipFixtures,
} from "@/lib/__tests__/fixtures/use-case-membership";
import { OPEN_WEBUI_TITUS_FIXTURE } from "@/lib/__tests__/fixtures/open-webui";
import { createUseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";
import { buildHermesOidcClientPayload } from "@/lib/hermes-oidc";

const assignment = OPEN_WEBUI_TITUS_FIXTURE.assignment;

function authorizer(records = controlledMembershipFixtures()) {
  return createUseCaseMembershipAuthorizer({
    store: new FixtureMembershipStore(records),
    assignment: {
      useCaseId: assignment.useCaseId,
      runtimeIdentityId: assignment.runtimeIdentityId,
    },
    now: () => MEMBERSHIP_FIXTURE_NOW,
    audit: jest.fn().mockResolvedValue(undefined),
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    userId: OPEN_WEBUI_TITUS_FIXTURE.userId,
    platformSessionActive: true,
    openWebuiSessionActive: true,
    requestedHost: assignment.host,
    oidcClientId: assignment.oidcClientId,
    oidcAudience: assignment.oidcAudience,
    frameAncestor: "https://www.overnightdesk.com",
    transport: "http" as const,
    capability: "text_chat" as const,
    contentLength: 1024,
    backendAvailable: true,
    trustedIdentityHeaderPresent: false,
    attemptsToolAuthorityExpansion: false,
    ...overrides,
  };
}

describe("Open WebUI v0.10.2 release pin", () => {
  it("pins the signed upstream commit and both supported Linux manifests", () => {
    const release = JSON.parse(
      readFileSync(
        join(process.cwd(), "infra/open-webui/release.json"),
        "utf8",
      ),
    );

    expect(release).toEqual(OPEN_WEBUI_RELEASE);
    expect(release.version).toBe("v0.10.2");
    expect(release.commit).toBe(
      "ecd48e2f718220a6400ecf49eafd4867a38feb10",
    );
    expect(release.image).toBe("ghcr.io/open-webui/open-webui:v0.10.2");
    expect(release.manifests.arm64).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(release.manifests.amd64).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(release.productionApproved).toBe(false);
  });
});

describe("separate Open WebUI OIDC client", () => {
  it("uses the exact callback, public-client PKCE, and Open WebUI metadata", () => {
    expect(buildOpenWebuiOidcClientPayload(assignment)).toEqual({
      redirect_uris: [
        "https://titus-chat.overnightdesk.com/oauth/oidc/callback",
      ],
      scope: "openid email profile offline_access",
      client_name: "OvernightDesk Open WebUI - open-webui-hermes-titus",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      type: "user-agent-based",
      skip_consent: true,
      require_pkce: true,
      metadata: {
        kind: "open-webui",
        schemaVersion: 1,
        deploymentId: assignment.deploymentId,
        useCaseId: assignment.useCaseId,
        runtimeIdentityId: assignment.runtimeIdentityId,
      },
    });
  });

  it("cannot be mistaken for the native Hermes dashboard client", () => {
    const openWebui = buildOpenWebuiOidcClientPayload(assignment);
    const hermes = buildHermesOidcClientPayload({
      instanceId: "fixture-instance-titus",
      subdomain: assignment.host,
    });

    expect(openWebui.metadata.kind).toBe("open-webui");
    expect(hermes.metadata.kind).toBe("hermes-dashboard");
    expect(openWebui.redirect_uris).toEqual([
      `https://${assignment.host}/oauth/oidc/callback`,
    ]);
    expect(hermes.redirect_uris).toEqual([
      `https://${assignment.host}/auth/callback`,
    ]);
  });

  it("accepts only the exact host, audience, callback, scopes, state, nonce, and S256 challenge", async () => {
    const query = new URLSearchParams({
      client_id: assignment.oidcClientId,
      response_type: "code",
      redirect_uri: `https://${assignment.host}/oauth/oidc/callback`,
      scope: "openid email profile offline_access",
      state: "fixture-state",
      nonce: "fixture-nonce",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    }).toString();

    await expect(
      authorizeOpenWebuiOidc(
        {
          user: { id: OPEN_WEBUI_TITUS_FIXTURE.userId, emailVerified: true },
          scopes: ["openid", "email", "profile", "offline_access"],
          query,
        },
        assignment,
        authorizer(),
      ),
    ).resolves.toEqual({
      deploymentId: assignment.deploymentId,
      accountKey: buildOpenWebuiAccountKey(
        assignment.issuer,
        OPEN_WEBUI_TITUS_FIXTURE.userId,
      ),
    });

    const wrongClient = new URLSearchParams(query);
    wrongClient.set("client_id", "walter-open-webui");
    await expect(
      authorizeOpenWebuiOidc(
        {
          user: { id: OPEN_WEBUI_TITUS_FIXTURE.userId, emailVerified: true },
          scopes: ["openid", "email", "profile", "offline_access"],
          query: wrongClient.toString(),
        },
        assignment,
        authorizer(),
      ),
    ).rejects.toThrow("denied");
  });

  it("keeps issuer and opaque subject in the account key without email linking", () => {
    expect(
      buildOpenWebuiAccountKey(assignment.issuer, "opaque-better-auth-id"),
    ).toBe(
      "https%3A%2F%2Fwww.overnightdesk.com%2Fapi%2Fauth::opaque-better-auth-id",
    );
  });

  it("rejects an external Hermes target and a noncanonical issuer", () => {
    expect(() =>
      buildOpenWebuiRuntimeConfig({
        ...assignment,
        hermesBaseUrl: "https://attacker.example/v1",
      }),
    ).toThrow("Invalid Open WebUI assignment");
    expect(() =>
      buildOpenWebuiRuntimeConfig({
        ...assignment,
        issuer: "https://attacker.example/api/auth",
      }),
    ).toThrow("Invalid Open WebUI assignment");
  });
});

describe("runtime, framing, cookie, and capability contract", () => {
  it("configures stateless OIDC, secure same-site cookies, local-auth shutdown, and text-only permissions", () => {
    const config = buildOpenWebuiRuntimeConfig(assignment);

    expect(config).toMatchObject({
      WEBUI_URL: "https://titus-chat.overnightdesk.com",
      OPENID_PROVIDER_URL:
        "https://www.overnightdesk.com/api/auth/.well-known/openid-configuration",
      OPENID_REDIRECT_URI:
        "https://titus-chat.overnightdesk.com/oauth/oidc/callback",
      OAUTH_CLIENT_ID: assignment.oidcClientId,
      OAUTH_CLIENT_SECRET: "",
      OAUTH_CODE_CHALLENGE_METHOD: "S256",
      OAUTH_SCOPES: "openid email profile offline_access",
      OAUTH_MERGE_ACCOUNTS_BY_EMAIL: "false",
      ENABLE_OAUTH_PERSISTENT_CONFIG: "false",
      ENABLE_OAUTH_ID_TOKEN_COOKIE: "false",
      ENABLE_OAUTH_SIGNUP: "true",
      ENABLE_SIGNUP: "false",
      ENABLE_LOGIN_FORM: "false",
      WEBUI_AUTH_COOKIE_SAME_SITE: "lax",
      WEBUI_AUTH_COOKIE_SECURE: "true",
      GLOBAL_LOG_LEVEL: "ERROR",
      ENABLE_AUDIT_LOGS_FILE: "false",
      AUDIT_LOG_LEVEL: "NONE",
      ENABLE_OLLAMA_API: "false",
      OPENAI_API_BASE_URL: "http://hermes-titus:8642/v1",
      USER_PERMISSIONS_CHAT_FILE_UPLOAD: "false",
      USER_PERMISSIONS_CHAT_WEB_UPLOAD: "false",
      USER_PERMISSIONS_CHAT_STT: "false",
      USER_PERMISSIONS_CHAT_TTS: "false",
      USER_PERMISSIONS_CHAT_CALL: "false",
      USER_PERMISSIONS_FEATURES_WEB_SEARCH: "false",
      USER_PERMISSIONS_FEATURES_IMAGE_GENERATION: "false",
      USER_PERMISSIONS_FEATURES_CODE_INTERPRETER: "false",
      USER_PERMISSIONS_WORKSPACE_TOOLS_ACCESS: "false",
    });
    expect(config).not.toHaveProperty("WEBUI_AUTH_TRUSTED_EMAIL_HEADER");
  });

  it("allows only approved OvernightDesk frame ancestors and no browser capabilities", () => {
    expect(buildOpenWebuiSecurityHeaders()).toEqual({
      "Content-Security-Policy":
        "frame-ancestors 'self' https://overnightdesk.com https://www.overnightdesk.com",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    expect(buildOpenWebuiSecurityHeaders()).not.toHaveProperty(
      "X-Frame-Options",
    );
  });
});

describe("fixture-backed request and session gate", () => {
  it.each(["http", "sse", "websocket"] as const)(
    "rechecks active membership for %s instead of trusting the Open WebUI cookie",
    async (transport) => {
      await expect(
        evaluateOpenWebuiWorkspaceRequest(
          request({ transport }),
          assignment,
          authorizer(),
        ),
      ).resolves.toEqual({ outcome: "granted" });
    },
  );

  it("bootstraps OIDC top-level, reuses the embedded session, logs out locally, and can re-login", async () => {
    await expect(
      evaluateOpenWebuiWorkspaceRequest(
        request({ openWebuiSessionActive: false }),
        assignment,
        authorizer(),
      ),
    ).resolves.toEqual({ outcome: "oidc_required" });

    expect(
      transitionOpenWebuiSession({
        action: "oidc_callback",
        platformSessionActive: true,
        openWebuiSessionActive: false,
      }),
    ).toEqual({ platformSessionActive: true, openWebuiSessionActive: true });
    expect(
      transitionOpenWebuiSession({
        action: "open_webui_logout",
        platformSessionActive: true,
        openWebuiSessionActive: true,
      }),
    ).toEqual({ platformSessionActive: true, openWebuiSessionActive: false });
  });

  it.each([
    ["unauthenticated", { userId: null, platformSessionActive: false }],
    ["non-member", { userId: MEMBERSHIP_FIXTURE_IDS.nonMember }],
    ["wrong use case", { userId: MEMBERSHIP_FIXTURE_IDS.wrongUseCaseMember }],
    ["suspended member", { userId: MEMBERSHIP_FIXTURE_IDS.suspendedMember }],
    ["wrong host", { requestedHost: "walter-chat.overnightdesk.com" }],
    ["wrong audience", { oidcAudience: "walter-client" }],
    ["wrong client", { oidcClientId: "walter-client" }],
    ["unapproved frame", { frameAncestor: OPEN_WEBUI_TITUS_FIXTURE.unapprovedFrameOrigin }],
    ["trusted identity header", { trustedIdentityHeaderPresent: true }],
    ["oversized request", { contentLength: OPEN_WEBUI_REQUEST_LIMIT_BYTES + 1 }],
    ["unavailable backend", { backendAvailable: false }],
    ["tool authority expansion", { attemptsToolAuthorityExpansion: true }],
    ["file upload", { capability: "file_upload" }],
  ])("denies %s", async (_name, overrides) => {
    await expect(
      evaluateOpenWebuiWorkspaceRequest(
        request(overrides),
        assignment,
        authorizer(),
      ),
    ).resolves.toMatchObject({ outcome: "denied" });
  });

  it("fails closed when canonical membership storage is unavailable", async () => {
    const unavailable = createUseCaseMembershipAuthorizer({
      store: {
        findActiveMembership: jest.fn().mockRejectedValue(new Error("down")),
      },
      assignment: {
        useCaseId: assignment.useCaseId,
        runtimeIdentityId: assignment.runtimeIdentityId,
      },
      audit: jest.fn().mockResolvedValue(undefined),
    });
    await expect(
      evaluateOpenWebuiWorkspaceRequest(request(), assignment, unavailable),
    ).resolves.toEqual({
      outcome: "denied",
      reason: "authorization_unavailable",
    });
  });

  it("platform logout denies a retained Open WebUI session at the edge", async () => {
    const loggedOut = transitionOpenWebuiSession({
      action: "platform_logout",
      platformSessionActive: true,
      openWebuiSessionActive: true,
    });
    expect(loggedOut).toEqual({
      platformSessionActive: false,
      openWebuiSessionActive: true,
    });
    await expect(
      evaluateOpenWebuiWorkspaceRequest(
        request(loggedOut),
        assignment,
        authorizer(),
      ),
    ).resolves.toEqual({ outcome: "denied", reason: "session_required" });
  });

  it("rollback closes assignment and preserves Open WebUI, Hermes, Matrix, and email state", async () => {
    const rolledBack = rollbackOpenWebuiAssignment(assignment);
    expect(rolledBack).toEqual({
      assignment: { ...assignment, enabled: false },
      preserved: {
        openWebuiVolume: true,
        hermesRuntime: true,
        matrix: true,
        email: true,
      },
    });
    await expect(
      evaluateOpenWebuiWorkspaceRequest(
        request(),
        rolledBack.assignment,
        authorizer(),
      ),
    ).resolves.toEqual({ outcome: "denied", reason: "assignment_disabled" });
  });
});
