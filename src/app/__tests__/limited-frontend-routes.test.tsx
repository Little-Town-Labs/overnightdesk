import { existsSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage from "@/app/page";

const mockGetSession = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

import middleware from "../../../middleware";

describe("limited internal frontend routes", () => {
  it("presents only sign-in and dashboard entry points at the root", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
    const normalizedMarkup = markup.toLowerCase();
    const actionableHrefs = Array.from(
      markup.matchAll(/<a[^>]*href="([^"]+)"/g),
      (match) => match[1],
    ).sort();

    expect(actionableHrefs).toEqual(["/dashboard", "/sign-in"]);
    expect(markup).not.toContain("<form");
    expect(normalizedMarkup).not.toMatch(
      /sign up|early access|waitlist|pick a plan|setup wizard|after payment/,
    );
  });

  it.each([
    "src/app/(auth)/sign-up/page.tsx",
    "src/app/(auth)/verify-email/page.tsx",
    "src/app/api/waitlist/route.ts",
    "src/app/pricing/page.tsx",
    "src/app/checkout/success/page.tsx",
  ])("leaves %s absent so Next returns 404", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it.each([
    ["anonymous", null],
    ["authenticated", { user: { id: "owner", email: "owner@example.com" } }],
  ])(
    "returns an empty 404 without redirecting retired pages for an %s request",
    async (_principal, session) => {
      mockGetSession.mockResolvedValue(session);

      for (const hostname of ["overnightdesk.com", "www.overnightdesk.com"]) {
        for (const pathname of [
          "/sign-up",
          "/sign-up/",
          "/verify-email",
          "/api/waitlist",
          "/api/waitlist/",
          "/pricing",
          "/checkout/success",
        ]) {
          const response = await middleware(
            new NextRequest(`https://${hostname}${pathname}`),
          );

          expect(response.status).toBe(404);
          expect(response.headers.get("location")).toBeNull();
          expect(await response.text()).toBe("");
        }
      }
    },
  );
});
