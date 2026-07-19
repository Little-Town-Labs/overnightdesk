const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { neon } = require("@neondatabase/serverless");
const { drizzle } = require("drizzle-orm/neon-http");
const { sql } = require("drizzle-orm");

const repo = path.resolve(__dirname, "..");
const adminUrl = process.env.DATABASE_TEST_URL;
const productionUrl = process.env.DATABASE_URL;
const databaseName = `overnightdesk_identity_${Date.now()}_${process.pid}`;
let currentStage = "validate test database";

if (!adminUrl) throw new Error("DATABASE_TEST_URL is required");
if (productionUrl && productionUrl === adminUrl) {
  throw new Error("DATABASE_TEST_URL must not equal DATABASE_URL");
}
if (!/^overnightdesk_identity_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error("Invalid disposable database name");
}

function databaseUrl(name) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function execute(url, statement) {
  await drizzle(neon(url)).execute(sql.raw(statement));
}

function runIntegrationTest(targetUrl) {
  const result = spawnSync(
    "npm",
    [
      "test",
      "--",
      "--runInBand",
      "src/db/__tests__/identity-backfill-store.integration.test.ts",
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        DATABASE_TEST_URL: targetUrl,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`identity integration test exited ${result.status}`);
  }
}

function runSchemaApply(targetUrl) {
  const result = spawnSync("npm", ["run", "identity:schema:apply"], {
    cwd: repo,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      IDENTITY_SCHEMA_ACTOR: "operator:identity-qualification",
      IDENTITY_SCHEMA_CONFIRM: "ADD_IDENTITY_SCHEMA_0009",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`identity schema command exited ${result.status}`);
  }
}

async function applyBaselineMigrations(targetUrl) {
  const migrations = fs
    .readdirSync(path.join(repo, "drizzle"))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .filter((name) => name < "0009_")
    .sort();
  for (const migration of migrations) {
    const contents = fs.readFileSync(
      path.join(repo, "drizzle", migration),
      "utf8",
    );
    const statements = contents
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await execute(targetUrl, statement);
  }
  console.log(`Applied ${migrations.length} baseline migrations`);
}

async function main() {
  const targetUrl = databaseUrl(databaseName);
  let created = false;
  try {
    currentStage = "create disposable database";
    await execute(adminUrl, `CREATE DATABASE "${databaseName}"`);
    created = true;
    console.log(`Created disposable database ${databaseName}`);

    currentStage = "apply baseline migrations";
    await applyBaselineMigrations(targetUrl);

    currentStage = "apply identity schema through production command";
    runSchemaApply(targetUrl);

    currentStage = "run identity backfill integration test";
    runIntegrationTest(targetUrl);
  } finally {
    if (created) {
      currentStage = "drop disposable database";
      await execute(adminUrl, `DROP DATABASE "${databaseName}" WITH (FORCE)`);
      console.log(`Dropped disposable database ${databaseName}`);
    }
  }
}

main().catch((error) => {
  const kind = error instanceof Error ? error.name : "non-Error rejection";
  console.error(
    `Identity backfill qualification failed during ${currentStage} (${kind})`,
  );
  process.exitCode = 1;
});
