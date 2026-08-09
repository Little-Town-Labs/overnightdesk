import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const source = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("subscription-independent security authorization", () => {
  it("keeps the protected layout session-only", () => {
    const layout = source("src/app/(protected)/layout.tsx");

    expect(layout).toMatch(/auth\.api\.getSession/);
    expect(layout).toMatch(/redirect\("\/sign-in"\)/);
    expect(layout).not.toMatch(/billing|subscription|plan|\/pricing/i);
  });

  it("removes the obsolete Pro-or-admin authorization helper", () => {
    expect(
      existsSync(path.join(process.cwd(), "src/lib/require-pro-or-admin.ts")),
    ).toBe(false);
  });

  it.each([
    "src/app/api/engine/security/queue/route.ts",
    "src/app/api/engine/security/queue/[id]/route.ts",
    "src/app/api/engine/security/queue/[id]/resolve/route.ts",
    "src/app/api/engine/security/status/route.ts",
  ])("uses the existing admin rule without subscription authority in %s", (route) => {
    const routeSource = source(route);

    expect(routeSource).toMatch(
      /import \{ requireAdmin \} from "@\/lib\/require-admin"/,
    );
    expect(routeSource).toMatch(/await requireAdmin\(\)/);
    expect(routeSource).not.toMatch(/requireProOrAdmin|subscription|plan|pricing/i);
  });
});
