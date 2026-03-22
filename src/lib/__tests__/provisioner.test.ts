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
    it("sends correct POST body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ received: true }),
      });

      await provisionerClient.provision({
        tenantId: "a1b2c3d4e5f6",
        plan: "starter",
        gatewayPort: 4001,
        dashboardTokenHash: "$2b$10$hash",
        callbackUrl: "https://overnightdesk.com/api/provisioner/callback",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.overnightdesk.com/provision",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-secret",
          }),
          body: expect.any(String),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.tenantId).toBe("a1b2c3d4e5f6");
      expect(body.plan).toBe("starter");
      expect(body.gatewayPort).toBe(4001);
    });

    it("returns success on 202", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ received: true }),
      });

      const result = await provisionerClient.provision({
        tenantId: "t1",
        plan: "starter",
        gatewayPort: 4000,
        dashboardTokenHash: "hash",
        callbackUrl: "url",
      });

      expect(result.success).toBe(true);
    });

    it("handles network error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await provisionerClient.provision({
        tenantId: "t1",
        plan: "starter",
        gatewayPort: 4000,
        dashboardTokenHash: "hash",
        callbackUrl: "url",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("handles non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      });

      const result = await provisionerClient.provision({
        tenantId: "t1",
        plan: "starter",
        gatewayPort: 4000,
        dashboardTokenHash: "hash",
        callbackUrl: "url",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("deprovision()", () => {
    it("sends correct POST body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ received: true }),
      });

      await provisionerClient.deprovision("a1b2c3d4e5f6");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.overnightdesk.com/deprovision",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-secret",
          }),
        })
      );
    });

    it("handles error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await provisionerClient.deprovision("t1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection refused");
    });
  });
});
