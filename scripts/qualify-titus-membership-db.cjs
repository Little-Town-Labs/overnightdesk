const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { neon } = require("@neondatabase/serverless");
const { drizzle } = require("drizzle-orm/neon-http");
const { sql } = require("drizzle-orm");

const repo = path.resolve(__dirname, "..");
const adminUrl = process.env.DATABASE_TEST_URL;
const productionUrl = process.env.DATABASE_URL;
const databaseName = `overnightdesk_identity_titus_membership_${Date.now()}_${process.pid}`;
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

function database(url) {
  return drizzle(neon(url));
}

async function executeRaw(url, statement) {
  await database(url).execute(sql.raw(statement));
}

function runCommand(
  targetUrl,
  command,
  state,
  confirmation,
  expectFailure = false,
) {
  const result = spawnSync(
    "npx",
    [
      "--no-install",
      "tsx",
      "scripts/titus-membership-qualification.ts",
      command,
      state,
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        TITUS_MEMBERSHIP_QUALIFICATION_ACTOR: "operator:feature-024-disposable",
        ...(confirmation
          ? { TITUS_MEMBERSHIP_QUALIFICATION_CONFIRM: confirmation }
          : {}),
      },
      encoding: "utf8",
    },
  );
  if (expectFailure) {
    if (result.status === 0) {
      throw new Error(`Expected ${command} ${state} to fail`);
    }
    if (
      result.stderr.trim() !== "Titus membership qualification operation failed"
    ) {
      throw new Error("Qualification failure output was not bounded");
    }
    return null;
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${state} exited ${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function runSharedStoreQualification(targetUrl) {
  const result = spawnSync(
    "npx",
    [
      "--no-install",
      "jest",
      "src/db/__tests__/use-case-membership-store.integration.test.ts",
      "--runInBand",
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl,
        DATABASE_TEST_URL: targetUrl,
      },
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Shared membership store exited ${result.status}`);
  }
}

async function seedExactTarget(targetUrl, ids) {
  const target = database(targetUrl);
  await target.execute(sql`
    INSERT INTO "user" (
      id, name, email, email_verified, email_opt_out
    ) VALUES (
      ${ids.userId}, 'Disposable Titus Owner',
      'disposable-titus-owner@example.invalid', true, false
    )
  `);
  await target.execute(sql`
    INSERT INTO use_case (id, slug, display_name, status)
    VALUES (
      ${ids.useCaseId}, 'timeless-tech-solutions',
      'Timeless Tech Solutions operations and collaboration', 'active'
    )
  `);
  await target.execute(sql`
    INSERT INTO runtime_identity (
      id, use_case_id, slug, memory_boundary_kind, status
    ) VALUES (
      ${ids.runtimeIdentityId}, ${ids.useCaseId}, 'hermes-titus',
      'docker_named_volume', 'active'
    )
  `);
  await target.execute(sql`
    INSERT INTO use_case_membership (
      id, use_case_id, runtime_identity_id, user_id, role, status,
      granted_by, activated_at
    ) VALUES (
      ${ids.membershipId}, ${ids.useCaseId}, NULL, ${ids.userId}, 'owner',
      'active', 'operator:feature-024-disposable', NOW()
    )
  `);
  await target.execute(sql`
    INSERT INTO oauth_client (
      id, client_id, disabled, redirect_uris, token_endpoint_auth_method,
      grant_types, response_types, public, require_pkce
    ) VALUES (
      ${ids.oauthId}, ${ids.clientId}, false,
      ARRAY['https://titus-dashboard.overnightdesk.com/auth/callback'],
      'none', ARRAY['authorization_code'], ARRAY['code'], true, true
    )
  `);
  await target.execute(sql`
    INSERT INTO instance (
      id, user_id, tenant_id, use_case_id, runtime_identity_id, status,
      container_id, subdomain, hermes_oidc_client_id,
      hermes_dashboard_auth_status
    ) VALUES (
      ${ids.instanceId}, ${ids.userId}, 'titus-dashboard', ${ids.useCaseId},
      ${ids.runtimeIdentityId}, 'running', 'hermes-titus',
      'titus-dashboard.overnightdesk.com', ${ids.clientId}, 'active'
    )
  `);
  await target.execute(sql`
    INSERT INTO resource_binding (
      id, use_case_id, runtime_identity_id, provider, kind, value, state
    ) VALUES (
      ${ids.bindingId}, ${ids.useCaseId}, ${ids.runtimeIdentityId},
      'better-auth', 'oidc_client', ${ids.clientId}, 'active'
    )
  `);
}

async function assertMembership(
  targetUrl,
  expectedState,
  expectedAuditCount,
  ids,
) {
  const result = await database(targetUrl).execute(sql`
    SELECT
      status,
      activated_at IS NOT NULL AS activated,
      suspended_at IS NOT NULL AS suspended,
      expires_at IS NOT NULL AND expires_at <= NOW() AS expired,
      revoked_at IS NOT NULL AS revoked
    FROM use_case_membership
    WHERE id = ${ids.membershipId}
  `);
  if (result.rows.length !== 1) {
    throw new Error("Expected one disposable Titus membership");
  }
  const row = result.rows[0];
  const matches =
    row.activated === true &&
    row.revoked === false &&
    ((expectedState === "active" &&
      row.status === "active" &&
      row.suspended === false &&
      row.expired === false) ||
      (expectedState === "non_member" &&
        row.status === "invited" &&
        row.suspended === false &&
        row.expired === false) ||
      (expectedState === "suspended" &&
        row.status === "active" &&
        row.suspended === true &&
        row.expired === false) ||
      (expectedState === "expired" &&
        row.status === "active" &&
        row.suspended === false &&
        row.expired === true));
  if (!matches) {
    throw new Error(`Unexpected disposable membership state ${expectedState}`);
  }

  const audits = await database(targetUrl).execute(sql`
    SELECT actor, action, target, details
    FROM platform_audit_log
    WHERE action = 'titus_membership_qualification_transition'
    ORDER BY id
  `);
  if (audits.rows.length !== expectedAuditCount) {
    throw new Error("Unexpected qualification audit count");
  }
  const serialized = JSON.stringify(audits.rows);
  for (const forbidden of [
    ids.userId,
    ids.membershipId,
    "disposable-titus-owner@example.invalid",
    ids.clientId,
    "cookie",
    "token",
    "secret",
  ]) {
    if (serialized.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error("Qualification audit included forbidden detail");
    }
  }
  for (const audit of audits.rows) {
    if (
      audit.actor !== "operator:feature-024-disposable" ||
      audit.target !== "titus-membership-qualification" ||
      audit.details.membershipCount !== 1 ||
      Object.keys(audit.details).sort().join(",") !==
        "fromState,membershipCount,toState"
    ) {
      throw new Error("Qualification audit contract mismatch");
    }
  }
}

async function setDashboardBoundary(targetUrl, ids, active) {
  const target = database(targetUrl);
  await target.execute(sql`
    UPDATE instance
    SET
      status = ${active ? "running" : "stopped"}::instance_status,
      hermes_dashboard_auth_status =
        ${active ? "active" : "disabled"}::hermes_dashboard_auth_status
    WHERE id = ${ids.instanceId}
  `);
  await target.execute(sql`
    UPDATE oauth_client
    SET disabled = ${!active}
    WHERE id = ${ids.oauthId}
  `);
  await target.execute(sql`
    UPDATE resource_binding
    SET state = ${active ? "active" : "rollback"}::resource_binding_state
    WHERE id = ${ids.bindingId}
  `);
}

async function exerciseTransition(
  targetUrl,
  state,
  beginConfirmation,
  restoreConfirmation,
  auditOffset,
  ids,
  degradeBoundaryBeforeRestore = false,
) {
  const plan = runCommand(targetUrl, "plan", state);
  if (
    plan.status !== "ready" ||
    plan.currentState !== "active" ||
    plan.desiredState !== state ||
    plan.membershipCount !== 1
  ) {
    throw new Error(`Unexpected ${state} plan`);
  }
  const applied = runCommand(targetUrl, "apply", state, beginConfirmation);
  if (applied.status !== "verified" || applied.state !== state) {
    throw new Error(`Unexpected ${state} apply result`);
  }
  const verified = runCommand(targetUrl, "verify", state);
  if (verified.status !== "verified" || verified.state !== state) {
    throw new Error(`Unexpected ${state} verify result`);
  }
  await assertMembership(targetUrl, state, auditOffset + 1, ids);

  if (degradeBoundaryBeforeRestore) {
    await setDashboardBoundary(targetUrl, ids, false);
  }
  const restorePlan = runCommand(targetUrl, "plan", "active");
  if (
    restorePlan.status !== "ready" ||
    restorePlan.currentState !== state ||
    restorePlan.desiredState !== "active"
  ) {
    throw new Error(`Unexpected ${state} restoration plan`);
  }
  const restored = runCommand(
    targetUrl,
    "apply",
    "active",
    restoreConfirmation,
  );
  if (restored.status !== "verified" || restored.state !== "active") {
    throw new Error(`Unexpected ${state} restoration result`);
  }
  runCommand(targetUrl, "verify", "active");
  await assertMembership(targetUrl, "active", auditOffset + 2, ids);
  if (degradeBoundaryBeforeRestore) {
    await setDashboardBoundary(targetUrl, ids, true);
  }
}

async function main() {
  const targetUrl = databaseUrl(databaseName);
  const ids = {
    userId: `disposable-user-${randomUUID()}`,
    useCaseId: randomUUID(),
    runtimeIdentityId: randomUUID(),
    membershipId: randomUUID(),
    oauthId: `disposable-oauth-${randomUUID()}`,
    clientId: `disposable_titus_${randomUUID().replaceAll("-", "")}`,
    instanceId: `disposable-instance-${randomUUID()}`,
    bindingId: randomUUID(),
  };
  let created = false;
  let failureStage = null;

  try {
    currentStage = "create disposable database";
    await executeRaw(adminUrl, `CREATE DATABASE "${databaseName}"`);
    created = true;

    currentStage = "apply migrations";
    const migrations = fs
      .readdirSync(path.join(repo, "drizzle"))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
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
      for (const statement of statements) {
        await executeRaw(targetUrl, statement);
      }
    }

    currentStage = "qualify shared membership store";
    runSharedStoreQualification(targetUrl);

    currentStage = "seed exact Titus target";
    await seedExactTarget(targetUrl, ids);

    currentStage = "prove missing confirmation fails closed";
    runCommand(targetUrl, "apply", "suspended", undefined, true);
    await assertMembership(targetUrl, "active", 0, ids);

    currentStage = "exercise non-member denial and restoration";
    await exerciseTransition(
      targetUrl,
      "non_member",
      "BEGIN_TITUS_NON_MEMBER_DENIAL",
      "RESTORE_TITUS_AFTER_NON_MEMBER_DENIAL",
      0,
      ids,
    );

    currentStage = "exercise suspended denial and restoration";
    await exerciseTransition(
      targetUrl,
      "suspended",
      "BEGIN_TITUS_SUSPENDED_DENIAL",
      "RESTORE_TITUS_AFTER_SUSPENDED_DENIAL",
      2,
      ids,
      true,
    );

    currentStage = "exercise expired denial and restoration";
    await exerciseTransition(
      targetUrl,
      "expired",
      "BEGIN_TITUS_EXPIRED_DENIAL",
      "RESTORE_TITUS_AFTER_EXPIRED_DENIAL",
      4,
      ids,
    );
    process.stdout.write(
      JSON.stringify({
        status: "passed",
        transitionsVerified: 6,
        auditRecordsVerified: 6,
        finalState: "active",
      }) + "\n",
    );
  } catch (error) {
    failureStage = currentStage;
    throw error;
  } finally {
    if (created) {
      currentStage = "drop disposable database";
      await executeRaw(
        adminUrl,
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    }
    if (failureStage) currentStage = failureStage;
  }
}

main().catch((error) => {
  const kind = error instanceof Error ? error.name : "non-Error rejection";
  process.stderr.write(
    `Titus membership database qualification failed during ${currentStage} (${kind})\n`,
  );
  process.exitCode = 1;
});
