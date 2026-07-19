import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("use-case identity migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "drizzle/0009_use_case_identity_foundation.sql"),
    "utf8"
  );

  it("adds identity tables and nullable instance links without backfilling data", () => {
    expect(migration).toContain('CREATE TABLE "use_case"');
    expect(migration).toContain('CREATE TABLE "runtime_identity"');
    expect(migration).toContain('CREATE TABLE "use_case_membership"');
    expect(migration).toContain('CREATE TABLE "resource_binding"');
    expect(migration).toContain(
      'ALTER TABLE "instance" ADD COLUMN "use_case_id" uuid'
    );
    expect(migration).toContain(
      'ALTER TABLE "instance" ADD COLUMN "runtime_identity_id" uuid'
    );
    expect(migration).not.toMatch(/UPDATE\s+"?instance"?\s+SET/i);
  });

  it("makes number allocations immutable and non-reusable", () => {
    expect(migration).toContain("use_case_number_nonnegative");
    expect(migration).toContain("use_case_number_safe_integer");
    expect(migration).toContain(
      "prevent_use_case_number_allocation_mutation"
    );
    expect(migration).toContain(
      "BEFORE UPDATE OR DELETE ON use_case_number_allocation"
    );
  });

  it("enforces membership, persona, runtime-scope, and live-resource constraints", () => {
    expect(migration).toContain("persona_assignment_one_active_default");
    expect(migration).toContain("use_case_membership_scope_unique");
    expect(migration).toContain("runtime_membership_scope_unique");
    expect(migration).toContain("resource_binding_live_identifier_unique");
    expect(migration).toContain("instance_runtime_scope_fk");
    expect(migration).toContain(
      '"use_case_membership_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade'
    );
  });
});
