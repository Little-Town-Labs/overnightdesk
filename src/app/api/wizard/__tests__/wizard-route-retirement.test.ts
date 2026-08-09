import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const RETIRED_FILES = [
  "src/app/api/wizard/write-step/route.ts",
  "src/app/api/wizard/complete/route.ts",
  "src/app/api/wizard/__tests__/wizard-routes.test.ts",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return sourceFiles(entryPath);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return [];

    return [entryPath];
  });
}

describe("wizard mutation route retirement", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
  });

  it.each(RETIRED_FILES)("removes %s", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it("leaves no active source caller for either retired route", () => {
    const retiredRouteRegistry = path.join(
      process.cwd(),
      "src/lib/middleware-utils.ts",
    );
    const matches = sourceFiles(path.join(process.cwd(), "src"))
      .filter(
        (filePath) =>
          !filePath.includes(`${path.sep}__tests__${path.sep}`) &&
          filePath !== retiredRouteRegistry,
      )
      .filter((filePath) =>
        /\/api\/wizard\/(?:write-step|complete)/.test(
          readFileSync(filePath, "utf8"),
        ),
      );

    expect(matches).toEqual([]);
  });

  it.each([
    ["POST", "/api/wizard/write-step"],
    ["OPTIONS", "/api/wizard/write-step"],
    ["POST", "/api/wizard/complete"],
    ["OPTIONS", "/api/wizard/complete"],
  ])("returns an empty 404 before authentication for %s %s", async (method, pathname) => {
    const response = await middleware(
      new NextRequest(`https://overnightdesk.com${pathname}`, { method }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
