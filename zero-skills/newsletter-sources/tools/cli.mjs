#!/usr/bin/env node
// Newsletter sources CLI — manage oc_newsletter_sources on deploy-postgres-1.
//
// Usage:
//   node cli.mjs list                                  — show active sources
//   node cli.mjs list --all                            — show all rows incl. inactive
//   node cli.mjs add <sender> <label>                  — upsert + active=true
//   node cli.mjs disable <sender>                      — set active=false (LIKE match)
//   node cli.mjs enable  <sender>                      — set active=true  (LIKE match)
//   node cli.mjs remove  <sender>                      — delete row (LIKE match)
//
// Reads DATABASE_URL from env. Must be run inside overnightdesk-tenant-0.

import { Pool } from "pg";

const dsn = process.env.DATABASE_URL;
if (!dsn) {
  console.error("DATABASE_URL env var is required");
  process.exit(2);
}
const pool = new Pool({ connectionString: dsn });

const [, , cmd, ...args] = process.argv;

async function list(all = false) {
  const { rows } = await pool.query(
    all
      ? `SELECT sender, label, active FROM oc_newsletter_sources ORDER BY sender`
      : `SELECT sender, label FROM oc_newsletter_sources WHERE active=true ORDER BY sender`,
  );
  console.log(JSON.stringify(rows, null, 2));
}

async function add(sender, label) {
  if (!sender || !label) throw new Error("add requires <sender> <label>");
  const { rows } = await pool.query(
    `INSERT INTO oc_newsletter_sources (sender, label, active)
     VALUES ($1, $2, true)
     ON CONFLICT (sender) DO UPDATE SET label=EXCLUDED.label, active=true
     RETURNING sender, label, active`,
    [sender, label],
  );
  console.log(JSON.stringify(rows[0], null, 2));
}

async function setActive(pattern, active) {
  if (!pattern) throw new Error("pattern required");
  const { rows } = await pool.query(
    `UPDATE oc_newsletter_sources SET active=$2
     WHERE sender ILIKE '%' || $1 || '%'
     RETURNING sender, label, active`,
    [pattern, active],
  );
  if (rows.length === 0) {
    console.error(`no rows matched pattern: ${pattern}`);
    process.exitCode = 3;
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

async function remove(pattern) {
  if (!pattern) throw new Error("pattern required");
  const { rows } = await pool.query(
    `DELETE FROM oc_newsletter_sources
     WHERE sender ILIKE '%' || $1 || '%'
     RETURNING sender, label`,
    [pattern],
  );
  if (rows.length === 0) {
    console.error(`no rows matched pattern: ${pattern}`);
    process.exitCode = 3;
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

try {
  switch (cmd) {
    case "list":    await list(args.includes("--all")); break;
    case "add":     await add(args[0], args.slice(1).join(" ")); break;
    case "disable": await setActive(args[0], false); break;
    case "enable":  await setActive(args[0], true); break;
    case "remove":  await remove(args[0]); break;
    default:
      console.error(
        "usage: cli.mjs (list [--all] | add <sender> <label> | enable <pattern> | disable <pattern> | remove <pattern>)",
      );
      process.exitCode = 2;
  }
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
