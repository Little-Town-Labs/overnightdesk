import {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  mapPriceIdToPlan,
} from "@/lib/stripe-webhook-handlers";

// Mock database
const mockInsertValues = jest.fn().mockResolvedValue(undefined);
const mockUpdateSetWhere = jest.fn().mockResolvedValue(undefined);
const mockSelectFromWhere = jest.fn().mockResolvedValue([]);

jest.mock("@/db", () => ({
  db: {
    insert: jest.fn(() => ({ values: mockInsertValues })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: mockUpdateSetWhere })),
    })),
    select: jest.fn(() => ({
      from: jest.fn(() => ({ where: mockSelectFromWhere })),
    })),
  },
}));

jest.mock("@/db/schema", () => ({
  subscription: {
    stripeSubscriptionId: "stripeSubscriptionId",
    userId: "userId",
  },
  platformAuditLog: {},
  user: { id: "id", email: "email", name: "name" },
}));

// Mock email service
const mockSendPaymentFailureEmail = jest.fn().mockResolvedValue({ success: true });
jest.mock("@/lib/email", () => ({
  sendPaymentFailureEmail: (...args: unknown[]) => mockSendPaymentFailureEmail(...args),
}));

// Mock stripe for portal URL generation
jest.mock("@/lib/stripe", () => ({
  stripe: {
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: "https://billing.stripe.com/portal" }),
      },
    },
  },
}));

const { db } = jest.requireMock("@/db");

describe("Stripe Webhook Handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("mapPriceIdToPlan()", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('maps starter price ID to "starter"', () => {
      process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
      process.env.STRIPE_PRO_PRICE_ID = "price_pro";
      expect(mapPriceIdToPlan("price_starter")).toBe("starter");
    });

    it('maps pro price ID to "pro"', () => {
      process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
      process.env.STRIPE_PRO_PRICE_ID = "price_pro";
      expect(mapPriceIdToPlan("price_pro")).toBe("pro");
    });

    it('defaults to "starter" for unknown price ID', () => {
      process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
      process.env.STRIPE_PRO_PRICE_ID = "price_pro";
      expect(mapPriceIdToPlan("price_unknown")).toBe("starter");
    });
  });

  describe("handleCheckoutCompleted()", () => {
    const session = {
      client_reference_id: "user_123",
      customer: "cus_abc",
      subscription: "sub_xyz",
    };

    it("creates a subscription record", async () => {
      await handleCheckoutCompleted(session, "price_starter");

      expect(db.insert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user_123",
          stripeCustomerId: "cus_abc",
          stripeSubscriptionId: "sub_xyz",
          status: "active",
        })
      );
    });

    it("logs to audit log", async () => {
      await handleCheckoutCompleted(session, "price_starter");

      // insert called twice: subscription + audit log
      expect(db.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleInvoicePaid()", () => {
    it("updates subscription status to active", async () => {
      const existingSub = {
        id: "sub_1",
        userId: "user_123",
        stripeSubscriptionId: "sub_xyz",
      };
      mockSelectFromWhere.mockResolvedValueOnce([existingSub]);

      await handleInvoicePaid("sub_xyz", 1719792000);

      expect(db.update).toHaveBeenCalled();
    });

    it("skips update if subscription not found", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([]);

      await handleInvoicePaid("sub_nonexistent", 1719792000);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe("handleInvoicePaymentFailed()", () => {
    it("updates subscription status to past_due", async () => {
      const existingSub = {
        id: "sub_1",
        userId: "user_123",
        stripeCustomerId: "cus_abc",
        stripeSubscriptionId: "sub_xyz",
      };
      mockSelectFromWhere
        .mockResolvedValueOnce([existingSub])  // subscription lookup
        .mockResolvedValueOnce([{ id: "user_123", email: "user@test.com", name: "Test User" }]); // user lookup

      await handleInvoicePaymentFailed("sub_xyz", 4999);

      expect(db.update).toHaveBeenCalled();
    });

    it("sends payment failure email", async () => {
      const existingSub = {
        id: "sub_1",
        userId: "user_123",
        stripeCustomerId: "cus_abc",
        stripeSubscriptionId: "sub_xyz",
      };
      mockSelectFromWhere
        .mockResolvedValueOnce([existingSub])
        .mockResolvedValueOnce([{ id: "user_123", email: "user@test.com", name: "Test User" }]);

      await handleInvoicePaymentFailed("sub_xyz", 4999);

      expect(mockSendPaymentFailureEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            email: "user@test.com",
            name: "Test User",
          }),
          amount: "$49.99",
        })
      );
    });

    it("skips if subscription not found", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([]);

      await handleInvoicePaymentFailed("sub_nonexistent", 4999);

      expect(db.update).not.toHaveBeenCalled();
      expect(mockSendPaymentFailureEmail).not.toHaveBeenCalled();
    });
  });

  describe("handleSubscriptionUpdated()", () => {
    it("updates subscription fields", async () => {
      const existingSub = {
        id: "sub_1",
        userId: "user_123",
        stripeSubscriptionId: "sub_xyz",
      };
      mockSelectFromWhere.mockResolvedValueOnce([existingSub]);

      await handleSubscriptionUpdated("sub_xyz", "active", "price_pro", 1719792000);

      expect(db.update).toHaveBeenCalled();
    });

    it("skips if subscription not found", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([]);

      await handleSubscriptionUpdated("sub_nonexistent", "active", "price_pro", 1719792000);

      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe("handleSubscriptionDeleted()", () => {
    it("updates subscription status to canceled", async () => {
      const existingSub = {
        id: "sub_1",
        userId: "user_123",
        stripeSubscriptionId: "sub_xyz",
      };
      mockSelectFromWhere.mockResolvedValueOnce([existingSub]);

      await handleSubscriptionDeleted("sub_xyz");

      expect(db.update).toHaveBeenCalled();
    });

    it("logs to audit log", async () => {
      const existingSub = {
        id: "sub_1",
        userId: "user_123",
        stripeSubscriptionId: "sub_xyz",
      };
      mockSelectFromWhere.mockResolvedValueOnce([existingSub]);

      await handleSubscriptionDeleted("sub_xyz");

      // update + insert audit log
      expect(db.insert).toHaveBeenCalled();
    });

    it("skips if subscription not found", async () => {
      mockSelectFromWhere.mockResolvedValueOnce([]);

      await handleSubscriptionDeleted("sub_nonexistent");

      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
