import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

export type LegacyCustomerLifecycleCleanupCommand =
  | "plan"
  | "apply"
  | "verify"
  | "rollback";

export interface LegacyCustomerLifecycleCleanupCounts {
  providerObligationCount: number | null;
  localSubscriptionRowCount: number | null;
  meaningfulWizardStateCount: number | null;
  activeSchemaConsumerCount: number | null;
  subscriptionTableCount: number;
  subscriptionPlanTypeCount: number;
  subscriptionStatusTypeCount: number;
  wizardStateColumnCount: number;
  activeUserCount: number;
  activeMembershipCount: number;
  activeInstanceCount: number;
  activeConversationCount: number;
  activeBusinessRecordCount: number;
}

export interface LegacyCustomerLifecycleCleanupPlan {
  command: "plan";
  status: "ready" | "stopped";
  beforeCounts: LegacyCustomerLifecycleCleanupCounts;
  afterCounts: LegacyCustomerLifecycleCleanupCounts;
  stopReasons: string[];
}

export interface LegacyCustomerLifecycleCleanupStore {
  inspect(): Promise<LegacyCustomerLifecycleCleanupCounts>;
  apply(plan: LegacyCustomerLifecycleCleanupPlan): Promise<void>;
  rollback(plan: LegacyCustomerLifecycleCleanupPlan): Promise<void>;
}

export interface LegacyCustomerLifecycleCleanupExecutionInput {
  command: LegacyCustomerLifecycleCleanupCommand;
  store: LegacyCustomerLifecycleCleanupStore;
  approvalToken?: string;
  plan?: LegacyCustomerLifecycleCleanupPlan;
}

export interface LegacyCustomerLifecycleCleanupPlanResult
  extends LegacyCustomerLifecycleCleanupPlan {}

export interface LegacyCustomerLifecycleCleanupAppliedResult {
  command: "apply";
  status: "applied";
  plan: LegacyCustomerLifecycleCleanupPlan;
  beforeCounts: LegacyCustomerLifecycleCleanupCounts;
  afterCounts: LegacyCustomerLifecycleCleanupCounts;
}

export interface LegacyCustomerLifecycleCleanupVerifiedResult {
  command: "verify";
  status: "verified";
  plan: LegacyCustomerLifecycleCleanupPlan;
  beforeCounts: LegacyCustomerLifecycleCleanupCounts;
  afterCounts: LegacyCustomerLifecycleCleanupCounts;
}

export interface LegacyCustomerLifecycleCleanupRolledBackResult {
  command: "rollback";
  status: "rolled_back";
  plan: LegacyCustomerLifecycleCleanupPlan;
  beforeCounts: LegacyCustomerLifecycleCleanupCounts;
  afterCounts: LegacyCustomerLifecycleCleanupCounts;
}

export type LegacyCustomerLifecycleCleanupResult =
  | LegacyCustomerLifecycleCleanupPlanResult
  | LegacyCustomerLifecycleCleanupAppliedResult
  | LegacyCustomerLifecycleCleanupVerifiedResult
  | LegacyCustomerLifecycleCleanupRolledBackResult;

const APPLY_APPROVAL_ENV = "LEGACY_CLEANUP_APPLY_APPROVAL_TOKEN";
const ROLLBACK_APPROVAL_ENV = "LEGACY_CLEANUP_ROLLBACK_APPROVAL_TOKEN";
const ALLOW_DESTRUCTIVE_ENV = "LEGACY_CLEANUP_ALLOW_DESTRUCTIVE";
const ALLOW_PRODUCTION_ENV = "LEGACY_CLEANUP_ALLOW_PRODUCTION";
const PLAN_PATH_ENV = "LEGACY_CLEANUP_PLAN_PATH";

const COUNT_FIELDS: ReadonlyArray<keyof LegacyCustomerLifecycleCleanupCounts> = [
  "providerObligationCount",
  "localSubscriptionRowCount",
  "meaningfulWizardStateCount",
  "activeSchemaConsumerCount",
  "subscriptionTableCount",
  "subscriptionPlanTypeCount",
  "subscriptionStatusTypeCount",
  "wizardStateColumnCount",
  "activeUserCount",
  "activeMembershipCount",
  "activeInstanceCount",
  "activeConversationCount",
  "activeBusinessRecordCount",
];

const STOP_CONDITIONS: ReadonlyArray<{
  field: keyof LegacyCustomerLifecycleCleanupCounts;
  reason: string;
  ambiguousReason: string;
}> = [
  {
    field: "providerObligationCount",
    reason: "provider obligations",
    ambiguousReason: "provider obligations",
  },
  {
    field: "localSubscriptionRowCount",
    reason: "local subscription rows",
    ambiguousReason: "local subscription rows",
  },
  {
    field: "meaningfulWizardStateCount",
    reason: "meaningful wizard state",
    ambiguousReason: "meaningful wizard state",
  },
  {
    field: "activeSchemaConsumerCount",
    reason: "active schema consumers",
    ambiguousReason: "schema consumers",
  },
];

export class LegacyCustomerLifecycleCleanupBlockedError extends Error {
  readonly plan: LegacyCustomerLifecycleCleanupPlan;

  constructor(plan: LegacyCustomerLifecycleCleanupPlan) {
    super("Legacy customer lifecycle cleanup is blocked by a retirement gate");
    this.name = "LegacyCustomerLifecycleCleanupBlockedError";
    this.plan = plan;
  }
}

function cloneCounts(
  counts: LegacyCustomerLifecycleCleanupCounts,
): LegacyCustomerLifecycleCleanupCounts {
  return { ...counts };
}

function expectedAfterCounts(
  beforeCounts: LegacyCustomerLifecycleCleanupCounts,
): LegacyCustomerLifecycleCleanupCounts {
  return {
    ...beforeCounts,
    subscriptionTableCount: 0,
    subscriptionPlanTypeCount: 0,
    subscriptionStatusTypeCount: 0,
    wizardStateColumnCount: 0,
  };
}

function stopReasons(
  counts: LegacyCustomerLifecycleCleanupCounts,
): string[] {
  const reasons: string[] = [];

  for (const condition of STOP_CONDITIONS) {
    const value = counts[condition.field];
    if (value === null) {
      reasons.push(`${condition.ambiguousReason} are ambiguous`);
    } else if (value > 0) {
      reasons.push(condition.reason);
    }
  }

  if (
    counts.subscriptionTableCount === 1 &&
    (counts.subscriptionPlanTypeCount !== 1 ||
      counts.subscriptionStatusTypeCount !== 1)
  ) {
    reasons.push("subscription schema is inconsistent");
  }

  return reasons;
}

export function planLegacyCustomerLifecycleCleanup(
  beforeCounts: LegacyCustomerLifecycleCleanupCounts,
): LegacyCustomerLifecycleCleanupPlan {
  const reasons = stopReasons(beforeCounts);

  return {
    command: "plan",
    status: reasons.length === 0 ? "ready" : "stopped",
    beforeCounts: cloneCounts(beforeCounts),
    afterCounts:
      reasons.length === 0
        ? expectedAfterCounts(beforeCounts)
        : cloneCounts(beforeCounts),
    stopReasons: reasons,
  };
}

function assertReadyPlan(
  plan: LegacyCustomerLifecycleCleanupPlan | undefined,
): asserts plan is LegacyCustomerLifecycleCleanupPlan & { status: "ready" } {
  if (
    !plan ||
    plan.status !== "ready" ||
    plan.stopReasons.length !== 0 ||
    stopReasons(plan.beforeCounts).length !== 0
  ) {
    throw new Error("Legacy customer lifecycle cleanup plan is not ready");
  }
  assertCountsEqual(
    plan.afterCounts,
    expectedAfterCounts(plan.beforeCounts),
    "Legacy customer lifecycle cleanup plan after-counts are invalid",
  );
}

function assertCountsEqual(
  actual: LegacyCustomerLifecycleCleanupCounts,
  expected: LegacyCustomerLifecycleCleanupCounts,
  message: string,
): void {
  for (const field of COUNT_FIELDS) {
    if (actual[field] !== expected[field]) {
      throw new Error(message);
    }
  }
}

function requiredApprovalToken(
  command: "apply" | "rollback",
  suppliedToken: string | undefined,
): void {
  const applyToken = process.env[APPLY_APPROVAL_ENV];
  const rollbackToken = process.env[ROLLBACK_APPROVAL_ENV];
  if (!applyToken || !rollbackToken) {
    throw new Error(
      `${command} approval token configuration requires distinct apply and rollback tokens`,
    );
  }
  if (applyToken === rollbackToken) {
    throw new Error("Apply and rollback approval tokens must be distinct");
  }

  const environmentName =
    command === "apply" ? APPLY_APPROVAL_ENV : ROLLBACK_APPROVAL_ENV;
  const expectedToken = process.env[environmentName];

  if (!expectedToken || !suppliedToken) {
    throw new Error(`${command} approval token is required`);
  }

  const expectedBytes = Buffer.from(expectedToken);
  const suppliedBytes = Buffer.from(suppliedToken);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    throw new Error(`${command} approval token is invalid`);
  }
}

const nullableCountSchema = z.number().int().nonnegative().nullable();
const countSchema = z.number().int().nonnegative();
const cleanupCountsSchema = z
  .object({
    providerObligationCount: nullableCountSchema,
    localSubscriptionRowCount: nullableCountSchema,
    meaningfulWizardStateCount: nullableCountSchema,
    activeSchemaConsumerCount: nullableCountSchema,
    subscriptionTableCount: countSchema.max(1),
    subscriptionPlanTypeCount: countSchema.max(1),
    subscriptionStatusTypeCount: countSchema.max(1),
    wizardStateColumnCount: countSchema.max(1),
    activeUserCount: countSchema,
    activeMembershipCount: countSchema,
    activeInstanceCount: countSchema,
    activeConversationCount: countSchema,
    activeBusinessRecordCount: countSchema,
  })
  .strict();
const readyPlanSchema = z
  .object({
    command: z.literal("plan"),
    status: z.literal("ready"),
    beforeCounts: cleanupCountsSchema,
    afterCounts: cleanupCountsSchema,
    stopReasons: z.tuple([]),
  })
  .strict();
const appliedArtifactSchema = z
  .object({
    command: z.literal("apply"),
    status: z.literal("applied"),
    plan: readyPlanSchema,
    beforeCounts: cleanupCountsSchema,
    afterCounts: cleanupCountsSchema,
  })
  .strict();

export function parseLegacyCustomerLifecycleCleanupPlanArtifact(
  artifact: unknown,
): LegacyCustomerLifecycleCleanupPlan {
  const parsed = appliedArtifactSchema.safeParse(artifact);
  if (!parsed.success) {
    throw new Error("Cleanup plan artifact is not a validated applied result");
  }

  const { plan, beforeCounts, afterCounts } = parsed.data;
  if (stopReasons(plan.beforeCounts).length > 0) {
    throw new Error("Cleanup plan artifact is not a ready zero-state plan");
  }
  assertCountsEqual(
    beforeCounts,
    plan.beforeCounts,
    "Cleanup plan artifact before-counts do not match",
  );
  assertCountsEqual(
    afterCounts,
    plan.afterCounts,
    "Cleanup plan artifact after-counts do not match",
  );
  assertCountsEqual(
    plan.afterCounts,
    expectedAfterCounts(plan.beforeCounts),
    "Cleanup plan artifact after-counts are invalid",
  );
  return plan;
}

async function loadPlanArtifact(): Promise<LegacyCustomerLifecycleCleanupPlan> {
  const path = process.env[PLAN_PATH_ENV];
  if (!path) throw new Error(`${PLAN_PATH_ENV} is required`);

  let artifact: unknown;
  try {
    artifact = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("Cleanup plan artifact could not be read");
  }
  return parseLegacyCustomerLifecycleCleanupPlanArtifact(artifact);
}

export function executeLegacyCustomerLifecycleCleanup(
  input: LegacyCustomerLifecycleCleanupExecutionInput & { command: "plan" },
): Promise<LegacyCustomerLifecycleCleanupPlanResult>;
export function executeLegacyCustomerLifecycleCleanup(
  input: LegacyCustomerLifecycleCleanupExecutionInput & { command: "apply" },
): Promise<LegacyCustomerLifecycleCleanupAppliedResult>;
export function executeLegacyCustomerLifecycleCleanup(
  input: LegacyCustomerLifecycleCleanupExecutionInput & { command: "verify" },
): Promise<LegacyCustomerLifecycleCleanupVerifiedResult>;
export function executeLegacyCustomerLifecycleCleanup(
  input: LegacyCustomerLifecycleCleanupExecutionInput & { command: "rollback" },
): Promise<LegacyCustomerLifecycleCleanupRolledBackResult>;
export function executeLegacyCustomerLifecycleCleanup(
  input: LegacyCustomerLifecycleCleanupExecutionInput,
): Promise<LegacyCustomerLifecycleCleanupResult>;
export async function executeLegacyCustomerLifecycleCleanup(
  input: LegacyCustomerLifecycleCleanupExecutionInput,
): Promise<LegacyCustomerLifecycleCleanupResult> {
  if (input.command === "plan") {
    return planLegacyCustomerLifecycleCleanup(await input.store.inspect());
  }

  if (input.command === "apply") {
    requiredApprovalToken("apply", input.approvalToken);
    const plan = planLegacyCustomerLifecycleCleanup(await input.store.inspect());
    if (plan.status !== "ready") throw new LegacyCustomerLifecycleCleanupBlockedError(plan);

    await input.store.apply(plan);
    const afterCounts = await input.store.inspect();
    assertCountsEqual(
      afterCounts,
      plan.afterCounts,
      "Legacy customer lifecycle cleanup did not reach the planned after-counts",
    );

    return {
      command: "apply",
      status: "applied",
      plan,
      beforeCounts: cloneCounts(plan.beforeCounts),
      afterCounts: cloneCounts(afterCounts),
    };
  }

  assertReadyPlan(input.plan);

  if (input.command === "verify") {
    const afterCounts = await input.store.inspect();
    assertCountsEqual(
      afterCounts,
      input.plan.afterCounts,
      "Legacy customer lifecycle cleanup is not verified",
    );

    return {
      command: "verify",
      status: "verified",
      plan: input.plan,
      beforeCounts: cloneCounts(input.plan.beforeCounts),
      afterCounts: cloneCounts(afterCounts),
    };
  }

  requiredApprovalToken("rollback", input.approvalToken);
  const currentCounts = await input.store.inspect();
  assertCountsEqual(
    currentCounts,
    input.plan.afterCounts,
    "Legacy customer lifecycle cleanup is not in the applied state",
  );

  await input.store.rollback(input.plan);
  const afterCounts = await input.store.inspect();
  assertCountsEqual(
    afterCounts,
    input.plan.beforeCounts,
    "Legacy customer lifecycle cleanup rollback did not restore before-counts",
  );

  return {
    command: "rollback",
    status: "rolled_back",
    plan: input.plan,
    beforeCounts: cloneCounts(input.plan.beforeCounts),
    afterCounts: cloneCounts(afterCounts),
  };
}

interface DatabaseExecutor {
  execute(query: SQL): Promise<{ rows: Array<Record<string, unknown>> }>;
}

type KnownTable =
  | "user"
  | "use_case_membership"
  | "instance"
  | "subscription"
  | "conversation"
  | "business_record";

const TABLE_COUNT_QUERIES: Record<KnownTable, SQL> = {
  user: sql`SELECT COUNT(*)::int AS count FROM public."user"`,
  use_case_membership: sql`SELECT COUNT(*)::int AS count FROM public."use_case_membership"`,
  instance: sql`SELECT COUNT(*)::int AS count FROM public."instance"`,
  subscription: sql`SELECT COUNT(*)::int AS count FROM public."subscription"`,
  conversation: sql`SELECT COUNT(*)::int AS count FROM public."conversation"`,
  business_record: sql`SELECT COUNT(*)::int AS count FROM public."business_record"`,
};

async function tableExists(
  database: DatabaseExecutor,
  table: KnownTable,
): Promise<boolean> {
  const result = await database.execute(
    sql`SELECT to_regclass(${"public.${table}"}) IS NOT NULL AS present`,
  );
  return result.rows[0]?.present === true;
}

async function columnExists(
  database: DatabaseExecutor,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await database.execute(
    sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      ) AS present
    `,
  );
  return result.rows[0]?.present === true;
}

type KnownSubscriptionType = "subscription_plan" | "subscription_status";

async function typeExists(
  database: DatabaseExecutor,
  type: KnownSubscriptionType,
): Promise<boolean> {
  const result = await database.execute(
    sql`SELECT to_regtype(${`public.${type}`}) IS NOT NULL AS present`,
  );
  return result.rows[0]?.present === true;
}

function countValue(row: Record<string, unknown> | undefined): number {
  const value = row?.count;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Cleanup count query returned an invalid count");
  }
  return parsed;
}

async function countTable(
  database: DatabaseExecutor,
  table: KnownTable,
): Promise<number> {
  if (!(await tableExists(database, table))) return 0;
  const result = await database.execute(TABLE_COUNT_QUERIES[table]);
  return countValue(result.rows[0]);
}

function optionalEnvironmentCount(name: string): number | null {
  const value = process.env[name];
  if (value === undefined || value === "") return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function inspectLegacyCustomerLifecycleDatabase(
  database: DatabaseExecutor,
): Promise<LegacyCustomerLifecycleCleanupCounts> {
  const subscriptionTableCount = (await tableExists(database, "subscription"))
    ? 1
    : 0;
  const subscriptionPlanTypeCount = (await typeExists(
    database,
    "subscription_plan",
  ))
    ? 1
    : 0;
  const subscriptionStatusTypeCount = (await typeExists(
    database,
    "subscription_status",
  ))
    ? 1
    : 0;
  const wizardStateColumnCount = (await columnExists(
    database,
    "instance",
    "wizard_state",
  ))
    ? 1
    : 0;

  const localSubscriptionRowCount = subscriptionTableCount
    ? await countTable(database, "subscription")
    : 0;
  const meaningfulWizardStateCount = wizardStateColumnCount
    ? countValue(
        (
          await database.execute(
            sql`
              SELECT COUNT(*)::int AS count
              FROM public."instance"
              WHERE "wizard_state" IS NOT NULL
            `,
          )
        ).rows[0],
      )
    : 0;

  return {
    providerObligationCount: optionalEnvironmentCount(
      "LEGACY_CLEANUP_PROVIDER_OBLIGATION_COUNT",
    ),
    localSubscriptionRowCount,
    meaningfulWizardStateCount,
    activeSchemaConsumerCount: optionalEnvironmentCount(
      "LEGACY_CLEANUP_ACTIVE_SCHEMA_CONSUMER_COUNT",
    ),
    subscriptionTableCount,
    subscriptionPlanTypeCount,
    subscriptionStatusTypeCount,
    wizardStateColumnCount,
    activeUserCount: await countTable(database, "user"),
    activeMembershipCount: await countTable(database, "use_case_membership"),
    activeInstanceCount: await countTable(database, "instance"),
    activeConversationCount: optionalEnvironmentCount(
      "LEGACY_CLEANUP_ACTIVE_CONVERSATION_COUNT",
    ) ?? 0,
    activeBusinessRecordCount: optionalEnvironmentCount(
      "LEGACY_CLEANUP_ACTIVE_BUSINESS_RECORD_COUNT",
    ) ?? 0,
  };
}

function assertDestructiveBoundary(): void {
  if (process.env[ALLOW_DESTRUCTIVE_ENV] !== "true") {
    throw new Error("Destructive cleanup is disabled");
  }

  if (process.env[ALLOW_PRODUCTION_ENV] === "true") return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  let databaseName = "";
  try {
    databaseName = new URL(databaseUrl).pathname.slice(1).toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }

  if (!/^overnightdesk_legacy_cleanup_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("Destructive cleanup requires a disposable database");
  }
}

class DatabaseCleanupStore implements LegacyCustomerLifecycleCleanupStore {
  constructor(private readonly database: DatabaseExecutor) {}

  inspect(): Promise<LegacyCustomerLifecycleCleanupCounts> {
    return inspectLegacyCustomerLifecycleDatabase(this.database);
  }

  async apply(plan: LegacyCustomerLifecycleCleanupPlan): Promise<void> {
    assertDestructiveBoundary();
    assertReadyPlan(plan);
    const dropSubscription = sql.raw(
      plan.beforeCounts.subscriptionTableCount === 1 ? "TRUE" : "FALSE",
    );
    const dropSubscriptionPlanType = sql.raw(
      plan.beforeCounts.subscriptionPlanTypeCount === 1 ? "TRUE" : "FALSE",
    );
    const dropSubscriptionStatusType = sql.raw(
      plan.beforeCounts.subscriptionStatusTypeCount === 1 ? "TRUE" : "FALSE",
    );
    const dropWizardState = sql.raw(
      plan.beforeCounts.wizardStateColumnCount === 1 ? "TRUE" : "FALSE",
    );
    await this.database.execute(sql`
      DO $$
      BEGIN
        IF ${dropSubscription} THEN
          IF to_regclass('public.subscription') IS NULL THEN
            RAISE EXCEPTION 'subscription table changed after planning';
          END IF;
          LOCK TABLE public."subscription" IN ACCESS EXCLUSIVE MODE;
          IF EXISTS (SELECT 1 FROM public."subscription" LIMIT 1) THEN
            RAISE EXCEPTION 'local subscription rows are not zero';
          END IF;
        END IF;

        IF ${dropWizardState} THEN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'instance'
              AND column_name = 'wizard_state'
          ) THEN
            RAISE EXCEPTION 'wizard state column changed after planning';
          END IF;
          LOCK TABLE public."instance" IN ACCESS EXCLUSIVE MODE;
          IF EXISTS (
            SELECT 1
            FROM public."instance"
            WHERE "wizard_state" IS NOT NULL
            LIMIT 1
          ) THEN
            RAISE EXCEPTION 'meaningful wizard state is not zero';
          END IF;
        END IF;

        IF ${dropSubscription} THEN
          DROP TABLE public."subscription";
        END IF;

        IF ${dropSubscriptionPlanType} THEN
          IF to_regtype('public.subscription_plan') IS NULL THEN
            RAISE EXCEPTION 'subscription plan type changed after planning';
          END IF;
          DROP TYPE public.subscription_plan;
        END IF;

        IF ${dropSubscriptionStatusType} THEN
          IF to_regtype('public.subscription_status') IS NULL THEN
            RAISE EXCEPTION 'subscription status type changed after planning';
          END IF;
          DROP TYPE public.subscription_status;
        END IF;

        IF ${dropWizardState} THEN
          ALTER TABLE public."instance" DROP COLUMN "wizard_state";
        END IF;
      END
      $$;
    `);
  }

  async rollback(plan: LegacyCustomerLifecycleCleanupPlan): Promise<void> {
    assertDestructiveBoundary();
    assertReadyPlan(plan);
    const restoreSubscription = sql.raw(
      plan.beforeCounts.subscriptionTableCount === 1 ? "TRUE" : "FALSE",
    );
    const restoreSubscriptionPlanType = sql.raw(
      plan.beforeCounts.subscriptionPlanTypeCount === 1 ? "TRUE" : "FALSE",
    );
    const restoreSubscriptionStatusType = sql.raw(
      plan.beforeCounts.subscriptionStatusTypeCount === 1 ? "TRUE" : "FALSE",
    );
    const restoreWizardState = sql.raw(
      plan.beforeCounts.wizardStateColumnCount === 1 ? "TRUE" : "FALSE",
    );
    await this.database.execute(sql`
      DO $$
      BEGIN
        IF ${restoreSubscriptionPlanType} THEN
          IF to_regtype('public.subscription_plan') IS NULL THEN
            CREATE TYPE public.subscription_plan AS ENUM ('starter', 'pro');
          END IF;
        END IF;

        IF ${restoreSubscriptionStatusType} THEN
          IF to_regtype('public.subscription_status') IS NULL THEN
            CREATE TYPE public.subscription_status AS ENUM
              ('active', 'past_due', 'canceled', 'trialing');
          END IF;
        END IF;

        IF ${restoreSubscription} THEN
          IF to_regclass('public.subscription') IS NULL THEN
            CREATE TABLE public."subscription" (
              "id" text PRIMARY KEY NOT NULL,
              "user_id" text NOT NULL
                REFERENCES public."user"("id") ON DELETE CASCADE,
              "stripe_customer_id" text,
              "stripe_subscription_id" text,
              "plan" public.subscription_plan NOT NULL,
              "status" public.subscription_status NOT NULL,
              "current_period_end" timestamp with time zone,
              "created_at" timestamp with time zone DEFAULT now() NOT NULL,
              "updated_at" timestamp with time zone DEFAULT now() NOT NULL
            );
          END IF;
        END IF;

        IF ${restoreWizardState} AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'instance'
            AND column_name = 'wizard_state'
        ) THEN
          ALTER TABLE public."instance" ADD COLUMN "wizard_state" jsonb;
        END IF;
      END
      $$;
    `);
  }
}

export function createLegacyCustomerLifecycleCleanupStore(
  database: DatabaseExecutor,
): LegacyCustomerLifecycleCleanupStore {
  return new DatabaseCleanupStore(database);
}

async function createDefaultStore(): Promise<LegacyCustomerLifecycleCleanupStore> {
  const { db } = await import("@/db");
  return createLegacyCustomerLifecycleCleanupStore(db);
}

function commandFrom(value: string | undefined): LegacyCustomerLifecycleCleanupCommand {
  if (value === "plan" || value === "apply" || value === "verify" || value === "rollback") {
    return value;
  }
  throw new Error("Cleanup command must be plan, apply, verify, or rollback");
}

function printResult(result: LegacyCustomerLifecycleCleanupResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main(): Promise<void> {
  const command = commandFrom(process.argv[2]);
  const plan =
    command === "verify" || command === "rollback"
      ? await loadPlanArtifact()
      : undefined;
  const result = await executeLegacyCustomerLifecycleCleanup({
    command,
    store: await createDefaultStore(),
    approvalToken: process.env.LEGACY_CLEANUP_APPROVAL_TOKEN,
    plan,
  });
  printResult(result);
  if (result.status === "stopped") process.exitCode = 2;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entrypoint.endsWith("/scripts/legacy-customer-lifecycle-cleanup.ts")) {
  main().catch((error) => {
    if (error instanceof LegacyCustomerLifecycleCleanupBlockedError) {
      printResult(error.plan);
      process.exitCode = 2;
      return;
    }
    process.stderr.write("Legacy customer lifecycle cleanup failed\n");
    process.exitCode = 1;
  });
}
