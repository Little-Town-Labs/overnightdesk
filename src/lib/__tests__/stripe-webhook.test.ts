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
  instance: { userId: "userId", status: "status", id: "id" },
}));

// Mock provisioner
const mockProvision = jest.fn().mockResolvedValue({ success: true });
const mockDeprovision = jest.fn().mockResolvedValue({ success: true });
jest.mock("@/lib/provisioner", () => ({
  provisionerClient: {
    provision: (...args: unknown[]) => mockProvision(...args),
    deprovision: (...args: unknown[]) => mockDeprovision(...args),
  },
}));

// Mock createInstance
const mockCreateInstance = jest.fn();
jest.mock("@/lib/instance", () => ({
  createInstance: (...args: unknown[]) => mockCreateInstance(...args),
}));

const mockDisableHermesOidcClient = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/hermes-oidc", () => ({
  disableHermesOidcClient: (...args: unknown[]) =>
    mockDisableHermesOidcClient(...args),
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

    beforeEach(() => {
      mockCreateInstance.mockResolvedValue({
        instance: {
          tenantId: "a1b2c3",
          subdomain: "a1b2c3.overnightdesk.com",
          status: "queued",
        },
        plaintextToken: "tok_abc",
      });
    });

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

    it("does NOT call provisioner — wizard must complete first", async () => {
      await handleCheckoutCompleted(session, "price_starter");

      // Wait for any async work to settle
      await new Promise((r) => setTimeout(r, 0));

      expect(mockProvision).not.toHaveBeenCalled();
    });

    it("never calls provisioner regardless of instance status", async () => {
      for (const status of ["queued", "running", "provisioning", "awaiting_provisioning"]) {
        mockCreateInstance.mockResolvedValue({
          instance: { tenantId: "a1b2c3", subdomain: "a1b2c3.overnightdesk.com", status },
          plaintextToken: null,
        });
        mockProvision.mockClear();

        await handleCheckoutCompleted(session, "price_starter");
        await new Promise((r) => setTimeout(r, 0));

        expect(mockProvision).not.toHaveBeenCalled();
      }
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
        .mockResolvedValueOnce([]) // instance lookup
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
        .mockResolvedValueOnce([])
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

    it("disables dashboard OIDC when a subscription is suspended", async () => {
      mockSelectFromWhere
        .mockResolvedValueOnce([{
          id: "sub_1",
          userId: "user_123",
          stripeSubscriptionId: "sub_xyz",
        }])
        .mockResolvedValueOnce([{
          id: "instance-1",
          userId: "user_123",
          status: "running",
          subdomain: "tenant-a.overnightdesk.com",
          hermesOidcClientId: "public-client-id",
        }]);

      await handleSubscriptionUpdated("sub_xyz", "past_due", "price_pro", 1719792000);

      expect(mockDisableHermesOidcClient).toHaveBeenCalledWith({
        instanceId: "instance-1",
        ownerId: "user_123",
        subdomain: "tenant-a.overnightdesk.com",
      });
    });

    it("disables dashboard OIDC for a stopped linked instance", async () => {
      mockSelectFromWhere
        .mockResolvedValueOnce([{
          id: "sub_1",
          userId: "user_123",
          stripeSubscriptionId: "sub_xyz",
        }])
        .mockResolvedValueOnce([{
          id: "instance-1",
          userId: "user_123",
          status: "stopped",
          subdomain: "tenant-a.overnightdesk.com",
          hermesOidcClientId: "public-client-id",
        }]);

      await handleSubscriptionUpdated("sub_xyz", "past_due", "price_pro", 1719792000);

      expect(mockDisableHermesOidcClient).toHaveBeenCalledWith({
        instanceId: "instance-1",
        ownerId: "user_123",
        subdomain: "tenant-a.overnightdesk.com",
      });
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

    it("disables dashboard OIDC before deprovisioning", async () => {
      mockSelectFromWhere
        .mockResolvedValueOnce([{
          id: "sub_1",
          userId: "user_123",
          stripeSubscriptionId: "sub_xyz",
        }])
        .mockResolvedValueOnce([{
          id: "instance-1",
          userId: "user_123",
          tenantId: "tenant-a",
          subdomain: "tenant-a.overnightdesk.com",
          status: "running",
          hermesOidcClientId: "public-client-id",
        }]);

      await handleSubscriptionDeleted("sub_xyz");

      expect(mockDisableHermesOidcClient).toHaveBeenCalledWith({
        instanceId: "instance-1",
        ownerId: "user_123",
        subdomain: "tenant-a.overnightdesk.com",
      });
      expect(mockDisableHermesOidcClient.mock.invocationCallOrder[0]).toBeLessThan(
        mockDeprovision.mock.invocationCallOrder[0]
      );
    });
  });
});
