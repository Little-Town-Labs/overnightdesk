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

function runIntegrationTests(targetUrl) {
  const result = spawnSync(
    "npm",
    [
      "test",
      "--",
      "--runInBand",
      "src/db/__tests__/identity-backfill-store.integration.test.ts",
      "src/db/__tests__/use-case-membership-store.integration.test.ts",
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
    throw new Error(`identity integration tests exited ${result.status}`);
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

function runPersonaSchemaApply(targetUrl) {
  const result = spawnSync("npm", ["run", "identity:persona-schema:apply"], {
    cwd: repo,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      PERSONA_SCHEMA_ACTOR: "operator:identity-qualification",
      PERSONA_SCHEMA_CONFIRM: "ADD_PERSONA_PRESENTATION_SCHEMA_0010",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`persona schema command exited ${result.status}`);
  }
}

function runCompatibilityVerification(targetUrl, mode) {
  const result = spawnSync("npm", ["run", "identity:compatibility:verify"], {
    cwd: repo,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      CANONICAL_IDENTITY_READ_MODE: mode,
      IDENTITY_COMPARISON_CONFIRM:
        mode === "compare" ? "COMPARE_TENET_1_SHADOW" : "",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`identity compatibility ${mode} exited ${result.status}`);
  }
}

function runFoundationVerify(targetUrl) {
  const result = spawnSync("npm", ["run", "identity:foundation:verify"], {
    cwd: repo,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      IDENTITY_FOUNDATION_ACTOR: "operator:identity-qualification",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`identity foundation verify exited ${result.status}`);
  }
}

function runWalterFoundationVerify(targetUrl) {
  const result = spawnSync(
    "npm",
    ["run", "identity:walter:foundation:verify"],
    {
      cwd: repo,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        IDENTITY_FOUNDATION_ACTOR: "operator:identity-qualification",
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Walter identity foundation verify exited ${result.status}`,
    );
  }
}

function runWalterMembershipVerify(targetUrl, membershipUserId) {
  const result = spawnSync(
    "npm",
    ["run", "identity:walter:membership:verify"],
    {
      cwd: repo,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        IDENTITY_MEMBERSHIP_ACTOR: "operator:identity-qualification",
        GARY_BETTER_AUTH_USER_ID: membershipUserId,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Walter identity membership verify exited ${result.status}`,
    );
  }
}

function runTitusCommand(targetUrl, scope, command, membershipUserId) {
  const environment = {
    ...process.env,
    DATABASE_URL: targetUrl,
    IDENTITY_FOUNDATION_ACTOR: "operator:identity-qualification",
    IDENTITY_MEMBERSHIP_ACTOR: "operator:identity-qualification",
    IDENTITY_FOUNDATION_CONFIRM: "TENET_2_TITUS_FOUNDATION",
    IDENTITY_MEMBERSHIP_CONFIRM: "ACTIVATE_TENET_2_GARY",
    GARY_BETTER_AUTH_USER_ID: membershipUserId,
  };
  const result = spawnSync(
    "npm",
    ["run", `identity:titus:${scope}:${command}`],
    { cwd: repo, env: environment, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Titus identity ${scope} ${command} exited ${result.status}`,
    );
  }
}

function runTitusOpenWebuiCommand(targetUrl, command) {
  const confirmations = {
    apply: "PROVISION_TITUS_OPEN_WEBUI_DISABLED",
    enable: "ENABLE_TITUS_OPEN_WEBUI_CLIENT",
    disable: "ROLLBACK_TITUS_OPEN_WEBUI_CLIENT",
    "refresh:apply": "ENABLE_TITUS_OPEN_WEBUI_REFRESH_CONTRACT",
  };
  const result = spawnSync("npm", ["run", `open-webui:titus:${command}`], {
    cwd: repo,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl,
      TITUS_OPEN_WEBUI_ACTOR: "operator:identity-qualification",
      TITUS_OPEN_WEBUI_CONFIRM: confirmations[command] ?? "",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Titus Open WebUI ${command} exited ${result.status}`);
  }
}

async function restoreLegacyTitusOpenWebuiRefreshFixture(targetUrl) {
  const database = drizzle(neon(targetUrl));
  const result = await database.execute(sql`
    UPDATE oauth_client
    SET scopes = ARRAY['openid', 'email', 'profile']::text[],
        grant_types = ARRAY['authorization_code']::text[],
        updated_at = NOW()
    WHERE client_id = 'overnightdesk-open-webui-titus-v1'
    RETURNING id
  `);
  if (result.rows.length !== 1) {
    throw new Error("Expected one Titus Open WebUI client fixture");
  }
}

async function readWalterMembershipUserId(targetUrl) {
  const database = drizzle(neon(targetUrl));
  const result = await database.execute(sql`
    SELECT membership.user_id
    FROM use_case_membership AS membership
    INNER JOIN use_case_number_allocation AS allocation
      ON allocation.use_case_id = membership.use_case_id
    WHERE allocation.number = 0
      AND membership.status = 'active'
  `);
  if (result.rows.length !== 1 || typeof result.rows[0]?.user_id !== "string") {
    throw new Error("Expected one active Walter membership fixture");
  }
  return result.rows[0].user_id;
}

async function readTitusMembershipUserId(targetUrl) {
  const database = drizzle(neon(targetUrl));
  const result = await database.execute(sql`
    SELECT membership.user_id
    FROM use_case_membership AS membership
    INNER JOIN use_case_number_allocation AS allocation
      ON allocation.use_case_id = membership.use_case_id
    WHERE allocation.number = 2
      AND membership.status = 'active'
  `);
  if (result.rows.length !== 1 || typeof result.rows[0]?.user_id !== "string") {
    throw new Error("Expected one active Titus membership fixture");
  }
  return result.rows[0].user_id;
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

    currentStage = "apply persona schema through production command";
    runPersonaSchemaApply(targetUrl);

    currentStage = "run identity integration tests";
    runIntegrationTests(targetUrl);

    currentStage = "run canonical shadow comparison";
    runCompatibilityVerification(targetUrl, "compare");

    currentStage = "prove legacy feature-flag rollback";
    runCompatibilityVerification(targetUrl, "legacy");

    currentStage = "verify additive foundation remains after rollback";
    runFoundationVerify(targetUrl);

    currentStage = "verify Walter foundation through operator command";
    runWalterFoundationVerify(targetUrl);

    currentStage = "verify Gary membership through separate operator command";
    runWalterMembershipVerify(
      targetUrl,
      await readWalterMembershipUserId(targetUrl),
    );

    const titusMembershipUserId = await readTitusMembershipUserId(targetUrl);
    currentStage = "verify Titus foundation through operator command";
    runTitusCommand(targetUrl, "foundation", "verify", titusMembershipUserId);

    currentStage = "prove Titus foundation confirmation and idempotent apply";
    runTitusCommand(targetUrl, "foundation", "apply", titusMembershipUserId);

    currentStage = "verify Gary Titus membership through operator command";
    runTitusCommand(targetUrl, "membership", "verify", titusMembershipUserId);

    currentStage = "prove Titus membership confirmation and idempotent apply";
    runTitusCommand(targetUrl, "membership", "apply", titusMembershipUserId);

    currentStage = "plan Titus Open WebUI disabled provisioning";
    runTitusOpenWebuiCommand(targetUrl, "plan");

    currentStage = "apply Titus Open WebUI disabled provisioning";
    runTitusOpenWebuiCommand(targetUrl, "apply");

    currentStage = "verify Titus Open WebUI disabled provisioning";
    runTitusOpenWebuiCommand(targetUrl, "verify");

    currentStage = "restore pre-refresh Titus Open WebUI client fixture";
    await restoreLegacyTitusOpenWebuiRefreshFixture(targetUrl);

    currentStage = "plan Titus Open WebUI refresh contract update";
    runTitusOpenWebuiCommand(targetUrl, "refresh:plan");

    currentStage = "apply Titus Open WebUI refresh contract update";
    runTitusOpenWebuiCommand(targetUrl, "refresh:apply");

    currentStage = "verify Titus Open WebUI refresh contract update";
    runTitusOpenWebuiCommand(targetUrl, "refresh:verify");

    currentStage = "enable Titus Open WebUI OIDC client";
    runTitusOpenWebuiCommand(targetUrl, "enable");

    currentStage = "verify Titus Open WebUI enabled provisioning";
    runTitusOpenWebuiCommand(targetUrl, "verify");

    currentStage = "rollback Titus Open WebUI OIDC client";
    runTitusOpenWebuiCommand(targetUrl, "disable");

    currentStage = "verify Titus Open WebUI disabled rollback";
    runTitusOpenWebuiCommand(targetUrl, "verify");
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
