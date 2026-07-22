import { provisionerClient } from "@/lib/provisioner";

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("Provisioner Client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      PROVISIONER_URL: "https://api.overnightdesk.com",
      PROVISIONER_SECRET: "test-secret",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("provision()", () => {
    const validParams = {
      tenantId: "a1b2c3d4e5f6",
      subdomain: "a1b2c3d4e5f6.overnightdesk.com",
      plan: "starter" as const,
      callbackUrl: "https://overnightdesk.com/api/provisioner/callback",
      dashboardAuth: {
        provider: "self-hosted" as const,
        issuer: "https://www.overnightdesk.com/api/auth",
        clientId: "public-client-id",
        publicUrl: "https://a1b2c3d4e5f6.overnightdesk.com",
        callbackUrl: "https://a1b2c3d4e5f6.overnightdesk.com/auth/callback",
        scopes: ["openid", "profile", "email"] as const,
      },
    };

    it("sends tenantId, subdomain, plan, and callbackUrl in body", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.provision(validParams);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tenantId).toBe("a1b2c3d4e5f6");
      expect(body.subdomain).toBe("a1b2c3d4e5f6.overnightdesk.com");
      expect(body.plan).toBe("starter");
      expect(body.callbackUrl).toBe("https://overnightdesk.com/api/provisioner/callback");
      expect(body.dashboardAuth).toEqual(validParams.dashboardAuth);
    });

    it("does NOT send gatewayPort or dashboardTokenHash", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.provision(validParams);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gatewayPort).toBeUndefined();
      expect(body.dashboardTokenHash).toBeUndefined();
      expect(body.dashboardAuth.clientSecret).toBeUndefined();
    });

    it("sends Bearer auth header", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.provision(validParams);

      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer test-secret"
      );
    });

    it("POSTs to /provision endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.provision(validParams);

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.overnightdesk.com/provision"
      );
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });

    it("returns success on 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await provisionerClient.provision(validParams);

      expect(result.success).toBe(true);
    });

    it("returns failure with error message on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await provisionerClient.provision(validParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("handles network error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await provisionerClient.provision(validParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });

  describe("deprovision()", () => {
    it("POSTs to /deprovision with tenantId", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.deprovision("a1b2c3d4e5f6");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.overnightdesk.com/deprovision"
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tenantId).toBe("a1b2c3d4e5f6");
    });

    it("returns success on 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await provisionerClient.deprovision("t1");
      expect(result.success).toBe(true);
    });

    it("handles error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await provisionerClient.deprovision("t1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection refused");
    });
  });

  describe("restart()", () => {
    it("POSTs to /restart with tenantId", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.restart("a1b2c3d4e5f6");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.overnightdesk.com/restart"
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tenantId).toBe("a1b2c3d4e5f6");
    });
  });

  describe("replaceManagedVariable()", () => {
    const params = {
      requestId: "018f6f54-8c2f-4a33-8f28-a7e73f4a3111",
      boundaryId: "cdb9a259-7e99-4dd1-a023-bf2fa9e8c033",
      variableId: "openrouter_api_key" as const,
      value: `sk-or-v1-${"a".repeat(40)}`,
    };

    it("posts the exact typed request to the v1 endpoint", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          data: {
            requestId: params.requestId,
            variableId: params.variableId,
            outcome: "replaced",
            runtimeEffect: "restart",
            runtimeEffectStatus: "completed",
            replayed: false,
          },
        }), { status: 200, headers: { "content-type": "application/json" } }),
      );

      await provisionerClient.replaceManagedVariable(params);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.overnightdesk.com/v1/managed-variable-replacements",
      );
      expect(mockFetch.mock.calls[0][1]).toMatchObject({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
      });
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(params);
    });

    it("returns only the validated value-free success contract", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          data: {
            requestId: params.requestId,
            variableId: params.variableId,
            outcome: "replaced",
            runtimeEffect: "restart",
            runtimeEffectStatus: "completed",
            replayed: false,
          },
        }), { status: 200 }),
      );

      const result = await provisionerClient.replaceManagedVariable(params);

      expect(result).toEqual({
        success: true,
        data: {
          requestId: params.requestId,
          variableId: params.variableId,
          outcome: "replaced",
          runtimeEffect: "restart",
          runtimeEffectStatus: "completed",
          replayed: false,
        },
      });
      expect(JSON.stringify(result)).not.toContain(params.value);
      expect(JSON.stringify(result)).not.toContain(params.boundaryId);
    });

    it("preserves only the typed partial-success state", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: false,
          error: {
            code: "RUNTIME_EFFECT_FAILED",
            message: "The value was replaced, but the required runtime effect failed.",
          },
          data: {
            requestId: params.requestId,
            variableId: params.variableId,
            outcome: "replaced",
            runtimeEffect: "restart",
            runtimeEffectStatus: "failed",
            replayed: false,
          },
        }), { status: 502 }),
      );

      await expect(
        provisionerClient.replaceManagedVariable(params),
      ).resolves.toEqual({
        success: false,
        status: 502,
        code: "RUNTIME_EFFECT_FAILED",
        data: {
          requestId: params.requestId,
          variableId: params.variableId,
          outcome: "replaced",
          runtimeEffect: "restart",
          runtimeEffectStatus: "failed",
          replayed: false,
        },
      });
    });

    it.each([
      ["unknown fields", JSON.stringify({ success: true, data: { value: params.value } })],
      ["malformed JSON", `not-json-${params.value}`],
      ["oversized body", JSON.stringify({ padding: "x".repeat(9_000) })],
    ])("maps %s to a fixed value-free invalid response", async (_name, body) => {
      mockFetch.mockResolvedValueOnce(new Response(body, { status: 502 }));

      const result = await provisionerClient.replaceManagedVariable(params);

      expect(result).toEqual({
        success: false,
        status: 502,
        code: "INVALID_RESPONSE",
      });
      expect(JSON.stringify(result)).not.toContain(params.value);
    });

    it("maps network errors without returning external details", async () => {
      mockFetch.mockRejectedValueOnce(
        new Error(`provider echoed ${params.value}`),
      );

      const result = await provisionerClient.replaceManagedVariable(params);

      expect(result).toEqual({
        success: false,
        status: 502,
        code: "NETWORK_FAILURE",
      });
      expect(JSON.stringify(result)).not.toContain(params.value);
    });
  });

  describe("configureDashboardAuth()", () => {
    it("POSTs the non-secret client contract to /dashboard-auth", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const params = {
        tenantId: "a1b2c3d4e5f6",
        restart: true,
        dashboardAuth: {
          provider: "self-hosted" as const,
          issuer: "https://www.overnightdesk.com/api/auth",
          clientId: "public-client-id",
          publicUrl: "https://a1b2c3d4e5f6.overnightdesk.com",
          callbackUrl: "https://a1b2c3d4e5f6.overnightdesk.com/auth/callback",
          scopes: ["openid", "profile", "email"] as const,
        },
      };

      await expect(
        provisionerClient.configureDashboardAuth(params)
      ).resolves.toEqual({ success: true });

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.overnightdesk.com/dashboard-auth"
      );
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual(params);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).dashboardAuth.clientSecret).toBeUndefined();
    });

    it("maps provisioner failures without returning a response body", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });

      await expect(
        provisionerClient.configureDashboardAuth({
          tenantId: "tenant-a",
          restart: true,
          dashboardAuth: {
            provider: "self-hosted",
            issuer: "https://www.overnightdesk.com/api/auth",
            clientId: "public-client-id",
            publicUrl: "https://tenant-a.overnightdesk.com",
            callbackUrl: "https://tenant-a.overnightdesk.com/auth/callback",
            scopes: ["openid", "profile", "email"],
          },
        })
      ).resolves.toEqual({ success: false, error: "Provisioner returned 422" });
    });

    it("rejects a provisioner URL with a hidden path before fetch", async () => {
      process.env.PROVISIONER_URL = "https://api.overnightdesk.com/n";

      const result = await provisionerClient.configureDashboardAuth({
        tenantId: "tenant-a",
        restart: true,
        dashboardAuth: {
          provider: "self-hosted",
          issuer: "https://www.overnightdesk.com/api/auth",
          clientId: "public-client-id",
          publicUrl: "https://tenant-a.overnightdesk.com",
          callbackUrl: "https://tenant-a.overnightdesk.com/auth/callback",
          scopes: ["openid", "profile", "email"],
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("PROVISIONER_URL");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("getMitchelProspectingSummary()", () => {
    it("GETs the Mitchel prospecting summary by container id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tenantId: "hermes-mitchel", outboundSent: false }),
      });

      const result = await provisionerClient.getMitchelProspectingSummary("hermes-mitchel");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.overnightdesk.com/mitchel/prospecting/summary?containerId=hermes-mitchel"
      );
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-secret");
      expect(result).toEqual({ tenantId: "hermes-mitchel", outboundSent: false });
    });

    it("returns null when the summary endpoint is unavailable", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await provisionerClient.getMitchelProspectingSummary("hermes-mitchel");

      expect(result).toBeNull();
    });
  });
});
