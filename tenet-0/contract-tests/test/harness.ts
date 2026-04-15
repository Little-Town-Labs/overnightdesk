// Shared harness: disposable test DB + Go CLI spawner.
// Mirrors bus-ts/test/testdb.ts but adds helpers specifically for the
// Go↔TS interop scenarios.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root discovery: contract-tests/test/harness.ts → ../../../
const REPO_ROOT = join(__dirname, "..", "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "tenet-0", "db", "migrations");
const GO_CLI = join(REPO_ROOT, "tenet-0", "contract-tests", "bin", "contract-cli");

export class ContractDB {
  readonly adminUrl: string;
  readonly url: string;
  readonly name: string;
  readonly pool: Pool;

  private constructor(adminUrl: string, url: string, name: string, pool: Pool) {
    this.adminUrl = adminUrl;
    this.url = url;
    this.name = name;
    this.pool = pool;
  }

  static async create(): Promise<ContractDB | null> {
    const adminUrl = process.env.PG_TEST_ADMIN_URL;
    if (!adminUrl) return null;

    const suffix = randomBytes(4).toString("hex");
    const dbName = `tenet0_contract_${suffix}`;

    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${dbName}`);
      await admin.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_admin') THEN
            CREATE ROLE tenet0_admin NOINHERIT;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_app') THEN
            CREATE ROLE tenet0_app NOINHERIT;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_secops') THEN
            CREATE ROLE tenet0_secops NOINHERIT;
          END IF;
        END $$;`);
    } finally {
      await admin.end();
    }

    const url = swapDatabase(adminUrl, dbName);
    const migClient = new Client({ connectionString: url });
    await migClient.connect();
    try {
      for (const m of migrationPaths()) {
        await migClient.query(readFileSync(m, "utf8"));
      }
    } finally {
      await migClient.end();
    }

    const pool = new Pool({ connectionString: url });
    return new ContractDB(adminUrl, url, dbName, pool);
  }

  async seedDepartment(id: string, namespace: string): Promise<string> {
    const credential = `${id}-cred-${randomBytes(2).toString("hex")}`;
    await this.pool.query(
      `INSERT INTO departments (id, namespace_prefix, credential_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf')))`,
      [id, namespace, credential],
    );
    return credential;
  }

  async seedConstitution(): Promise<number> {
    const { rows } = await this.pool.query<{ version_id: number }>(
      `INSERT INTO constitution_versions
         (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
       VALUES ('h','h','contract prose','rules: []','test', true)
       RETURNING version_id`,
    );
    return Number(rows[0].version_id);
  }

  async seedBudget(departmentId: string, limitCents: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents)
       VALUES ($1, date_trunc('month', current_date)::date, $2)`,
      [departmentId, limitCents],
    );
  }

  async close(): Promise<void> {
    await this.pool.end().catch(() => {});
    const admin = new Client({ connectionString: this.adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${this.name} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}

// runGoCLI spawns the Go contract CLI with the given subcommand + args,
// passing TENET0_PG_URL, TENET0_DEPARTMENT, TENET0_CREDENTIAL via env.
// Returns parsed JSON from stdout. Throws on non-zero exit.
//
// If onReady is provided, the promise it returns resolves when the CLI
// writes "contract-cli: subscribe ready" to stderr. Callers waiting to
// publish AFTER the Go subscriber's LISTEN is registered pass an onReady
// so the test does not rely on a hard-coded sleep.
export async function runGoCLI(args: {
  subcommand: string;
  cliArgs: string[];
  pgUrl: string;
  department: string;
  credential: string;
  timeoutMs?: number;
  onReady?: () => void;
}): Promise<unknown> {
  if (!existsSync(GO_CLI)) {
    throw new Error(
      `contract-cli binary missing at ${GO_CLI}. Build with: cd tenet-0/shared/bus-go && go build -o ../../contract-tests/bin/contract-cli ./cmd/contract-cli`,
    );
  }
  return await new Promise((resolve, reject) => {
    const proc = spawn(GO_CLI, [args.subcommand, ...args.cliArgs], {
      env: {
        ...process.env,
        TENET0_PG_URL: args.pgUrl,
        TENET0_DEPARTMENT: args.department,
        TENET0_CREDENTIAL: args.credential,
      },
    });
    let out = "";
    let err = "";
    let settled = false;
    let readyFired = false;
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => {
      const chunk = d.toString();
      err += chunk;
      if (
        !readyFired &&
        args.onReady &&
        chunk.includes("contract-cli: subscribe ready")
      ) {
        readyFired = true;
        args.onReady();
      }
    });

    const timer = args.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          proc.kill("SIGKILL");
          reject(
            new Error(
              `contract-cli ${args.subcommand} timed out after ${args.timeoutMs}ms: ${err}`,
            ),
          );
        }, args.timeoutMs)
      : null;

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `contract-cli ${args.subcommand} exited ${code}: ${err || out}`,
          ),
        );
        return;
      }
      try {
        resolve(out.trim() ? JSON.parse(out) : null);
      } catch {
        reject(
          new Error(
            `contract-cli ${args.subcommand}: invalid JSON output: ${out}`,
          ),
        );
      }
    });
  });
}

function swapDatabase(raw: string, newDb: string): string {
  const u = new URL(raw);
  u.pathname = "/" + newDb;
  return u.toString();
}

function migrationPaths(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));
}
