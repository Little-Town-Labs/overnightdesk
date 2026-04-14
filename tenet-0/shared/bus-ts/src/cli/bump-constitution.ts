#!/usr/bin/env node
// CLI wrapper around bumpConstitution. Invoked from tenet-0/db/migrate.sh.
//
// Usage:
//   bump-constitution --prose PATH --rules PATH [--published-by NAME]
//
// Required env:
//   TENET0_ADMIN_URL   Admin Postgres URL (needs EXECUTE on activate_constitution)

import { readFileSync } from "node:fs";
import { exit } from "node:process";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { bumpConstitution } from "../migrator.js";

function printHelp(): void {
  console.log(`bump-constitution — activate a new Tenet-0 constitution version

Usage:
  bump-constitution --prose constitution.md --rules constitution-rules.yaml [--published-by NAME]

Env:
  TENET0_ADMIN_URL   Admin Postgres URL (required)`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      prose: { type: "string" },
      rules: { type: "string" },
      "published-by": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help) {
    printHelp();
    return;
  }
  if (!values.prose || !values.rules) {
    throw new Error("--prose and --rules are required");
  }

  const adminUrl = process.env.TENET0_ADMIN_URL;
  if (!adminUrl) {
    throw new Error("TENET0_ADMIN_URL env var required");
  }

  const proseText = readFileSync(values.prose, "utf8");
  const rulesYaml = readFileSync(values.rules, "utf8");

  const pool = new Pool({ connectionString: adminUrl });
  try {
    const result = await bumpConstitution({
      pool,
      proseText,
      rulesYaml,
      publishedBy: values["published-by"] ?? process.env.USER ?? "unknown",
    });
    if (result.action === "unchanged") {
      console.log(
        `No change — version ${result.versionId} already matches these SHAs.`,
      );
    } else {
      console.log(
        `Activated version ${result.versionId} (${result.rulesInserted} rules) — prose ${result.proseSha256.slice(0, 12)} / rules ${result.rulesSha256.slice(0, 12)}`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`bump-constitution: ${(err as Error).message}`);
  exit(1);
});
