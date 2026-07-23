import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

function routeDirectories(root: string, current = root): string[][] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) return routeDirectories(root, path);
    if (entry.isFile() && entry.name === "route.ts") {
      return [relative(root, current).split(sep)];
    }
    return [];
  });
}

function dynamicName(segment: string): string | null {
  const match = segment.match(/^\[(?:\.\.\.)?([^\]]+)\]$/);
  return match?.[1] ?? null;
}

describe("agent identity API route segments", () => {
  it("uses one dynamic slug name for every equivalent Next.js path", () => {
    const root = resolve(process.cwd(), "src/app/api/agent-identity");
    const namesByPath = new Map<string, Set<string>>();

    for (const segments of routeDirectories(root)) {
      segments.forEach((segment, index) => {
        const name = dynamicName(segment);
        if (!name) return;
        const normalizedPath = segments
          .slice(0, index + 1)
          .map((value) => (dynamicName(value) ? "[]" : value))
          .join("/");
        const names = namesByPath.get(normalizedPath) ?? new Set<string>();
        names.add(name);
        namesByPath.set(normalizedPath, names);
      });
    }

    expect(
      [...namesByPath.entries()].filter(([, names]) => names.size > 1),
    ).toEqual([]);
  });
});
