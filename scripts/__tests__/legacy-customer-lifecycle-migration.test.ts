import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");
const migrationPath = path.join(
  repoRoot,
  "drizzle/0011_legacy_customer_lifecycle_retirement.sql",
);

describe("legacy customer lifecycle retirement migration", () => {
  it("atomically stops on active local state before dropping only retired objects", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/LOCK TABLE public\."subscription"/i);
    expect(migration).toMatch(/FROM public\."subscription"/i);
    expect(migration).toMatch(/LOCK TABLE public\."instance"/i);
    expect(migration).toMatch(/WHERE "wizard_state" IS NOT NULL/i);
    expect(migration).toMatch(/DROP TABLE public\."subscription"/i);
    expect(migration).toMatch(/DROP TYPE public\.subscription_plan/i);
    expect(migration).toMatch(/DROP TYPE public\.subscription_status/i);
    expect(migration).toMatch(
      /ALTER TABLE public\."instance" DROP COLUMN "wizard_state"/i,
    );
    expect(migration).not.toMatch(/DROP TABLE public\."instance"/i);
    expect(migration).toContain("LEGACY_CLEANUP_PLAN_PATH");
  });
});
