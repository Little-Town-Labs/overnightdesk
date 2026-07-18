import {
  buildHermesOidcAuditRecord,
  withHermesJwksFailureAudit,
} from "@/lib/hermes-oidc-audit";

describe("Hermes OIDC audit redaction", () => {
  it("stores only allowlisted metadata and a non-reversible client fingerprint", () => {
    const record = buildHermesOidcAuditRecord({
      category: "denied",
      reason: "invalid_client",
      instanceId: "instance-1",
      clientId: "public-client-id",
      requestId: "request-1",
    });
    const serialized = JSON.stringify(record);

    expect(record.details).toEqual({
      category: "denied",
      reason: "invalid_client",
      instanceId: "instance-1",
      clientFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
      requestId: "request-1",
    });
    expect(serialized).not.toContain("public-client-id");
  });

  it.each([
    "state-value",
    "nonce-value",
    "authorization-code",
    "pkce-verifier",
    "access-token",
    "cookie-value",
    "owner@example.com",
    "private-key",
  ])("cannot include prohibited protocol artifact %s", (artifact) => {
    const serialized = JSON.stringify(
      buildHermesOidcAuditRecord({
        category: "denied",
        clientId: "public-client-id",
        requestId: `${artifact}/invalid`,
      })
    );
    expect(serialized).not.toContain(artifact);
  });
});

describe("Hermes JWKS failure audit boundary", () => {
  it("preserves successful JWKS responses", async () => {
    const recorder = jest.fn().mockResolvedValue(undefined);
    const response = await withHermesJwksFailureAudit(
      new Request("https://www.overnightdesk.com/api/auth/jwks"),
      async () => new Response("ok", { status: 200 }),
      recorder
    );
    expect(response.status).toBe(200);
    expect(recorder).not.toHaveBeenCalled();
  });

  it("records a metadata-only event for failed JWKS responses", async () => {
    const recorder = jest.fn().mockResolvedValue(undefined);
    const response = await withHermesJwksFailureAudit(
      new Request("https://www.overnightdesk.com/api/auth/jwks"),
      async () => new Response("error", { status: 500 }),
      recorder
    );
    expect(response.status).toBe(500);
    expect(recorder).toHaveBeenCalledWith({ category: "jwks_failure" });
  });

  it("preserves non-JWKS failures without treating them as key failures", async () => {
    const recorder = jest.fn().mockResolvedValue(undefined);
    const response = await withHermesJwksFailureAudit(
      new Request("https://www.overnightdesk.com/api/auth/get-session"),
      async () => new Response("error", { status: 500 }),
      recorder
    );
    expect(response.status).toBe(500);
    expect(recorder).not.toHaveBeenCalled();
  });
});
