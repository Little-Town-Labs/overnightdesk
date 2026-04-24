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
    };

    it("sends tenantId, subdomain, plan, and callbackUrl in body", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.provision(validParams);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tenantId).toBe("a1b2c3d4e5f6");
      expect(body.subdomain).toBe("a1b2c3d4e5f6.overnightdesk.com");
      expect(body.plan).toBe("starter");
      expect(body.callbackUrl).toBe("https://overnightdesk.com/api/provisioner/callback");
    });

    it("does NOT send gatewayPort or dashboardTokenHash", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await provisionerClient.provision(validParams);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.gatewayPort).toBeUndefined();
      expect(body.dashboardTokenHash).toBeUndefined();
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
});
