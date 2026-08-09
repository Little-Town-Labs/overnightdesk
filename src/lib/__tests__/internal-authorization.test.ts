import { isInternalAdmin } from "@/lib/internal-authorization";

describe("internal authorization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ADMIN_EMAILS;
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
    delete process.env.SUBSCRIPTION_STATUS;
    delete process.env.SUBSCRIPTION_PLAN;
    delete process.env.STRIPE_CUSTOMER_ID;
    delete process.env.PAYMENT_STATUS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("normalizes configured and presented email addresses", () => {
    process.env.ADMIN_EMAILS =
      " Owner@Example.com, second@example.com ,, ";

    expect(isInternalAdmin("owner@example.com")).toBe(true);
    expect(isInternalAdmin(" SECOND@EXAMPLE.COM ")).toBe(true);
  });

  it("fails closed when ADMIN_EMAILS is absent or blank", () => {
    expect(isInternalAdmin("owner@example.com")).toBe(false);

    process.env.ADMIN_EMAILS = " ,  , ";
    expect(isInternalAdmin("owner@example.com")).toBe(false);
  });

  it("does not grant access from subscription, plan, Stripe customer, or payment state", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    process.env.SUBSCRIPTION_STATUS = "active";
    process.env.SUBSCRIPTION_PLAN = "pro";
    process.env.STRIPE_CUSTOMER_ID = "cus_authority_must_not_depend_on_this";
    process.env.PAYMENT_STATUS = "paid";

    expect(isInternalAdmin("paid-user@example.com")).toBe(false);
  });

  it("retains configured admin access regardless of legacy payment state", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "false";
    process.env.SUBSCRIPTION_STATUS = "canceled";
    process.env.SUBSCRIPTION_PLAN = "starter";
    process.env.STRIPE_CUSTOMER_ID = "";
    process.env.PAYMENT_STATUS = "failed";

    expect(isInternalAdmin("owner@example.com")).toBe(true);
  });
});
