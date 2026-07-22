import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/dashboard/admin/fleet";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { resolveAdminPageAccess } from "@/lib/admin-page-authorization";
import { AdminNav } from "../admin-nav";

describe("Admin authorization", () => {
  it("distinguishes unauthenticated, forbidden, and allowed sessions", () => {
    expect(resolveAdminPageAccess(null, () => false)).toBe("unauthenticated");
    expect(
      resolveAdminPageAccess(
        { user: { email: "member@example.test" } },
        () => false,
      ),
    ).toBe("forbidden");
    expect(
      resolveAdminPageAccess(
        { user: { email: "owner@example.test" } },
        () => true,
      ),
    ).toBe("allowed");
  });
});

describe("AdminNav", () => {
  it("keeps Fleet, Metrics, and Configuration in one internal navigation", () => {
    const markup = renderToStaticMarkup(<AdminNav />);

    expect(markup).toContain('aria-label="Admin sections"');
    expect(markup).toContain('href="/dashboard/admin/fleet"');
    expect(markup).toContain('href="/dashboard/admin/metrics"');
    expect(markup).toContain('href="/dashboard/admin/configuration"');
    expect(markup).toContain("Fleet");
    expect(markup).toContain("Metrics");
    expect(markup).toContain("Configuration");
    expect(markup).toContain('aria-current="page"');
  });

  it("marks the current nested route without changing the nav contract", () => {
    pathname = "/dashboard/admin/configuration";
    const markup = renderToStaticMarkup(<AdminNav />);

    expect(markup).toMatch(
      /aria-current="page"[^>]*href="\/dashboard\/admin\/configuration"/,
    );
  });
});
