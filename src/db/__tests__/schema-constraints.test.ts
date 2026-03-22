import { sql } from "drizzle-orm";
import { getTestDb, cleanupTestData, type TestDb } from "./test-db";
import * as schema from "../schema";

/**
 * Integration tests — require DATABASE_TEST_URL and migrated test database.
 * These verify database-level constraints (unique, FK, enum).
 */
const SKIP_DB = !process.env.DATABASE_TEST_URL;

const describeDb = SKIP_DB ? describe.skip : describe;

describeDb("database constraints", () => {
  let testDb: TestDb;

  beforeAll(() => {
    testDb = getTestDb();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // Helper to insert a test user
  async function insertTestUser(overrides: Partial<{ id: string; email: string; name: string }> = {}) {
    const id = overrides.id ?? crypto.randomUUID();
    const email = overrides.email ?? `test-${id}@example.com`;
    const name = overrides.name ?? "Test User";
    await testDb.insert(schema.user).values({ id, email, name });
    return { id, email, name };
  }

  // Helper to insert a test instance
  async function insertTestInstance(
    userId: string,
    overrides: Partial<{
      id: string;
      tenantId: string;
      subdomain: string;
      gatewayPort: number;
    }> = {}
  ) {
    const id = overrides.id ?? crypto.randomUUID();
    const tenantId = overrides.tenantId ?? `tenant-${id.slice(0, 8)}`;
    await testDb.insert(schema.instance).values({
      id,
      userId,
      tenantId,
      subdomain: overrides.subdomain ?? `${tenantId}.overnightdesk.com`,
      gatewayPort: overrides.gatewayPort ?? null,
    });
    return { id, tenantId };
  }

  describe("uniqueness constraints", () => {
    it("rejects duplicate user emails", async () => {
      await insertTestUser({ email: "dupe@example.com" });
      await expect(
        insertTestUser({ email: "dupe@example.com" })
      ).rejects.toThrow();
    });

    it("rejects duplicate instance tenant_id", async () => {
      const { id: userId } = await insertTestUser();
      await insertTestInstance(userId, { tenantId: "same-slug" });
      await expect(
        insertTestInstance(userId, { tenantId: "same-slug" })
      ).rejects.toThrow();
    });

    it("rejects duplicate instance subdomain", async () => {
      const { id: userId } = await insertTestUser();
      await insertTestInstance(userId, {
        tenantId: "slug-a",
        subdomain: "same.overnightdesk.com",
      });
      await expect(
        insertTestInstance(userId, {
          tenantId: "slug-b",
          subdomain: "same.overnightdesk.com",
        })
      ).rejects.toThrow();
    });

    it("rejects duplicate instance gateway_port", async () => {
      const { id: userId } = await insertTestUser();
      await insertTestInstance(userId, {
        tenantId: "port-a",
        subdomain: "port-a.overnightdesk.com",
        gatewayPort: 8001,
      });
      await expect(
        insertTestInstance(userId, {
          tenantId: "port-b",
          subdomain: "port-b.overnightdesk.com",
          gatewayPort: 8001,
        })
      ).rejects.toThrow();
    });

    it("rejects duplicate usage_metric (instance_id, metric_date)", async () => {
      const { id: userId } = await insertTestUser();
      const { id: instanceId } = await insertTestInstance(userId);
      const today = new Date().toISOString().split("T")[0];

      await testDb.insert(schema.usageMetric).values({
        instanceId,
        metricDate: today,
        claudeCalls: 5,
        toolExecutions: 10,
      });

      await expect(
        testDb.insert(schema.usageMetric).values({
          instanceId,
          metricDate: today,
          claudeCalls: 1,
          toolExecutions: 2,
        })
      ).rejects.toThrow();
    });
  });

  describe("enum constraints", () => {
    it("rejects invalid subscription status", async () => {
      const { id: userId } = await insertTestUser();
      await expect(
        testDb.execute(
          sql`INSERT INTO subscription (id, user_id, plan, status) VALUES (${crypto.randomUUID()}, ${userId}, 'starter', 'invalid_status')`
        )
      ).rejects.toThrow();
    });

    it("rejects invalid instance status", async () => {
      const { id: userId } = await insertTestUser();
      await expect(
        testDb.execute(
          sql`INSERT INTO instance (id, user_id, tenant_id, status, claude_auth_status) VALUES (${crypto.randomUUID()}, ${userId}, 'test-tenant', 'invalid_status', 'not_configured')`
        )
      ).rejects.toThrow();
    });

    it("rejects invalid claude_auth_status", async () => {
      const { id: userId } = await insertTestUser();
      await expect(
        testDb.execute(
          sql`INSERT INTO instance (id, user_id, tenant_id, status, claude_auth_status) VALUES (${crypto.randomUUID()}, ${userId}, 'test-tenant-2', 'queued', 'bogus')`
        )
      ).rejects.toThrow();
    });

    it("rejects invalid subscription plan", async () => {
      const { id: userId } = await insertTestUser();
      await expect(
        testDb.execute(
          sql`INSERT INTO subscription (id, user_id, plan, status) VALUES (${crypto.randomUUID()}, ${userId}, 'enterprise', 'active')`
        )
      ).rejects.toThrow();
    });
  });

  describe("foreign key constraints", () => {
    it("rejects subscription with non-existent user_id", async () => {
      await expect(
        testDb.insert(schema.subscription).values({
          userId: "non-existent-user-id",
          plan: "starter",
          status: "active",
        })
      ).rejects.toThrow();
    });

    it("rejects instance with non-existent user_id", async () => {
      await expect(
        testDb.insert(schema.instance).values({
          userId: "non-existent-user-id",
          tenantId: "orphan-tenant",
        })
      ).rejects.toThrow();
    });

    it("cascades delete from user to session", async () => {
      const { id: userId } = await insertTestUser();
      await testDb.insert(schema.session).values({
        userId,
        token: "test-session-token",
        expiresAt: new Date(Date.now() + 86400000),
      });

      await testDb.delete(schema.user).where(sql`id = ${userId}`);
      const sessions = await testDb
        .select()
        .from(schema.session)
        .where(sql`user_id = ${userId}`);
      expect(sessions).toHaveLength(0);
    });

    it("cascades delete from user to account", async () => {
      const { id: userId } = await insertTestUser();
      await testDb.insert(schema.account).values({
        userId,
        accountId: "test-account",
        providerId: "credential",
      });

      await testDb.delete(schema.user).where(sql`id = ${userId}`);
      const accounts = await testDb
        .select()
        .from(schema.account)
        .where(sql`user_id = ${userId}`);
      expect(accounts).toHaveLength(0);
    });

    it("cascades delete from user to subscription", async () => {
      const { id: userId } = await insertTestUser();
      await testDb.insert(schema.subscription).values({
        userId,
        plan: "starter",
        status: "active",
      });

      await testDb.delete(schema.user).where(sql`id = ${userId}`);
      const subs = await testDb
        .select()
        .from(schema.subscription)
        .where(sql`user_id = ${userId}`);
      expect(subs).toHaveLength(0);
    });

    it("cascades delete from user to instance", async () => {
      const { id: userId } = await insertTestUser();
      await insertTestInstance(userId);

      await testDb.delete(schema.user).where(sql`id = ${userId}`);
      const instances = await testDb
        .select()
        .from(schema.instance)
        .where(sql`user_id = ${userId}`);
      expect(instances).toHaveLength(0);
    });

    it("sets fleet_event.instance_id to NULL when instance deleted", async () => {
      const { id: userId } = await insertTestUser();
      const { id: instanceId } = await insertTestInstance(userId);

      await testDb.insert(schema.fleetEvent).values({
        instanceId,
        eventType: "provisioned",
        details: { test: true },
      });

      // Delete instance (but not user — need to delete instance directly)
      await testDb.delete(schema.instance).where(sql`id = ${instanceId}`);

      const events = await testDb
        .select()
        .from(schema.fleetEvent)
        .where(sql`event_type = 'provisioned'`);
      expect(events).toHaveLength(1);
      expect(events[0].instanceId).toBeNull();
    });

    it("cascades delete from instance to usage_metric", async () => {
      const { id: userId } = await insertTestUser();
      const { id: instanceId } = await insertTestInstance(userId);

      await testDb.insert(schema.usageMetric).values({
        instanceId,
        metricDate: "2026-03-21",
        claudeCalls: 10,
        toolExecutions: 25,
      });

      await testDb.delete(schema.instance).where(sql`id = ${instanceId}`);
      const metrics = await testDb
        .select()
        .from(schema.usageMetric)
        .where(sql`instance_id = ${instanceId}`);
      expect(metrics).toHaveLength(0);
    });
  });

  describe("coexistence with waitlist", () => {
    it("can insert into waitlist table", async () => {
      const email = `coexist-${crypto.randomUUID()}@example.com`;
      await testDb.insert(schema.waitlist).values({
        email,
        name: "Coexistence Test",
        business: "Test Corp",
      });

      const rows = await testDb
        .select()
        .from(schema.waitlist)
        .where(sql`email = ${email}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Coexistence Test");

      // Cleanup
      await testDb.execute(sql`DELETE FROM waitlist WHERE email = ${email}`);
    });
  });

  describe("platform_audit_log", () => {
    it("can insert audit entries with various actor types", async () => {
      await testDb.insert(schema.platformAuditLog).values({
        actor: "provisioner",
        action: "container.create",
        target: "tenant-alice",
        details: { port: 8001 },
      });

      await testDb.insert(schema.platformAuditLog).values({
        actor: "agent-zero",
        action: "health_check.pass",
        target: "tenant-bob",
      });

      await testDb.insert(schema.platformAuditLog).values({
        actor: "user:abc-123",
        action: "instance.restart",
        target: "tenant-alice",
      });

      const logs = await testDb.select().from(schema.platformAuditLog);
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
  });
});
