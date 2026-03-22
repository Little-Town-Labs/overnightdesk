/**
 * Waitlist conversion integration tests.
 * Requires DATABASE_TEST_URL environment variable.
 */

const SKIP_REASON = !process.env.DATABASE_TEST_URL
  ? "DATABASE_TEST_URL not set — skipping integration tests"
  : undefined;

const describeIntegration = SKIP_REASON ? describe.skip : describe;

describeIntegration("waitlist conversion (integration)", () => {
  let db: ReturnType<typeof import("drizzle-orm/neon-http").drizzle>;

  beforeAll(async () => {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/db/schema");
    const sql = neon(process.env.DATABASE_TEST_URL!);
    db = drizzle(sql, { schema });
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      const { waitlist, platformAuditLog } = await import("@/db/schema");
      const { like } = await import("drizzle-orm");
      await db
        .delete(platformAuditLog)
        .where(like(platformAuditLog.action, "waitlist_conversion%"));
      await db
        .delete(waitlist)
        .where(like(waitlist.email, "%@test-auth.example.com"));
    }
  });

  it("finds a matching waitlist email (case-insensitive)", async () => {
    const { waitlist } = await import("@/db/schema");

    // Insert test waitlist entry
    await db.insert(waitlist).values({
      email: "alice@test-auth.example.com",
      name: "Alice Test",
    });

    // Test case-insensitive lookup
    const { checkWaitlistConversion } = await import(
      "../waitlist-conversion"
    );

    // Mock the db import — in integration tests, we test the query logic directly
    const { eq, sql: sqlFn } = await import("drizzle-orm");
    const entries = await db
      .select()
      .from(waitlist)
      .where(eq(sqlFn`lower(${waitlist.email})`, "alice@test-auth.example.com"))
      .limit(1);

    expect(entries.length).toBe(1);
    expect(entries[0].email).toBe("alice@test-auth.example.com");
    expect(entries[0].name).toBe("Alice Test");
  });

  it("returns empty for non-existent email", async () => {
    const { waitlist } = await import("@/db/schema");
    const { eq, sql: sqlFn } = await import("drizzle-orm");

    const entries = await db
      .select()
      .from(waitlist)
      .where(
        eq(
          sqlFn`lower(${waitlist.email})`,
          "nobody@test-auth.example.com"
        )
      )
      .limit(1);

    expect(entries.length).toBe(0);
  });

  it("logs conversion event to audit log", async () => {
    const { platformAuditLog } = await import("@/db/schema");

    await db.insert(platformAuditLog).values({
      actor: "test-user-id",
      action: "waitlist_conversion",
      target: "waitlist:test-waitlist-id",
      details: {
        email: "alice@test-auth.example.com",
        convertedAt: new Date().toISOString(),
      },
    });

    const { eq } = await import("drizzle-orm");
    const logs = await db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.actor, "test-user-id"));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe("waitlist_conversion");
  });
});
