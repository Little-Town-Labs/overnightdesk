import { getAuthStatus, getTerminalTicket } from "@/lib/engine-client";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("Engine Client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAuthStatus()", () => {
    it("returns authenticated when engine reports authenticated", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "authenticated" }),
      });

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("authenticated");
    });

    it("returns not_authenticated when engine reports not_authenticated", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "not_authenticated" }),
      });

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("not_authenticated");
    });

    it("returns unknown when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("unknown");
    });

    it("sends correct Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: "authenticated" }),
      });

      await getAuthStatus("tenant.overnightdesk.com", "mykey123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/auth-status",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer mykey123",
          }),
        })
      );
    });

    it("returns unknown on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getAuthStatus("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("unknown");
    });
  });

  describe("getTerminalTicket()", () => {
    it("returns ticket on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ticket: "abc123" }),
      });

      const result = await getTerminalTicket("tenant.overnightdesk.com", "apikey");
      expect(result).toBe("abc123");
    });

    it("returns null when engine is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await getTerminalTicket("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });

    it("sends correct Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ticket: "xyz" }),
      });

      await getTerminalTicket("tenant.overnightdesk.com", "mykey");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tenant.overnightdesk.com/api/terminal/ticket",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mykey",
          }),
        })
      );
    });

    it("returns null on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await getTerminalTicket("tenant.overnightdesk.com", "apikey");
      expect(result).toBeNull();
    });
  });
});
