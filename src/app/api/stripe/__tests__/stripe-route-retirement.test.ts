import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

import middleware from "../../../../../middleware";

describe("Stripe route retirement", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
  });

  it.each([
    "src/app/api/stripe/checkout/route.ts",
    "src/app/api/stripe/portal/route.ts",
    "src/app/api/stripe/webhook/route.ts",
  ])("leaves %s absent", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it.each([
    ["POST", "/api/stripe/checkout"],
    ["POST", "/api/stripe/portal"],
    ["POST", "/api/stripe/webhook"],
    ["OPTIONS", "/api/stripe/webhook"],
  ])("returns an empty 404 before authentication for %s %s", async (method, pathname) => {
    const response = await middleware(
      new NextRequest(`https://overnightdesk.com${pathname}`, { method }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("removes the Stripe client after all source callers are retired", () => {
    expect(existsSync(path.join(process.cwd(), "src/lib/stripe.ts"))).toBe(false);
    expect(
      existsSync(
        path.join(
          process.cwd(),
          "src/app/(protected)/dashboard/manage-billing-button.tsx",
        ),
      ),
    ).toBe(false);
  });

  it.each([
    "src/lib/stripe-webhook-handlers.ts",
    "src/lib/__tests__/stripe-webhook.test.ts",
    "src/lib/emails/payment-failure-email.tsx",
  ])("removes retired webhook and payment-failure source %s", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it("preserves unrelated email delivery without payment-failure behavior", () => {
    const emailSource = readFileSync(
      path.join(process.cwd(), "src/lib/email.ts"),
      "utf8",
    );

    expect(emailSource).toMatch(/sendPasswordResetEmail/);
    expect(emailSource).toMatch(/sendProvisioningEmail/);
    expect(emailSource).not.toMatch(/PaymentFailureEmail|sendPaymentFailureEmail/);
  });
});
