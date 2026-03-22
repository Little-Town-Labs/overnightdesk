import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  getUnsubscribeUrl,
} from "@/lib/unsubscribe";

describe("Unsubscribe", () => {
  describe("generateUnsubscribeToken()", () => {
    it("generates a non-empty token", () => {
      const token = generateUnsubscribeToken("user_123");
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
    });

    it("generates different tokens for different users", () => {
      const token1 = generateUnsubscribeToken("user_1");
      const token2 = generateUnsubscribeToken("user_2");
      expect(token1).not.toBe(token2);
    });

    it("generates consistent tokens for the same user", () => {
      const token1 = generateUnsubscribeToken("user_1");
      const token2 = generateUnsubscribeToken("user_1");
      expect(token1).toBe(token2);
    });
  });

  describe("verifyUnsubscribeToken()", () => {
    it("verifies a valid token and returns userId", () => {
      const token = generateUnsubscribeToken("user_123");
      const result = verifyUnsubscribeToken(token);
      expect(result).toEqual({ valid: true, userId: "user_123" });
    });

    it("rejects an invalid token", () => {
      const result = verifyUnsubscribeToken("invalid-token");
      expect(result).toEqual({ valid: false });
    });

    it("rejects a tampered token", () => {
      const token = generateUnsubscribeToken("user_123");
      const tampered = token.slice(0, -3) + "xyz";
      const result = verifyUnsubscribeToken(tampered);
      expect(result).toEqual({ valid: false });
    });

    it("rejects an empty token", () => {
      const result = verifyUnsubscribeToken("");
      expect(result).toEqual({ valid: false });
    });
  });

  describe("getUnsubscribeUrl()", () => {
    it("returns a URL with the token", () => {
      const url = getUnsubscribeUrl("user_123");
      expect(url).toContain("/api/email/unsubscribe?token=");
      expect(url).toContain("overnightdesk.com");
    });

    it("generates a URL whose token is valid", () => {
      const url = getUnsubscribeUrl("user_456");
      const token = new URL(url).searchParams.get("token")!;
      const result = verifyUnsubscribeToken(token);
      expect(result).toEqual({ valid: true, userId: "user_456" });
    });
  });
});
