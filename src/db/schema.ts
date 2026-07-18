import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
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
  "awaiting_provisioning",
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

export const newsletterCategoryEnum = pgEnum("newsletter_category", [
  "ai-llm",
  "developer-tools",
  "product-saas",
  "fundraising-market",
  "security",
  "general-tech",
]);

export const contentWorthinessEnum = pgEnum("content_worthiness", [
  "high",
  "medium",
  "low",
]);

export const hermesDashboardAuthStatusEnum = pgEnum(
  "hermes_dashboard_auth_status",
  ["legacy", "pending", "active", "disabled", "error"]
);

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

export const jwks = pgTable("jwks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: boolean("disabled").notNull().default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    public: boolean("public"),
    type: text("type"),
    requirePKCE: boolean("require_pkce"),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  },
  (table) => [index("oauth_client_user_id_idx").on(table.userId)]
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revoked: timestamp("revoked", { withTimezone: true }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("oauth_refresh_token_client_id_idx").on(table.clientId),
    index("oauth_refresh_token_session_id_idx").on(table.sessionId),
    index("oauth_refresh_token_user_id_idx").on(table.userId),
  ]
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("oauth_access_token_client_id_idx").on(table.clientId),
    index("oauth_access_token_session_id_idx").on(table.sessionId),
    index("oauth_access_token_user_id_idx").on(table.userId),
    index("oauth_access_token_refresh_id_idx").on(table.refreshId),
  ]
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("oauth_consent_client_id_idx").on(table.clientId),
    index("oauth_consent_user_id_idx").on(table.userId),
  ]
);

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
  phaseServiceToken: text("phase_service_token"),
  wizardState: jsonb("wizard_state").$type<{ completedSteps: number[]; currentStep: number } | null>(),
  claudeAuthStatus: claudeAuthStatusEnum("claude_auth_status")
    .notNull()
    .default("not_configured"),
  subdomain: text("subdomain").unique(),
  hermesOidcClientId: text("hermes_oidc_client_id")
    .unique()
    .references(() => oauthClient.clientId, { onDelete: "set null" }),
  hermesDashboardAuthStatus: hermesDashboardAuthStatusEnum(
    "hermes_dashboard_auth_status"
  )
    .notNull()
    .default("legacy"),
  hermesDashboardAuthUpdatedAt: timestamp(
    "hermes_dashboard_auth_updated_at",
    { withTimezone: true }
  ),
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
// Newsletter Curator tables (replicated from aegis-prod)
// Rows are immutable after sync — no updatedAt column by design.
// The Curator always provides created_at from the source; defaultNow() is a
// safety net only.
// ---------------------------------------------------------------------------

export const ocNewsletterInsights = pgTable(
  "oc_newsletter_insights",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ingestedId: text("ingested_id").notNull().unique(),
    source: text("source").notNull(),
    sender: text("sender"),
    subject: text("subject"),
    summary: text("summary").notNull(),
    category: newsletterCategoryEnum("category").notNull(),
    contentWorthiness: contentWorthinessEnum("content_worthiness").notNull(),
    blogAngle: text("blog_angle"),
    linkedinAngle: text("linkedin_angle"),
    modelUsed: text("model_used").notNull(),
    runId: text("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_oc_newsletter_insights_category").on(table.category, table.createdAt.desc()),
    index("idx_oc_newsletter_insights_high_value")
      .on(table.contentWorthiness, table.createdAt.desc())
      .where(sql`${table.contentWorthiness} = 'high'`),
    index("idx_oc_newsletter_insights_run").on(table.runId),
  ]
);

// ---------------------------------------------------------------------------
// Relations (for type-safe Drizzle query API)
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  subscriptions: many(subscription),
  instances: many(instance),
  oauthClients: many(oauthClient),
  oauthAccessTokens: many(oauthAccessToken),
  oauthRefreshTokens: many(oauthRefreshToken),
  oauthConsents: many(oauthConsent),
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
  hermesOidcClient: one(oauthClient, {
    fields: [instance.hermesOidcClientId],
    references: [oauthClient.clientId],
  }),
  fleetEvents: many(fleetEvent),
  usageMetrics: many(usageMetric),
}));

export const oauthClientRelations = relations(oauthClient, ({ one, many }) => ({
  user: one(user, { fields: [oauthClient.userId], references: [user.id] }),
  instance: one(instance),
  accessTokens: many(oauthAccessToken),
  refreshTokens: many(oauthRefreshToken),
  consents: many(oauthConsent),
}));

export const oauthAccessTokenRelations = relations(
  oauthAccessToken,
  ({ one }) => ({
    client: one(oauthClient, {
      fields: [oauthAccessToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthAccessToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthAccessToken.userId],
      references: [user.id],
    }),
    refreshToken: one(oauthRefreshToken, {
      fields: [oauthAccessToken.refreshId],
      references: [oauthRefreshToken.id],
    }),
  })
);

export const oauthRefreshTokenRelations = relations(
  oauthRefreshToken,
  ({ one, many }) => ({
    client: one(oauthClient, {
      fields: [oauthRefreshToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthRefreshToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthRefreshToken.userId],
      references: [user.id],
    }),
    accessTokens: many(oauthAccessToken),
  })
);

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  client: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
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
