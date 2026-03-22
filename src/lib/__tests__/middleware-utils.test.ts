import { isPublicRoute, getSignInRedirectUrl } from "../middleware-utils";

describe("isPublicRoute", () => {
  describe("public routes", () => {
    it("allows the landing page", () => {
      expect(isPublicRoute("/")).toBe(true);
    });

    it("allows sign-in page", () => {
      expect(isPublicRoute("/sign-in")).toBe(true);
    });

    it("allows sign-up page", () => {
      expect(isPublicRoute("/sign-up")).toBe(true);
    });

    it("allows verify-email page", () => {
      expect(isPublicRoute("/verify-email")).toBe(true);
    });

    it("allows reset-password page", () => {
      expect(isPublicRoute("/reset-password")).toBe(true);
    });

    it("allows Better Auth API routes", () => {
      expect(isPublicRoute("/api/auth/sign-in/email")).toBe(true);
      expect(isPublicRoute("/api/auth/sign-up/email")).toBe(true);
      expect(isPublicRoute("/api/auth/get-session")).toBe(true);
    });

    it("allows waitlist API route", () => {
      expect(isPublicRoute("/api/waitlist")).toBe(true);
    });

    it("allows Stripe webhook route", () => {
      expect(isPublicRoute("/api/stripe/webhook")).toBe(true);
    });

    it("allows cron routes", () => {
      expect(isPublicRoute("/api/cron/health-check")).toBe(true);
      expect(isPublicRoute("/api/cron/usage-collection")).toBe(true);
    });

    it("allows provisioner callback route", () => {
      expect(isPublicRoute("/api/provisioner/callback")).toBe(true);
    });

    it("allows email unsubscribe route", () => {
      expect(isPublicRoute("/api/email/unsubscribe")).toBe(true);
    });

    it("allows static assets", () => {
      expect(isPublicRoute("/_next/static/chunk.js")).toBe(true);
      expect(isPublicRoute("/favicon.ico")).toBe(true);
      expect(isPublicRoute("/logo.svg")).toBe(true);
    });
  });

  describe("protected routes", () => {
    it("blocks dashboard", () => {
      expect(isPublicRoute("/dashboard")).toBe(false);
    });

    it("blocks settings", () => {
      expect(isPublicRoute("/settings")).toBe(false);
    });

    it("blocks billing", () => {
      expect(isPublicRoute("/billing")).toBe(false);
    });

    it("blocks instance management", () => {
      expect(isPublicRoute("/instance")).toBe(false);
    });

    it("blocks unknown routes", () => {
      expect(isPublicRoute("/admin")).toBe(false);
    });

    it("blocks Stripe checkout (session-protected)", () => {
      expect(isPublicRoute("/api/stripe/checkout")).toBe(false);
    });

    it("blocks Stripe portal (session-protected)", () => {
      expect(isPublicRoute("/api/stripe/portal")).toBe(false);
    });

    it("blocks engine API routes", () => {
      expect(isPublicRoute("/api/engine/jobs")).toBe(false);
      expect(isPublicRoute("/api/engine/status")).toBe(false);
    });

    it("blocks admin API routes", () => {
      expect(isPublicRoute("/api/admin/metrics")).toBe(false);
      expect(isPublicRoute("/api/admin/fleet/health")).toBe(false);
    });

    it("blocks account API routes", () => {
      expect(isPublicRoute("/api/account/delete")).toBe(false);
    });
  });
});

describe("getSignInRedirectUrl", () => {
  const baseUrl = "https://overnightdesk.com";

  it("redirects to /sign-in for root path", () => {
    const url = getSignInRedirectUrl(baseUrl, "/");
    expect(url).toBe("https://overnightdesk.com/sign-in");
  });

  it("includes callbackUrl for non-root paths", () => {
    const url = getSignInRedirectUrl(baseUrl, "/dashboard");
    expect(url).toBe(
      "https://overnightdesk.com/sign-in?callbackUrl=%2Fdashboard"
    );
  });

  it("preserves deep paths in callbackUrl", () => {
    const url = getSignInRedirectUrl(baseUrl, "/settings/billing");
    expect(url).toBe(
      "https://overnightdesk.com/sign-in?callbackUrl=%2Fsettings%2Fbilling"
    );
  });
});
