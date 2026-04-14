// Test-only helpers: spin up a disposable per-test Postgres database seeded
// with the Tenet-0 migrations. Mirrors testutil/testdb.go.

import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RuleSpec {
  id: string;
  pattern: string;
  approvalMode?: "per_action" | "blanket_category" | "none" | "";
  category?: string;
}

export class TestDB {
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

  static async create(): Promise<TestDB | null> {
    const adminUrl = process.env.PG_TEST_ADMIN_URL;
    if (!adminUrl) return null;

    const suffix = randomBytes(4).toString("hex");
    const dbName = `tenet0_test_ts_${suffix}`;

    const adminClient = new Client({ connectionString: adminUrl });
    await adminClient.connect();
    try {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      await adminClient.query(`
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
      await adminClient.end();
    }

    const url = swapDatabase(adminUrl, dbName);

    // Apply migrations on a dedicated connection before opening the pool.
    const migrationClient = new Client({ connectionString: url });
    await migrationClient.connect();
    try {
      for (const path of migrationPaths()) {
        const sql = readFileSync(path, "utf8");
        await migrationClient.query(sql);
      }
    } finally {
      await migrationClient.end();
    }

    const pool = new Pool({ connectionString: url });
    return new TestDB(adminUrl, url, dbName, pool);
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

  async seedConstitution(rules: RuleSpec[] = []): Promise<number> {
    const { rows } = await this.pool.query<{ version_id: string | number }>(
      `INSERT INTO constitution_versions
         (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING version_id`,
      ["test-prose-hash", "test-rules-hash", "test prose", "rules: []", "test"],
    );
    const versionId = Number(rows[0].version_id);
    for (const r of rules) {
      await this.pool.query(
        `INSERT INTO constitution_rules
           (constitution_version_id, rule_id, event_type_pattern, requires_approval_mode, approval_category)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          versionId,
          r.id,
          r.pattern,
          r.approvalMode ?? null,
          r.category ?? null,
        ],
      );
    }
    return versionId;
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
    const adminClient = new Client({ connectionString: this.adminUrl });
    await adminClient.connect();
    try {
      await adminClient.query(`DROP DATABASE IF EXISTS ${this.name} WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }
}

function swapDatabase(raw: string, newDb: string): string {
  const url = new URL(raw);
  url.pathname = "/" + newDb;
  return url.toString();
}

function migrationPaths(): string[] {
  // test/ sits at tenet-0/shared/bus-ts/test/. Walk up twice to reach bus-ts,
  // up one more to shared, then one more to tenet-0.
  const base = join(__dirname, "..", "..", "..");
  const migDir = join(base, "db", "migrations");
  return readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(migDir, f));
}
