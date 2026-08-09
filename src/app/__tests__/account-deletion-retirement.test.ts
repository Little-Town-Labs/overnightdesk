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

import middleware from "../../../middleware";

describe("self-service account deletion retirement", () => {
  it.each([
    "src/app/(protected)/dashboard/settings/delete-account.tsx",
    "src/app/api/account/delete/route.ts",
    "src/app/api/account/__tests__/delete.test.ts",
  ])("removes %s", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it("removes the deletion control from account settings", () => {
    const source = [
      "src/app/(protected)/dashboard/settings/page.tsx",
      "src/app/(protected)/dashboard/settings/settings-surface.tsx",
    ]
      .map((relativePath) =>
        readFileSync(path.join(process.cwd(), relativePath), "utf8"),
      )
      .join("\n");

    expect(source).not.toMatch(/DeleteAccount|dangerZone|\/api\/account\/delete/);
  });

  it("returns an empty 404 before authentication or deletion work", async () => {
    const response = await middleware(
      new NextRequest("https://overnightdesk.com/api/account/delete", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
