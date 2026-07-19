import {
  MITCHEL_TREVOR_IDENTITY_TEMPLATE,
  planMitchelTrevorBackfill,
} from "@/lib/use-case-identity-backfill";

const databaseUrl = process.env.DATABASE_TEST_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";
const safeDisposableDatabase =
  Boolean(databaseUrl) &&
  process.env.DATABASE_URL === databaseUrl &&
  /^overnightdesk_identity_[a-z0-9_]+$/.test(databaseName);
const describeIntegration = safeDisposableDatabase ? describe : describe.skip;

describeIntegration("Mitchel/Trevor identity backfill store", () => {
  it("applies one atomic allocation and verifies every registered selector", async () => {
    const [{ eq }, { db }, schema, storeModule] = await Promise.all([
      import("drizzle-orm"),
      import("@/db"),
      import("@/db/schema"),
      import("@/db/use-case-identity-backfill-store"),
    ]);
    const { platformAuditLog, user } = schema;
    const {
      applyIdentityBackfillPlan,
      generateMitchelTrevorIdentityIds,
      inspectMitchelTrevorIdentityBackfill,
      verifyMitchelTrevorCanonicalSelectors,
    } = storeModule;
    const membershipUserId = `mitchel-${crypto.randomUUID()}`;
    const input = {
      actor: "operator:identity-qualification",
      membershipUserId,
    };

    await db.insert(user).values({
      id: membershipUserId,
      name: "Identity Qualification User",
      email: `${membershipUserId}@test-auth.example.com`,
      emailVerified: false,
    });

    const unverified = await inspectMitchelTrevorIdentityBackfill(input, db);
    expect(
      planMitchelTrevorBackfill(
        input,
        unverified,
        generateMitchelTrevorIdentityIds(),
      ),
    ).toEqual({
      status: "blocked",
      reasons: ["membership_user_unverified"],
    });

    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, membershipUserId));

    const before = await inspectMitchelTrevorIdentityBackfill(input, db);
    const ids = generateMitchelTrevorIdentityIds();
    const ready = planMitchelTrevorBackfill(input, before, ids);
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") throw new Error("expected a ready plan");

    await applyIdentityBackfillPlan(ready, db);

    const after = await inspectMitchelTrevorIdentityBackfill(input, db);
    const retry = planMitchelTrevorBackfill(
      input,
      after,
      generateMitchelTrevorIdentityIds(),
    );
    expect(retry).toEqual({
      status: "verified_noop",
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
    });

    await expect(
      verifyMitchelTrevorCanonicalSelectors(
        ids.useCaseId,
        ids.runtimeIdentityId,
        db,
      ),
    ).resolves.toEqual({ checked: 4, matched: 4, mismatches: [] });

    const auditRows = await db
      .select({ details: platformAuditLog.details })
      .from(platformAuditLog)
      .where(eq(platformAuditLog.action, "use_case_identity_backfill_applied"));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].details).toEqual(ready.audit.details);
    expect(JSON.stringify(auditRows)).not.toContain("aero-fett");
    expect(JSON.stringify(auditRows)).not.toContain("hermes-mitchel-data");
    expect(JSON.stringify(auditRows)).not.toContain("/agents/");
  });
});
