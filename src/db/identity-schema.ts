import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-core-schema";

export const useCaseStatusEnum = pgEnum("use_case_status", [
  "planned",
  "active",
  "suspended",
  "retired",
]);

export const runtimeIdentityStatusEnum = pgEnum("runtime_identity_status", [
  "planned",
  "active",
  "suspended",
  "retired",
]);

export const personaAssignmentStatusEnum = pgEnum(
  "persona_assignment_status",
  ["active", "disabled", "retired"]
);

export const membershipRoleEnum = pgEnum("use_case_membership_role", [
  "owner",
  "operator",
  "member",
  "viewer",
]);

export const membershipStatusEnum = pgEnum("use_case_membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);

export const resourceBindingKindEnum = pgEnum("resource_binding_kind", [
  "platform_instance",
  "orchestrator_tenant",
  "container",
  "volume",
  "hostname",
  "phase_path",
  "oidc_client",
  "intake_route",
]);

export const resourceBindingStateEnum = pgEnum("resource_binding_state", [
  "active",
  "compatibility",
  "rollback",
  "retired",
]);

export const useCase = pgTable("use_case", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: useCaseStatusEnum("status").notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});

export const useCaseNumberAllocation = pgTable(
  "use_case_number_allocation",
  {
    number: bigint("number", { mode: "number" }).primaryKey(),
    useCaseId: uuid("use_case_id")
      .notNull()
      .references(() => useCase.id, { onDelete: "restrict" }),
    allocatedBy: text("allocated_by").notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("use_case_number_nonnegative", sql`${table.number} >= 0`),
    check(
      "use_case_number_safe_integer",
      sql`${table.number} <= 9007199254740991`
    ),
    uniqueIndex("use_case_number_allocation_use_case_unique").on(
      table.useCaseId
    ),
  ]
);

export const runtimeIdentity = pgTable(
  "runtime_identity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    useCaseId: uuid("use_case_id")
      .notNull()
      .references(() => useCase.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    memoryBoundaryKind: text("memory_boundary_kind").notNull(),
    status: runtimeIdentityStatusEnum("status")
      .notNull()
      .default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("runtime_identity_id_use_case_unique").on(
      table.id,
      table.useCaseId
    ),
    index("runtime_identity_use_case_idx").on(table.useCaseId),
  ]
);

export const personaAssignment = pgTable(
  "persona_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runtimeIdentityId: uuid("runtime_identity_id")
      .notNull()
      .references(() => runtimeIdentity.id, { onDelete: "restrict" }),
    personaKey: text("persona_key").notNull(),
    displayName: text("display_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    authorityProfile: text("authority_profile").notNull(),
    status: personaAssignmentStatusEnum("status")
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("persona_assignment_live_key_unique")
      .on(table.runtimeIdentityId, table.personaKey)
      .where(sql`${table.status} <> 'retired'`),
    uniqueIndex("persona_assignment_one_active_default")
      .on(table.runtimeIdentityId)
      .where(sql`${table.isDefault} = true AND ${table.status} = 'active'`),
  ]
);

export const useCaseMembership = pgTable(
  "use_case_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    useCaseId: uuid("use_case_id")
      .notNull()
      .references(() => useCase.id, { onDelete: "restrict" }),
    runtimeIdentityId: uuid("runtime_identity_id"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("invited"),
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "use_case_membership_runtime_scope_fk",
      columns: [table.runtimeIdentityId, table.useCaseId],
      foreignColumns: [runtimeIdentity.id, runtimeIdentity.useCaseId],
    }).onDelete("restrict"),
    uniqueIndex("use_case_membership_scope_unique")
      .on(table.useCaseId, table.userId)
      .where(sql`${table.runtimeIdentityId} IS NULL`),
    uniqueIndex("runtime_membership_scope_unique")
      .on(table.useCaseId, table.runtimeIdentityId, table.userId)
      .where(sql`${table.runtimeIdentityId} IS NOT NULL`),
    index("use_case_membership_user_idx").on(table.userId),
  ]
);

export const resourceBinding = pgTable(
  "resource_binding",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    useCaseId: uuid("use_case_id")
      .notNull()
      .references(() => useCase.id, { onDelete: "restrict" }),
    runtimeIdentityId: uuid("runtime_identity_id"),
    provider: text("provider").notNull(),
    kind: resourceBindingKindEnum("kind").notNull(),
    value: text("value").notNull(),
    state: resourceBindingStateEnum("state").notNull().default("active"),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "resource_binding_runtime_scope_fk",
      columns: [table.runtimeIdentityId, table.useCaseId],
      foreignColumns: [runtimeIdentity.id, runtimeIdentity.useCaseId],
    }).onDelete("restrict"),
    uniqueIndex("resource_binding_live_identifier_unique")
      .on(table.provider, table.kind, table.value)
      .where(sql`${table.state} <> 'retired'`),
    index("resource_binding_use_case_idx").on(table.useCaseId),
    index("resource_binding_runtime_idx").on(table.runtimeIdentityId),
    check(
      "resource_binding_valid_interval",
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.validFrom}`
    ),
  ]
);

export const secretBoundaryBinding = pgTable(
  "secret_boundary_binding",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    useCaseId: uuid("use_case_id")
      .notNull()
      .references(() => useCase.id, { onDelete: "restrict" }),
    runtimeIdentityId: uuid("runtime_identity_id"),
    phaseApp: text("phase_app").notNull(),
    environment: text("environment").notNull(),
    pathIdentifier: text("path_identifier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "secret_boundary_binding_runtime_scope_fk",
      columns: [table.runtimeIdentityId, table.useCaseId],
      foreignColumns: [runtimeIdentity.id, runtimeIdentity.useCaseId],
    }).onDelete("restrict"),
    uniqueIndex("secret_boundary_binding_use_case_scope_unique")
      .on(
        table.useCaseId,
        table.phaseApp,
        table.environment,
        table.pathIdentifier
      )
      .where(sql`${table.runtimeIdentityId} IS NULL`),
    uniqueIndex("secret_boundary_binding_runtime_scope_unique")
      .on(
        table.useCaseId,
        table.runtimeIdentityId,
        table.phaseApp,
        table.environment,
        table.pathIdentifier
      )
      .where(sql`${table.runtimeIdentityId} IS NOT NULL`),
  ]
);
