const fs = require("node:fs");
const path = require("node:path");
const { neon } = require("@neondatabase/serverless");

const migrationPath = path.join(
  __dirname,
  "..",
  "drizzle",
  "0009_use_case_identity_foundation.sql",
);
const expectedBoundaries = [
  "use_case",
  "use_case_number_allocation",
  "runtime_identity",
  "persona_assignment",
  "use_case_membership",
  "resource_binding",
  "secret_boundary_binding",
  "instance_use_case_id",
  "instance_runtime_identity_id",
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseCommand(value) {
  const command = value ?? "plan";
  if (command !== "plan" && command !== "apply") {
    throw new Error("Command must be plan or apply");
  }
  return command;
}

async function inspectSchema(client) {
  const rows = await client(
    `SELECT
      to_regclass('public.use_case') IS NOT NULL AS use_case,
      to_regclass('public.use_case_number_allocation') IS NOT NULL AS use_case_number_allocation,
      to_regclass('public.runtime_identity') IS NOT NULL AS runtime_identity,
      to_regclass('public.persona_assignment') IS NOT NULL AS persona_assignment,
      to_regclass('public.use_case_membership') IS NOT NULL AS use_case_membership,
      to_regclass('public.resource_binding') IS NOT NULL AS resource_binding,
      to_regclass('public.secret_boundary_binding') IS NOT NULL AS secret_boundary_binding,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instance' AND column_name = 'use_case_id') AS instance_use_case_id,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instance' AND column_name = 'runtime_identity_id') AS instance_runtime_identity_id`,
    [],
    { arrayMode: false, fullResults: false },
  );
  return rows[0];
}

function classifySchema(state) {
  const present = expectedBoundaries.filter((name) => state[name] === true);
  if (present.length === 0) return "ready";
  if (present.length === expectedBoundaries.length) return "deployed";
  throw new Error("mixed_identity_schema_state");
}

function loadStatements() {
  const contents = fs.readFileSync(migrationPath, "utf8");
  if (/\bDROP\s/i.test(contents) || /\bTRUNCATE\s/i.test(contents)) {
    throw new Error("Identity migration contains a destructive statement");
  }
  if (/UPDATE\s+"?instance"?\s+SET/i.test(contents)) {
    throw new Error("Identity schema migration must not backfill instances");
  }
  return contents
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applySchema(client, actor) {
  const statements = loadStatements();
  const queries = statements.map((statement) =>
    client(statement, [], { arrayMode: false, fullResults: true }),
  );
  queries.push(
    client(
      "INSERT INTO platform_audit_log (actor, action, target, details) VALUES ($1, $2, $3, $4::jsonb)",
      [
        actor,
        "use_case_identity_schema_deployed",
        "drizzle:0009",
        JSON.stringify({ migration: "0009", additive: true }),
      ],
      { arrayMode: false, fullResults: true },
    ),
  );
  await client.transaction(queries);
  return statements.length;
}

async function run() {
  const command = parseCommand(process.argv[2]);
  const client = neon(requiredEnvironment("DATABASE_URL"));
  const before = classifySchema(await inspectSchema(client));
  if (command === "plan" || before === "deployed") {
    console.log(JSON.stringify({ status: before }, null, 2));
    return;
  }
  if (process.env.IDENTITY_SCHEMA_CONFIRM !== "ADD_IDENTITY_SCHEMA_0009") {
    throw new Error(
      "IDENTITY_SCHEMA_CONFIRM must equal ADD_IDENTITY_SCHEMA_0009",
    );
  }
  const actor = requiredEnvironment("IDENTITY_SCHEMA_ACTOR");
  const statements = await applySchema(client, actor);
  const after = classifySchema(await inspectSchema(client));
  if (after !== "deployed")
    throw new Error("Identity schema verification failed");
  console.log(JSON.stringify({ status: after, statements }, null, 2));
}

run().catch((error) => {
  const kind = error instanceof Error ? error.name : "non-Error rejection";
  console.error(`Identity schema command failed (${kind})`);
  process.exitCode = 1;
});
