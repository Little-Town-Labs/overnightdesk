const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { neon } = require("@neondatabase/serverless");
const { drizzle } = require("drizzle-orm/neon-http");
const { sql } = require("drizzle-orm");

const repo = path.resolve(__dirname, "..");
const adminUrl = process.env.DATABASE_TEST_URL;
const productionUrl = process.env.DATABASE_URL;
const databaseName = `overnightdesk_oidc_${Date.now()}_${process.pid}`;
let currentStage = "validate test database";

if (!adminUrl) {
  throw new Error("DATABASE_TEST_URL is required");
}
if (productionUrl && productionUrl === adminUrl) {
  throw new Error("DATABASE_TEST_URL must not equal DATABASE_URL");
}
if (!/^[a-z0-9_]+$/.test(databaseName)) {
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

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status}`);
  }
}

async function main() {
  const targetUrl = databaseUrl(databaseName);
  let created = false;

  try {
    currentStage = "create disposable database";
    await execute(adminUrl, `CREATE DATABASE "${databaseName}"`);
    created = true;
    console.log(`Created disposable database ${databaseName}`);

    currentStage = "apply migrations";
    const migrations = fs
      .readdirSync(path.join(repo, "drizzle"))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    for (const migration of migrations) {
      const contents = fs.readFileSync(
        path.join(repo, "drizzle", migration),
        "utf8"
      );
      const statements = contents
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await execute(targetUrl, statement);
      }
      console.log(`Applied ${migration}`);
    }

    currentStage = "run database constraints";
    run(
      "npm",
      [
        "test",
        "--",
        "--runInBand",
        "src/db/__tests__/schema-constraints.test.ts",
      ],
      { DATABASE_TEST_URL: targetUrl }
    );

    currentStage = "run OIDC exchange matrix";
    run("npx", ["--no-install", "tsx", "scripts/qualify-hermes-oidc.ts"], {
      DATABASE_URL: targetUrl,
      DATABASE_TEST_URL: targetUrl,
      BETTER_AUTH_URL: "https://www.overnightdesk.com",
      NEXT_PUBLIC_APP_URL: "https://www.overnightdesk.com",
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
    });
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
    `Hermes OIDC database qualification failed during ${currentStage} (${kind})`
  );
  process.exitCode = 1;
});
