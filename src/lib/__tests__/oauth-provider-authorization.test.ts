import {
  authorizeOAuthProviderLogin,
  authorizeOAuthProviderToken,
  type OAuthProviderAuthorizationDependencies,
} from "@/lib/oauth-provider-authorization";

function dependencies(
  kind: "hermes-dashboard" | "open-webui" | null,
): OAuthProviderAuthorizationDependencies & {
  authorizeHermesLogin: jest.Mock;
  authorizeOpenWebuiLogin: jest.Mock;
  authorizeHermesToken: jest.Mock;
  authorizeOpenWebuiToken: jest.Mock;
} {
  return {
    resolveClientKind: jest.fn().mockResolvedValue(kind),
    authorizeHermesLogin: jest.fn().mockResolvedValue("instance-1"),
    authorizeOpenWebuiLogin: jest
      .fn()
      .mockResolvedValue("open-webui-hermes-titus"),
    authorizeHermesToken: jest.fn().mockResolvedValue({}),
    authorizeOpenWebuiToken: jest.fn().mockResolvedValue({}),
  };
}

const user = { id: "stable-user-id", emailVerified: true };

describe("Better Auth OAuth provider authorization dispatch", () => {
  it("preserves the native Hermes dashboard login path", async () => {
    const deps = dependencies("hermes-dashboard");
    const query = new URLSearchParams({ client_id: "hermes-client" }).toString();

    await expect(
      authorizeOAuthProviderLogin(
        { user, scopes: ["openid", "profile", "email"], query },
        deps,
      ),
    ).resolves.toEqual({
      kind: "hermes-dashboard",
      referenceId: "instance-1",
      clientId: "hermes-client",
    });
    expect(deps.authorizeHermesLogin).toHaveBeenCalledTimes(1);
    expect(deps.authorizeOpenWebuiLogin).not.toHaveBeenCalled();
  });

  it("routes only a registered Open WebUI client to the Titus adapter", async () => {
    const deps = dependencies("open-webui");
    const query = new URLSearchParams({
      client_id: "overnightdesk-open-webui-titus-v1",
    }).toString();

    await expect(
      authorizeOAuthProviderLogin(
        { user, scopes: ["openid", "email", "profile"], query },
        deps,
      ),
    ).resolves.toEqual({
      kind: "open-webui",
      referenceId: "open-webui-hermes-titus",
      clientId: "overnightdesk-open-webui-titus-v1",
    });
    expect(deps.authorizeOpenWebuiLogin).toHaveBeenCalledTimes(1);
    expect(deps.authorizeHermesLogin).not.toHaveBeenCalled();
  });

  it("denies missing, unknown, or unsupported client kinds", async () => {
    const unknown = dependencies(null);
    await expect(
      authorizeOAuthProviderLogin(
        { user, scopes: ["openid"], query: "client_id=unknown" },
        unknown,
      ),
    ).rejects.toThrow("denied");
    await expect(
      authorizeOAuthProviderLogin(
        { user, scopes: ["openid"], query: "" },
        unknown,
      ),
    ).rejects.toThrow("denied");
  });

  it("rechecks the matching adapter at token time", async () => {
    const hermes = dependencies("hermes-dashboard");
    await expect(
      authorizeOAuthProviderToken(
        {
          user,
          scopes: ["openid", "profile", "email"],
          metadata: { kind: "hermes-dashboard", schemaVersion: 1 },
        },
        hermes,
      ),
    ).resolves.toEqual({});
    expect(hermes.authorizeHermesToken).toHaveBeenCalledTimes(1);

    const openWebui = dependencies("open-webui");
    await expect(
      authorizeOAuthProviderToken(
        {
          user,
          scopes: ["openid", "email", "profile"],
          metadata: { kind: "open-webui", schemaVersion: 1 },
        },
        openWebui,
      ),
    ).resolves.toEqual({});
    expect(openWebui.authorizeOpenWebuiToken).toHaveBeenCalledTimes(1);
  });
});
