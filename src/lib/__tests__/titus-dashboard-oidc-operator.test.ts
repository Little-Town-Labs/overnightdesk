import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  requireTitusDashboardOidcConfirmation,
  stageTitusDashboardOidcClientId,
  validTitusDashboardOidcClientId,
} from "@/lib/titus-dashboard-oidc-operator";

describe("Titus dashboard OIDC operator contract", () => {
  it.each([
    ["ensure", "ENSURE_TITUS_DASHBOARD_OIDC_DISABLED"],
    ["activate", "ACTIVATE_TITUS_DASHBOARD_OIDC"],
    ["disable", "DISABLE_TITUS_DASHBOARD_OIDC"],
  ] as const)("requires the exact %s confirmation", (operation, expected) => {
    expect(() =>
      requireTitusDashboardOidcConfirmation(operation, expected),
    ).not.toThrow();
    expect(() =>
      requireTitusDashboardOidcConfirmation(operation, "yes"),
    ).toThrow("Titus dashboard OIDC confirmation is required");
  });

  it("accepts only bounded URL-safe public client identifiers", () => {
    expect(validTitusDashboardOidcClientId("A".repeat(20))).toBe(true);
    expect(validTitusDashboardOidcClientId("aB_1-" + "x".repeat(20))).toBe(
      true,
    );
    expect(validTitusDashboardOidcClientId("short")).toBe(false);
    expect(validTitusDashboardOidcClientId(`${"x".repeat(20)}!`)).toBe(false);
  });

  it("stages the client in a mode-600 file without transformation", async () => {
    const directory = await mkdtemp("/tmp/titus-dashboard-oidc-");
    const output = path.join(directory, "client-id");
    const clientId = "public_client-id-" + "x".repeat(24);
    try {
      await stageTitusDashboardOidcClientId(clientId, output);
      expect(await readFile(output, "utf8")).toBe(`${clientId}\n`);
      expect((await stat(output)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
