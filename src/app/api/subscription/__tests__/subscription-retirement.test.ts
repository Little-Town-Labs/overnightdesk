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

describe("subscription authority retirement", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
  });

  it.each([
    "src/app/api/subscription/route.ts",
    "src/lib/billing.ts",
    "src/lib/__tests__/billing.test.ts",
  ])("removes %s", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it.each(["GET", "POST", "OPTIONS"])(
    "returns an empty 404 before authentication for %s /api/subscription",
    async (method) => {
      const response = await middleware(
        new NextRequest("https://overnightdesk.com/api/subscription", {
          method,
        }),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("");
      expect(mockGetSession).not.toHaveBeenCalled();
    },
  );

  it("uses current internal admin authorization without the billing module", () => {
    const source = [
      "src/lib/admin-page-authorization.ts",
      "src/app/api/admin/hermes/dashboard-auth/route.ts",
      "src/lib/require-admin.ts",
    ]
      .map((relativePath) =>
        readFileSync(path.join(process.cwd(), relativePath), "utf8"),
      )
      .join("\n");

    expect(source).toMatch(/isInternalAdmin/);
    expect(source).not.toMatch(/@\/lib\/billing|isAdmin\b/);
  });

  it("preserves operational admin metrics without subscription-derived data", () => {
    const source = [
      "src/lib/admin-metrics.ts",
      "src/app/(protected)/dashboard/admin/metrics/page.tsx",
      "src/app/(protected)/dashboard/admin/metrics/metrics-cards.tsx",
    ]
      .map((relativePath) =>
        readFileSync(path.join(process.cwd(), relativePath), "utf8"),
      )
      .join("\n");

    expect(source).toMatch(/runningInstances/);
    expect(source).toMatch(/avgDailyClaudeCalls/);
    expect(source).toMatch(/atRiskTenants/);
    expect(source).not.toMatch(/activeSubscribers|Active Subscribers/);
    expect(source).not.toMatch(/\bsubscription\b/);
  });
});
