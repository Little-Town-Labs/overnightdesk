import { sendOwnerAlert } from "@/lib/owner-notifications";

describe("Owner Notifications", () => {
  const originalEnv = process.env;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.OWNER_TELEGRAM_BOT_TOKEN = "test-bot-token";
    process.env.OWNER_TELEGRAM_CHAT_ID = "123456";
    global.fetch = mockFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("sendOwnerAlert()", () => {
    it("sends correct payload to Telegram API", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await sendOwnerAlert("Test alert message");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-bot-token/sendMessage",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: "123456",
            text: "Test alert message",
            parse_mode: "HTML",
          }),
        })
      );
    });

    it("returns false when OWNER_TELEGRAM_BOT_TOKEN is missing", async () => {
      delete process.env.OWNER_TELEGRAM_BOT_TOKEN;

      const result = await sendOwnerAlert("Test message");

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns false when OWNER_TELEGRAM_CHAT_ID is missing", async () => {
      delete process.env.OWNER_TELEGRAM_CHAT_ID;

      const result = await sendOwnerAlert("Test message");

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns false when Telegram API returns error without throwing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      });

      const result = await sendOwnerAlert("Test message");

      expect(result).toBe(false);
    });

    it("returns false when fetch throws without propagating error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await sendOwnerAlert("Test message");

      expect(result).toBe(false);
    });
  });
});
