import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Existing tables
// ---------------------------------------------------------------------------

export const waitlist = pgTable("waitlist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  business: text("business"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
]);

export const instanceStatusEnum = pgEnum("instance_status", [
  "queued",
  "provisioning",
  "awaiting_auth",
  "running",
  "stopped",
  "error",
  "deprovisioned",
]);

export const claudeAuthStatusEnum = pgEnum("claude_auth_status", [
  "not_configured",
  "connected",
  "expired",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "starter",
  "pro",
]);

export const emailTypeEnum = pgEnum("email_type", [
  "verification",
  "password_reset",
  "welcome",
  "payment_failure",
  "provisioning",
]);

export const emailStatusEnum = pgEnum("email_status", ["sent", "failed"]);

// ---------------------------------------------------------------------------
// Better Auth tables
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  emailOptOut: boolean("email_opt_out").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const account = pgTable("account", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Platform tables
// ---------------------------------------------------------------------------

export const subscription = pgTable("subscription", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: subscriptionPlanEnum("plan").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const instance = pgTable("instance", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().unique(),
  status: instanceStatusEnum("status").notNull().default("queued"),
  containerId: text("container_id"),
  gatewayPort: integer("gateway_port").unique(),
  dashboardTokenHash: text("dashboard_token_hash"),
  engineApiKey: text("engine_api_key"),
  claudeAuthStatus: claudeAuthStatusEnum("claude_auth_status")
    .notNull()
    .default("not_configured"),
  subdomain: text("subdomain").unique(),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  deprovisionedAt: timestamp("deprovisioned_at", { withTimezone: true }),
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  consecutiveHealthFailures: integer("consecutive_health_failures").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const fleetEvent = pgTable("fleet_event", {
  id: serial("id").primaryKey(),
  instanceId: text("instance_id").references(() => instance.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usageMetric = pgTable(
  "usage_metric",
  {
    id: serial("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instance.id, { onDelete: "cascade" }),
    metricDate: date("metric_date").notNull(),
    claudeCalls: integer("claude_calls").notNull().default(0),
    toolExecutions: integer("tool_executions").notNull().default(0),
  },
  (table) => [unique().on(table.instanceId, table.metricDate)]
);

export const platformAuditLog = pgTable("platform_audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailLog = pgTable("email_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  recipientEmail: text("recipient_email").notNull(),
  emailType: emailTypeEnum("email_type").notNull(),
  resendId: text("resend_id"),
  status: emailStatusEnum("status").notNull().default("sent"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (for type-safe Drizzle query API)
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  subscriptions: many(subscription),
  instances: many(instance),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, {
    fields: [subscription.userId],
    references: [user.id],
  }),
}));

export const instanceRelations = relations(instance, ({ one, many }) => ({
  user: one(user, { fields: [instance.userId], references: [user.id] }),
  fleetEvents: many(fleetEvent),
  usageMetrics: many(usageMetric),
}));

export const fleetEventRelations = relations(fleetEvent, ({ one }) => ({
  instance: one(instance, {
    fields: [fleetEvent.instanceId],
    references: [instance.id],
  }),
}));

export const usageMetricRelations = relations(usageMetric, ({ one }) => ({
  instance: one(instance, {
    fields: [usageMetric.instanceId],
    references: [instance.id],
  }),
}));

export const emailLogRelations = relations(emailLog, ({ one }) => ({
  user: one(user, { fields: [emailLog.userId], references: [user.id] }),
}));
