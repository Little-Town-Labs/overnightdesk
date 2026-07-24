import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("Walter native dashboard binding repair contract", () => {
  it("exposes guarded plan, apply, and verify commands", () => {
    const packageJson = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "identity:walter:dashboard-bindings:plan":
        "tsx scripts/dashboard-identity-binding-reconciliation.ts walter plan",
      "identity:walter:dashboard-bindings:apply":
        "tsx scripts/dashboard-identity-binding-reconciliation.ts walter apply",
      "identity:walter:dashboard-bindings:verify":
        "tsx scripts/dashboard-identity-binding-reconciliation.ts walter verify",
      "identity:walter:dashboard-oidc-binding:plan":
        "tsx scripts/walter-dashboard-oidc-binding-reconciliation.ts plan",
      "identity:walter:dashboard-oidc-binding:apply":
        "tsx scripts/walter-dashboard-oidc-binding-reconciliation.ts apply",
      "identity:walter:dashboard-oidc-binding:verify":
        "tsx scripts/walter-dashboard-oidc-binding-reconciliation.ts verify",
    });
  });

  it("uses the shared OIDC binding planner and fixed Walter target", () => {
    const source = readFileSync(
      join(root, "scripts/walter-dashboard-oidc-binding-reconciliation.ts"),
      "utf8",
    );

    for (const expected of [
      "tenant-0",
      "aegis-prod.overnightdesk.com",
      "planDashboardOidcBinding",
      "reconcileDashboardOidcBindingWithAudit",
      "readDashboardCanonicalContext",
      "hasExactHermesOidcClientContract",
      "RECONCILE_WALTER_DASHBOARD_OIDC_BINDING",
      "PRIVATE_WALTER_DASHBOARD_HEALTH_VERIFIED",
    ]) {
      expect(source).toContain(expected);
    }
    expect(source).not.toContain("clientSecret");
    expect(source).not.toContain("platformAuditLog");

    const store = readFileSync(
      join(root, "src/db/dashboard-oidc-binding-store.ts"),
      "utf8",
    );
    expect(store).toContain("auditedDashboardOidcBindingStatement");
    expect(store).toContain("WITH mutated AS");
    expect(store).toContain("reconcileDashboardOidcBindingWithAudit");
  });
});
