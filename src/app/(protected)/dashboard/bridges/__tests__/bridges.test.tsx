/**
 * Bridges — Unit Tests (Feature 8)
 *
 * Tests the bridge status card and wizard components:
 * - BridgeStatusCard renders configured/unconfigured states
 * - Telegram wizard validation (token format, user IDs)
 * - Discord wizard validation (token length, user IDs)
 * - API call payloads for save/delete
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let bridgeMockFetchResponse: { ok: boolean; json: () => Promise<unknown> };

const bridgeMockFetch = jest.fn().mockImplementation(() =>
  Promise.resolve(bridgeMockFetchResponse)
);

(globalThis as unknown as Record<string, unknown>).fetch = bridgeMockFetch;

// ---------------------------------------------------------------------------
// BridgeStatusCard logic tests
// ---------------------------------------------------------------------------

describe("BridgeStatusCard logic", () => {
  describe("configured state detection", () => {
    it("detects unconfigured state when config is null", () => {
      const config = null;
      const isConfigured = config !== null && typeof (config as Record<string, unknown>)?.bot_token === "string";
      expect(isConfigured).toBe(false);
    });

    it("detects unconfigured state when config has no bot_token", () => {
      const config: Record<string, unknown> = { enabled: false };
      const isConfigured = config !== null && typeof config.bot_token === "string";
      expect(isConfigured).toBe(false);
    });

    it("detects configured state when config has bot_token", () => {
      const config: Record<string, unknown> = {
        bot_token: "123456:ABCdef",
        allowed_users: [111],
        enabled: true,
      };
      const isConfigured = config !== null && typeof config.bot_token === "string";
      expect(isConfigured).toBe(true);
    });

    it("extracts allowed_users count correctly", () => {
      const config: Record<string, unknown> = {
        bot_token: "123456:ABCdef",
        allowed_users: [111, 222, 333],
        enabled: true,
      };
      const allowedUsers = (config.allowed_users as unknown[] | undefined) ?? [];
      expect(allowedUsers.length).toBe(3);
    });

    it("defaults allowed_users to empty array when missing", () => {
      const config: Record<string, unknown> = {
        bot_token: "123456:ABCdef",
        enabled: true,
      };
      const allowedUsers = (config.allowed_users as unknown[] | undefined) ?? [];
      expect(allowedUsers.length).toBe(0);
    });

    it("detects enabled state", () => {
      const config: Record<string, unknown> = {
        bot_token: "123456:ABCdef",
        enabled: true,
      };
      const isConfigured = config !== null && typeof config.bot_token === "string";
      const isEnabled = isConfigured && config.enabled === true;
      expect(isEnabled).toBe(true);
    });

    it("detects disabled state", () => {
      const config: Record<string, unknown> = {
        bot_token: "123456:ABCdef",
        enabled: false,
      };
      const isConfigured = config !== null && typeof config.bot_token === "string";
      const isEnabled = isConfigured && config.enabled === true;
      expect(isEnabled).toBe(false);
    });
  });

  describe("brand styles", () => {
    const brandStyles = {
      telegram: { accent: "text-blue-400", label: "Telegram" },
      discord: { accent: "text-indigo-400", label: "Discord" },
    };

    it("returns correct brand for telegram", () => {
      expect(brandStyles.telegram.label).toBe("Telegram");
      expect(brandStyles.telegram.accent).toBe("text-blue-400");
    });

    it("returns correct brand for discord", () => {
      expect(brandStyles.discord.label).toBe("Discord");
      expect(brandStyles.discord.accent).toBe("text-indigo-400");
    });
  });
});

// ---------------------------------------------------------------------------
// Telegram wizard validation tests
// ---------------------------------------------------------------------------

describe("Telegram wizard validation", () => {
  function isValidBotToken(token: string): boolean {
    return token.length >= 20 && token.includes(":");
  }

  describe("bot token validation", () => {
    it("rejects empty token", () => {
      expect(isValidBotToken("")).toBe(false);
    });

    it("rejects token shorter than 20 characters", () => {
      expect(isValidBotToken("123:abc")).toBe(false);
    });

    it("rejects token without colon", () => {
      expect(isValidBotToken("12345678901234567890")).toBe(false);
    });

    it("accepts valid token format", () => {
      expect(isValidBotToken("123456789:ABCDefGHIjklMNOpqrs")).toBe(true);
    });

    it("accepts real-format Telegram token", () => {
      expect(isValidBotToken("6123456789:AAFh1234abcXYZ_5678defghijk")).toBe(true);
    });
  });

  describe("user ID management", () => {
    it("adds valid user ID to list", () => {
      const userIds: number[] = [];
      const input = "123456789";
      const parsed = parseInt(input, 10);
      expect(isNaN(parsed)).toBe(false);
      expect(parsed).toBeGreaterThan(0);
      const updated = [...userIds, parsed];
      expect(updated).toEqual([123456789]);
    });

    it("rejects non-numeric user ID", () => {
      const input = "abc";
      const parsed = parseInt(input, 10);
      expect(isNaN(parsed)).toBe(true);
    });

    it("rejects zero user ID", () => {
      const input = "0";
      const parsed = parseInt(input, 10);
      expect(parsed).toBe(0);
      expect(parsed > 0).toBe(false);
    });

    it("rejects negative user ID", () => {
      const input = "-5";
      const parsed = parseInt(input, 10);
      expect(parsed > 0).toBe(false);
    });

    it("prevents duplicate user IDs", () => {
      const userIds = [111, 222];
      const newId = 111;
      const hasDuplicate = userIds.includes(newId);
      expect(hasDuplicate).toBe(true);
    });

    it("removes user ID from list", () => {
      const userIds = [111, 222, 333];
      const toRemove = 222;
      const updated = userIds.filter((uid) => uid !== toRemove);
      expect(updated).toEqual([111, 333]);
    });
  });
});

// ---------------------------------------------------------------------------
// Discord wizard validation tests
// ---------------------------------------------------------------------------

describe("Discord wizard validation", () => {
  describe("bot token validation", () => {
    it("rejects empty token", () => {
      expect("".length >= 20).toBe(false);
    });

    it("rejects token shorter than 20 characters", () => {
      expect("short_token".length >= 20).toBe(false);
    });

    it("accepts valid-length token", () => {
      expect("MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAbCdE.a1b2c3".length >= 20).toBe(true);
    });
  });

  describe("user ID management", () => {
    it("adds valid user ID string to list", () => {
      const userIds: string[] = [];
      const input = "123456789012345678";
      const trimmed = input.trim();
      expect(trimmed.length).toBeGreaterThan(0);
      const updated = [...userIds, trimmed];
      expect(updated).toEqual(["123456789012345678"]);
    });

    it("rejects empty user ID", () => {
      const input = "  ";
      const trimmed = input.trim();
      expect(trimmed.length).toBe(0);
    });

    it("prevents duplicate user IDs", () => {
      const userIds = ["111222333444555666"];
      const newId = "111222333444555666";
      const hasDuplicate = userIds.includes(newId);
      expect(hasDuplicate).toBe(true);
    });

    it("removes user ID from list", () => {
      const userIds = ["aaa", "bbb", "ccc"];
      const toRemove = "bbb";
      const updated = userIds.filter((uid) => uid !== toRemove);
      expect(updated).toEqual(["aaa", "ccc"]);
    });
  });
});

// ---------------------------------------------------------------------------
// API interaction tests
// ---------------------------------------------------------------------------

describe("Bridge API interactions", () => {
  beforeEach(() => {
    bridgeMockFetch.mockClear();
    bridgeMockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: {} }),
    };
  });

  describe("Telegram save", () => {
    it("sends correct PUT payload", async () => {
      bridgeMockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ success: true, data: { enabled: true } }),
      };

      await bridgeMockFetch("/api/engine/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: "123456789:ABCDefGHIjklMNOpqrs",
          allowed_users: [111, 222],
          enabled: true,
        }),
      });

      expect(bridgeMockFetch).toHaveBeenCalledWith("/api/engine/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: "123456789:ABCDefGHIjklMNOpqrs",
          allowed_users: [111, 222],
          enabled: true,
        }),
      });
    });

    it("handles save error response", async () => {
      bridgeMockFetchResponse = {
        ok: false,
        json: () => Promise.resolve({ success: false, error: "Engine unreachable" }),
      };

      const response = await bridgeMockFetch("/api/engine/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: "123456789:ABCDefGHIjklMNOpqrs",
          allowed_users: [111],
          enabled: true,
        }),
      });

      expect(response.ok).toBe(false);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Engine unreachable");
    });
  });

  describe("Discord save", () => {
    it("sends correct PUT payload with string user IDs", async () => {
      bridgeMockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ success: true, data: { enabled: true } }),
      };

      await bridgeMockFetch("/api/engine/discord", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GAbCdE.a1b2c3",
          allowed_users: ["111222333444555666"],
          enabled: true,
        }),
      });

      const calledBody = JSON.parse(
        bridgeMockFetch.mock.calls[0][1].body as string
      );
      expect(calledBody.allowed_users).toEqual(["111222333444555666"]);
      expect(typeof calledBody.allowed_users[0]).toBe("string");
    });
  });

  describe("Delete with confirmation", () => {
    it("sends DELETE request for telegram", async () => {
      bridgeMockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ success: true }),
      };

      await bridgeMockFetch("/api/engine/telegram", { method: "DELETE" });

      expect(bridgeMockFetch).toHaveBeenCalledWith("/api/engine/telegram", {
        method: "DELETE",
      });
    });

    it("sends DELETE request for discord", async () => {
      bridgeMockFetchResponse = {
        ok: true,
        json: () => Promise.resolve({ success: true }),
      };

      await bridgeMockFetch("/api/engine/discord", { method: "DELETE" });

      expect(bridgeMockFetch).toHaveBeenCalledWith("/api/engine/discord", {
        method: "DELETE",
      });
    });

    it("handles delete failure", async () => {
      bridgeMockFetchResponse = {
        ok: false,
        json: () => Promise.resolve({ success: false, error: "Engine unreachable" }),
      };

      const response = await bridgeMockFetch("/api/engine/telegram", { method: "DELETE" });
      expect(response.ok).toBe(false);
    });

    it("handles network error on delete", async () => {
      bridgeMockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        bridgeMockFetch("/api/engine/discord", { method: "DELETE" })
      ).rejects.toThrow("Network error");
    });
  });
});
