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
  "src/app/api/provisioner/callback/route.ts",
  "src/app/api/provisioner/__tests__/callback.test.ts",
  "src/app/api/instance/status/route.ts",
  "src/app/api/instance/auth-status/route.ts",
  "src/app/api/instance/terminal-ticket/route.ts",
];

const RETIRED_ROUTES = [
  "/api/provisioner/callback",
  "/api/instance/status",
  "/api/instance/auth-status",
  "/api/instance/terminal-ticket",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return sourceFiles(entryPath);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return [];

    return [entryPath];
  });
}

describe("provisioner callback and instance-control route retirement", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
  });

  it.each(RETIRED_FILES)("removes %s", (relativePath) => {
    expect(existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });

  it("leaves no executable source caller for the retired routes", () => {
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
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8");
        return RETIRED_ROUTES.some((route) => source.includes(route));
      });

    expect(matches).toEqual([]);
  });

  it.each(
    RETIRED_ROUTES.flatMap((pathname) =>
      ["GET", "POST", "OPTIONS"].map((method) => [method, pathname]),
    ),
  )(
    "returns an empty 404 before authentication for %s %s",
    async (method, pathname) => {
      const response = await middleware(
        new NextRequest(`https://overnightdesk.com${pathname}`, { method }),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("");
      expect(mockGetSession).not.toHaveBeenCalled();
    },
  );
});
