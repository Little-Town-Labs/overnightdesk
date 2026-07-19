import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../schema";

describe("use-case identity schema", () => {
  it("exports the additive identity tables and lifecycle enums", () => {
    expect(schema.useCase).toBeDefined();
    expect(schema.useCaseNumberAllocation).toBeDefined();
    expect(schema.runtimeIdentity).toBeDefined();
    expect(schema.personaAssignment).toBeDefined();
    expect(schema.useCaseMembership).toBeDefined();
    expect(schema.resourceBinding).toBeDefined();
    expect(schema.secretBoundaryBinding).toBeDefined();

    expect(schema.useCaseStatusEnum.enumValues).toEqual([
      "planned",
      "active",
      "suspended",
      "retired",
    ]);
    expect(schema.membershipStatusEnum.enumValues).toEqual([
      "invited",
      "active",
      "suspended",
      "revoked",
    ]);
    expect(schema.resourceBindingStateEnum.enumValues).toEqual([
      "active",
      "compatibility",
      "rollback",
      "retired",
    ]);
  });

  it("uses UUID columns for canonical identity and zero-based immutable number allocations", () => {
    const useCaseConfig = getTableConfig(schema.useCase);
    const useCaseId = useCaseConfig.columns.find((column) => column.name === "id");
    expect(useCaseId?.getSQLType()).toBe("uuid");

    const allocationConfig = getTableConfig(schema.useCaseNumberAllocation);
    expect(allocationConfig.columns.find((column) => column.name === "number")?.getSQLType()).toBe(
      "bigint"
    );
    expect(allocationConfig.checks.map((constraint) => constraint.name)).toContain(
      "use_case_number_nonnegative"
    );
    expect(allocationConfig.checks.map((constraint) => constraint.name)).toContain(
      "use_case_number_safe_integer"
    );
    expect(allocationConfig.indexes.map((index) => index.config.name)).toContain(
      "use_case_number_allocation_use_case_unique"
    );
  });

  it("enforces one active default persona and non-duplicated memberships", () => {
    const personaConfig = getTableConfig(schema.personaAssignment);
    const personaDefault = personaConfig.indexes.find(
      (index) => index.config.name === "persona_assignment_one_active_default"
    );
    expect(personaDefault?.config.unique).toBe(true);
    expect(personaDefault?.config.where).toBeDefined();

    const membershipConfig = getTableConfig(schema.useCaseMembership);
    expect(membershipConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "use_case_membership_scope_unique",
        "runtime_membership_scope_unique",
      ])
    );
  });

  it("keeps instance identity links nullable during additive migration", () => {
    const instanceConfig = getTableConfig(schema.instance);
    const useCaseId = instanceConfig.columns.find(
      (column) => column.name === "use_case_id"
    );
    const runtimeIdentityId = instanceConfig.columns.find(
      (column) => column.name === "runtime_identity_id"
    );

    expect(useCaseId).toBeDefined();
    expect(useCaseId?.notNull).toBe(false);
    expect(runtimeIdentityId).toBeDefined();
    expect(runtimeIdentityId?.notNull).toBe(false);
  });

  it("makes active resource identifiers unique without storing secret values", () => {
    const bindingConfig = getTableConfig(schema.resourceBinding);
    const activeIdentity = bindingConfig.indexes.find(
      (index) => index.config.name === "resource_binding_live_identifier_unique"
    );

    expect(activeIdentity?.config.unique).toBe(true);
    expect(activeIdentity?.config.where).toBeDefined();
    expect(bindingConfig.columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["secret", "secret_value", "token"])
    );
  });
});
