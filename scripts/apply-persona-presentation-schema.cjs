const fs = require("node:fs");
const path = require("node:path");
const { neon } = require("@neondatabase/serverless");

const migrationPath = path.join(
  __dirname,
  "..",
  "drizzle",
  "0010_persona_presentation_logo.sql",
);
const expectedColumns = [
  "logo_content_type",
  "logo_data_base64",
  "logo_sha256",
];
const expectedConstraints = [
  "persona_assignment_logo_all_or_none",
  "persona_assignment_logo_content_type",
  "persona_assignment_logo_data_length",
  "persona_assignment_logo_sha256",
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseCommand(value) {
  const command = value ?? "plan";
  if (!["plan", "apply", "verify"].includes(command)) {
    throw new Error("Command must be plan, apply, or verify");
  }
  return command;
}

async function inspectSchema(client) {
  const rows = await client(
    `SELECT
      to_regclass('public.persona_assignment') IS NOT NULL AS persona_assignment,
      COALESCE((SELECT array_agg(column_name ORDER BY column_name)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'persona_assignment'
          AND column_name = ANY($1::text[])), ARRAY[]::text[]) AS columns,
      COALESCE((SELECT array_agg(conname ORDER BY conname)
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.persona_assignment')
          AND conname = ANY($2::text[])), ARRAY[]::text[]) AS constraints`,
    [expectedColumns, expectedConstraints],
    { arrayMode: false, fullResults: false },
  );
  return rows[0];
}

function classifySchema(state) {
  if (state.persona_assignment !== true) {
    throw new Error("persona_assignment_table_unavailable");
  }
  const normalizeNames = (value) => {
    if (Array.isArray(value)) return [...value];
    if (value === "{}") return [];
    if (
      typeof value === "string" &&
      /^\{[a-z0-9_]+(?:,[a-z0-9_]+)*\}$/.test(value)
    ) {
      return value.slice(1, -1).split(",");
    }
    throw new Error("invalid_persona_presentation_schema_result");
  };
  const columns = normalizeNames(state.columns).sort();
  const constraints = normalizeNames(state.constraints).sort();
  const expectedSortedColumns = [...expectedColumns].sort();
  const expectedSortedConstraints = [...expectedConstraints].sort();
  if (columns.length === 0 && constraints.length === 0) return "ready";
  if (
    JSON.stringify(columns) === JSON.stringify(expectedSortedColumns) &&
    JSON.stringify(constraints) === JSON.stringify(expectedSortedConstraints)
  ) {
    return "deployed";
  }
  throw new Error("mixed_persona_presentation_schema_state");
}

function loadStatements() {
  const contents = fs.readFileSync(migrationPath, "utf8");
  if (/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(contents)) {
    throw new Error("Persona presentation migration must be additive");
  }
  const statements = contents
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (
    statements.length !== 7 ||
    statements.some(
      (statement) =>
        !/^ALTER TABLE "persona_assignment" ADD (COLUMN|CONSTRAINT) /i.test(
          statement,
        ),
    )
  ) {
    throw new Error("Unexpected persona presentation migration statement");
  }
  return statements;
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
        "persona_presentation_schema_deployed",
        "drizzle:0010",
        JSON.stringify({ migration: "0010", additive: true }),
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
  if (command === "plan") {
    console.log(JSON.stringify({ status: before }, null, 2));
    return;
  }
  if (command === "verify") {
    if (before !== "deployed") throw new Error("Persona presentation schema is not deployed");
    console.log(JSON.stringify({ status: before }, null, 2));
    return;
  }
  if (before === "deployed") {
    console.log(JSON.stringify({ status: before }, null, 2));
    return;
  }
  if (process.env.PERSONA_SCHEMA_CONFIRM !== "ADD_PERSONA_PRESENTATION_SCHEMA_0010") {
    throw new Error(
      "PERSONA_SCHEMA_CONFIRM must equal ADD_PERSONA_PRESENTATION_SCHEMA_0010",
    );
  }
  const actor = requiredEnvironment("PERSONA_SCHEMA_ACTOR");
  const statements = await applySchema(client, actor);
  const after = classifySchema(await inspectSchema(client));
  if (after !== "deployed") throw new Error("Persona presentation schema verification failed");
  console.log(JSON.stringify({ status: after, statements }, null, 2));
}

module.exports = { classifySchema, loadStatements, parseCommand };

if (require.main === module) {
  run().catch((error) => {
    const kind = error instanceof Error ? error.name : "non-Error rejection";
    console.error(`Persona presentation schema command failed (${kind})`);
    process.exitCode = 1;
  });
}
