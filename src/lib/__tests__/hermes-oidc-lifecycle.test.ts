import {
  activateHermesOidcClient,
  disableHermesOidcClient,
  markHermesOidcClientError,
  recoverHermesOidcClient,
  type HermesOidcClientRecord,
  type HermesOidcLifecycleGateway,
} from "@/lib/hermes-oidc";

describe("Hermes OIDC lifecycle transitions", () => {
  const input = {
    instanceId: "instance-1",
    ownerId: "owner-1",
    subdomain: "tenant-a.overnightdesk.com",
  };
  const client: HermesOidcClientRecord = {
    clientId: "public-client-id",
    clientSecret: null,
    disabled: false,
    redirectUris: ["https://tenant-a.overnightdesk.com/auth/callback"],
    scopes: ["openid", "profile", "email"],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    public: true,
    type: "user-agent-based",
    requirePKCE: true,
    skipConsent: true,
    metadata: { kind: "hermes-dashboard", schemaVersion: 1, instanceId: "instance-1" },
  };

  function gateway(
    overrides: Partial<HermesOidcLifecycleGateway> = {}
  ): HermesOidcLifecycleGateway {
    return {
      findInstance: jest.fn().mockResolvedValue({
        id: "instance-1",
        userId: "owner-1",
        subdomain: "tenant-a.overnightdesk.com",
        hermesOidcClientId: "public-client-id",
      }),
      findClient: jest.fn().mockResolvedValue(client),
      createClient: jest.fn(),
      linkPending: jest.fn(),
      removeClient: jest.fn(),
      setClientDisabled: jest.fn().mockResolvedValue(true),
      setInstanceAuthStatus: jest.fn().mockResolvedValue(true),
      recordAuditEvent: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("disables the client before recording the disabled state", async () => {
    const calls: string[] = [];
    const lifecycle = gateway({
      setClientDisabled: jest.fn(async () => {
        calls.push("client");
        return true;
      }),
      setInstanceAuthStatus: jest.fn(async () => {
        calls.push("instance");
        return true;
      }),
    });

    await disableHermesOidcClient(input, lifecycle);

    expect(calls).toEqual(["client", "instance"]);
    expect(lifecycle.setInstanceAuthStatus).toHaveBeenCalledWith(
      "instance-1",
      "public-client-id",
      "disabled"
    );
    expect(lifecycle.recordAuditEvent).toHaveBeenCalledWith({
      category: "revoked",
      instanceId: "instance-1",
      clientId: "public-client-id",
    });
  });

  it("keeps recovery pending and the client disabled", async () => {
    const lifecycle = gateway();

    await recoverHermesOidcClient(input, lifecycle);

    expect(lifecycle.setClientDisabled).toHaveBeenCalledWith(
      "public-client-id",
      true
    );
    expect(lifecycle.setInstanceAuthStatus).toHaveBeenCalledWith(
      "instance-1",
      "public-client-id",
      "pending"
    );
    expect(lifecycle.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("records configuration errors only after disabling the client", async () => {
    const lifecycle = gateway();

    await markHermesOidcClientError(input, lifecycle);

    expect(lifecycle.setClientDisabled).toHaveBeenCalledWith(
      "public-client-id",
      true
    );
    expect(lifecycle.setInstanceAuthStatus).toHaveBeenCalledWith(
      "instance-1",
      "public-client-id",
      "error"
    );
    expect(lifecycle.recordAuditEvent).toHaveBeenCalledWith({
      category: "callback_failure",
      instanceId: "instance-1",
      clientId: "public-client-id",
    });
  });

  it("keeps a completed revocation successful when audit storage is unavailable", async () => {
    const lifecycle = gateway({
      recordAuditEvent: jest.fn().mockRejectedValue(new Error("audit unavailable")),
    });

    await expect(disableHermesOidcClient(input, lifecycle)).resolves.toBeUndefined();
    expect(lifecycle.setInstanceAuthStatus).toHaveBeenCalledWith(
      "instance-1",
      "public-client-id",
      "disabled"
    );
  });

  it("rolls client activation back when the instance transition fails", async () => {
    const lifecycle = gateway({
      setInstanceAuthStatus: jest.fn().mockResolvedValue(false),
    });

    await expect(activateHermesOidcClient(input, lifecycle)).rejects.toThrow(
      "activation failed"
    );
    expect(lifecycle.setClientDisabled).toHaveBeenNthCalledWith(
      1,
      "public-client-id",
      false
    );
    expect(lifecycle.setClientDisabled).toHaveBeenNthCalledWith(
      2,
      "public-client-id",
      true
    );
  });
});
