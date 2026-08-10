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
      PROVISIONER_URL: "https://provisioner.overnightdesk.com",
      PROVISIONER_SECRET: "test-secret",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("exposes only the approved managed-variable and read-only summary operations", () => {
    expect(Object.keys(provisionerClient).sort()).toEqual([
      "getMitchelProspectingSummary",
      "replaceManagedVariable",
    ]);
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
        "https://provisioner.overnightdesk.com/v1/managed-variable-replacements",
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

    it("rejects a valid-shaped response for a different operation", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          data: {
            requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            variableId: params.variableId,
            outcome: "replaced",
            runtimeEffect: "restart",
            runtimeEffectStatus: "completed",
            replayed: false,
          },
        }), { status: 200 }),
      );

      await expect(
        provisionerClient.replaceManagedVariable(params),
      ).resolves.toEqual({
        success: false,
        status: 502,
        code: "INVALID_RESPONSE",
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

  describe("getMitchelProspectingSummary()", () => {
    it("GETs the Mitchel prospecting summary by container id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tenantId: "hermes-mitchel", outboundSent: false }),
      });

      const result = await provisionerClient.getMitchelProspectingSummary("hermes-mitchel");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://provisioner.overnightdesk.com/mitchel/prospecting/summary?containerId=hermes-mitchel"
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
