import {
  isBillingEnabled,
  isAdmin,
  requireSubscription,
  getSubscriptionForUser,
} from "@/lib/billing";

// Mock the database module
jest.mock("@/db", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  },
}));

jest.mock("@/db/schema", () => ({
  subscription: { userId: "userId", status: "status" },
}));

const { db } = jest.requireMock("@/db");

describe("Billing Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isBillingEnabled()", () => {
    it('returns true when NEXT_PUBLIC_BILLING_ENABLED is "true"', () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
      expect(isBillingEnabled()).toBe(true);
    });

    it('returns false when NEXT_PUBLIC_BILLING_ENABLED is "false"', () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "false";
      expect(isBillingEnabled()).toBe(false);
    });

    it("returns false when NEXT_PUBLIC_BILLING_ENABLED is undefined", () => {
      delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
      expect(isBillingEnabled()).toBe(false);
    });

    it("returns false when NEXT_PUBLIC_BILLING_ENABLED is empty", () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "";
      expect(isBillingEnabled()).toBe(false);
    });
  });

  describe("isAdmin()", () => {
    it("returns true when email is in ADMIN_EMAILS", () => {
      process.env.ADMIN_EMAILS = "gary@example.com,friend@example.com";
      expect(isAdmin("gary@example.com")).toBe(true);
    });

    it("returns true for second email in list", () => {
      process.env.ADMIN_EMAILS = "gary@example.com,friend@example.com";
      expect(isAdmin("friend@example.com")).toBe(true);
    });

    it("returns false when email is not in ADMIN_EMAILS", () => {
      process.env.ADMIN_EMAILS = "gary@example.com";
      expect(isAdmin("stranger@example.com")).toBe(false);
    });

    it("handles case-insensitive comparison", () => {
      process.env.ADMIN_EMAILS = "Gary@Example.com";
      expect(isAdmin("gary@example.com")).toBe(true);
    });

    it("returns false when ADMIN_EMAILS is undefined", () => {
      delete process.env.ADMIN_EMAILS;
      expect(isAdmin("gary@example.com")).toBe(false);
    });

    it("returns false when ADMIN_EMAILS is empty", () => {
      process.env.ADMIN_EMAILS = "";
      expect(isAdmin("gary@example.com")).toBe(false);
    });

    it("handles whitespace around emails in comma-separated list", () => {
      process.env.ADMIN_EMAILS = " gary@example.com , friend@example.com ";
      expect(isAdmin("gary@example.com")).toBe(true);
      expect(isAdmin("friend@example.com")).toBe(true);
    });
  });

  describe("requireSubscription()", () => {
    it("returns allowed when billing is disabled", async () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "false";
      const result = await requireSubscription("user_123", "user@example.com");
      expect(result).toEqual({ allowed: true, reason: "billing_disabled" });
    });

    it("returns allowed for admin email even when billing is enabled", async () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
      process.env.ADMIN_EMAILS = "gary@example.com";
      const result = await requireSubscription("user_123", "gary@example.com");
      expect(result).toEqual({ allowed: true, reason: "admin" });
    });

    it("returns allowed for active subscription", async () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
      process.env.ADMIN_EMAILS = "";
      const mockSub = {
        id: "sub_1",
        status: "active",
        plan: "pro",
        userId: "user_123",
      };
      db.where.mockResolvedValueOnce([mockSub]);

      const result = await requireSubscription("user_123", "user@example.com");
      expect(result.allowed).toBe(true);
      expect(result.subscription).toEqual(mockSub);
    });

    it("returns allowed for past_due subscription (grace period)", async () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
      process.env.ADMIN_EMAILS = "";
      const mockSub = {
        id: "sub_1",
        status: "past_due",
        plan: "starter",
        userId: "user_123",
      };
      db.where.mockResolvedValueOnce([mockSub]);

      const result = await requireSubscription("user_123", "user@example.com");
      expect(result.allowed).toBe(true);
      expect(result.subscription).toEqual(mockSub);
    });

    it("returns not allowed when no subscription exists", async () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
      process.env.ADMIN_EMAILS = "";
      db.where.mockResolvedValueOnce([]);

      const result = await requireSubscription("user_123", "user@example.com");
      expect(result).toEqual({ allowed: false, reason: "no_subscription" });
    });

    it("returns not allowed for canceled subscription", async () => {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
      process.env.ADMIN_EMAILS = "";
      // No active or past_due subscriptions returned by the query
      db.where.mockResolvedValueOnce([]);

      const result = await requireSubscription("user_123", "user@example.com");
      expect(result).toEqual({ allowed: false, reason: "no_subscription" });
    });
  });

  describe("getSubscriptionForUser()", () => {
    it("returns subscription when one exists", async () => {
      const mockSub = {
        id: "sub_1",
        userId: "user_123",
        plan: "pro",
        status: "active",
      };
      db.where.mockResolvedValueOnce([mockSub]);

      const result = await getSubscriptionForUser("user_123");
      expect(result).toEqual(mockSub);
    });

    it("returns null when no subscription exists", async () => {
      db.where.mockResolvedValueOnce([]);

      const result = await getSubscriptionForUser("user_123");
      expect(result).toBeNull();
    });
  });
});
