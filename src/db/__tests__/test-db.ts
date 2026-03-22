import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../schema";

export type TestDb = NeonHttpDatabase<typeof schema>;

let _testDb: TestDb | null = null;

export function getTestDb(): TestDb {
  if (_testDb) return _testDb;

  const url = process.env.DATABASE_TEST_URL;
  if (!url) {
    throw new Error(
      "DATABASE_TEST_URL is required for integration tests. " +
        "Set it to a Neon branch or test database connection string."
    );
  }
  const client = neon(url);
  _testDb = drizzle(client, { schema });
  return _testDb;
}

export async function cleanupTestData() {
  const db = getTestDb();
  await db.execute(sql`DELETE FROM usage_metric`).catch(() => {});
  await db.execute(sql`DELETE FROM fleet_event`).catch(() => {});
  await db.execute(sql`DELETE FROM instance`).catch(() => {});
  await db.execute(sql`DELETE FROM subscription`).catch(() => {});
  await db.execute(sql`DELETE FROM session`).catch(() => {});
  await db.execute(sql`DELETE FROM account`).catch(() => {});
  await db.execute(sql`DELETE FROM verification`).catch(() => {});
  await db.execute(sql`DELETE FROM platform_audit_log`).catch(() => {});
  await db.execute(sql.raw(`DELETE FROM "user"`)).catch(() => {});
}
