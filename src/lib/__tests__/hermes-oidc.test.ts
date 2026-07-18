import {
  activateHermesOidcClient,
  buildHermesOidcClientPayload,
  ensureHermesOidcClient,
  getHermesOidcCallbackUrl,
  getHermesOidcIssuer,
  type HermesOidcClientRecord,
  type HermesOidcLifecycleGateway,
} from "@/lib/hermes-oidc";

describe("Hermes OIDC contract builders", () => {
  it("builds the canonical Better Auth issuer", () => {
    expect(getHermesOidcIssuer("https://www.overnightdesk.com")).toBe(
      "https://www.overnightdesk.com/api/auth"
    );
    expect(getHermesOidcIssuer("https://www.overnightdesk.com/")).toBe(
      "https://www.overnightdesk.com/api/auth"
    );
  });

  it("builds the exact HTTPS Hermes callback", () => {
    expect(getHermesOidcCallbackUrl("tenant-a.overnightdesk.com")).toBe(
      "https://tenant-a.overnightdesk.com/auth/callback"
    );
  });

  it("rejects non-canonical platform and tenant origins", () => {
    expect(() => getHermesOidcIssuer("http://www.overnightdesk.com")).toThrow(
      "HTTPS"
    );
    expect(() => getHermesOidcCallbackUrl("tenant-a.evil.example")).toThrow(
      "Invalid Hermes tenant host"
    );
  });

  it("builds a disabled public client with the fixed Hermes contract", () => {
    expect(
      buildHermesOidcClientPayload({
        instanceId: "instance-1",
        subdomain: "tenant-a.overnightdesk.com",
      })
    ).toEqual({
      redirect_uris: ["https://tenant-a.overnightdesk.com/auth/callback"],
      scope: "openid profile email",
      client_name: "OvernightDesk Hermes Dashboard",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      type: "user-agent-based",
      disabled: true,
      skip_consent: true,
      require_pkce: true,
      metadata: {
        kind: "hermes-dashboard",
        schemaVersion: 1,
        instanceId: "instance-1",
      },
    });
  });
});

describe("Hermes OIDC client lifecycle", () => {
  const input = {
    instanceId: "instance-1",
    ownerId: "owner-1",
    subdomain: "tenant-a.overnightdesk.com",
  };

  function client(clientId = "public-client-id"): HermesOidcClientRecord {
    return {
      clientId,
      clientSecret: null,
      disabled: true,
      redirectUris: ["https://tenant-a.overnightdesk.com/auth/callback"],
      scopes: ["openid", "profile", "email"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      public: true,
      type: "user-agent-based",
      requirePKCE: true,
      skipConsent: true,
      metadata: {
        kind: "hermes-dashboard",
        schemaVersion: 1,
        instanceId: "instance-1",
      },
    };
  }

  function gateway(
    overrides: Partial<HermesOidcLifecycleGateway> = {}
  ): HermesOidcLifecycleGateway {
    return {
      findInstance: jest.fn().mockResolvedValue({
        id: "instance-1",
        userId: "owner-1",
        subdomain: "tenant-a.overnightdesk.com",
        hermesOidcClientId: null,
      }),
      findClient: jest.fn().mockResolvedValue(client()),
      createClient: jest.fn().mockResolvedValue({ clientId: "public-client-id" }),
      linkPending: jest.fn().mockResolvedValue(true),
      removeClient: jest.fn().mockResolvedValue(undefined),
      setClientDisabled: jest.fn().mockResolvedValue(true),
      setInstanceAuthStatus: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  it("creates and links one disabled public client as pending", async () => {
    const lifecycle = gateway();

    await expect(ensureHermesOidcClient(input, lifecycle)).resolves.toEqual({
      clientId: "public-client-id",
      created: true,
    });
    expect(lifecycle.createClient).toHaveBeenCalledWith(
      buildHermesOidcClientPayload(input)
    );
    expect(lifecycle.linkPending).toHaveBeenCalledWith(
      "instance-1",
      "public-client-id"
    );
  });

  it("reuses an exact linked client without creating another", async () => {
    const lifecycle = gateway({
      findInstance: jest.fn().mockResolvedValue({
        id: "instance-1",
        userId: "owner-1",
        subdomain: "tenant-a.overnightdesk.com",
        hermesOidcClientId: "existing-client",
      }),
      findClient: jest.fn().mockResolvedValue(client("existing-client")),
    });

    await expect(ensureHermesOidcClient(input, lifecycle)).resolves.toEqual({
      clientId: "existing-client",
      created: false,
    });
    expect(lifecycle.createClient).not.toHaveBeenCalled();
  });

  it("enables the exact linked client before marking the instance active", async () => {
    const lifecycle = gateway({
      findInstance: jest.fn().mockResolvedValue({
        id: "instance-1",
        userId: "owner-1",
        subdomain: "tenant-a.overnightdesk.com",
        hermesOidcClientId: "public-client-id",
      }),
    });

    await activateHermesOidcClient(input, lifecycle);

    expect(lifecycle.setClientDisabled).toHaveBeenCalledWith(
      "public-client-id",
      false
    );
    expect(lifecycle.setInstanceAuthStatus).toHaveBeenCalledWith(
      "instance-1",
      "public-client-id",
      "active"
    );
  });

  it("rejects a caller who is not the canonical instance owner", async () => {
    const lifecycle = gateway();

    await expect(
      ensureHermesOidcClient({ ...input, ownerId: "other-user" }, lifecycle)
    ).rejects.toThrow("unavailable");
    expect(lifecycle.createClient).not.toHaveBeenCalled();
  });
});
