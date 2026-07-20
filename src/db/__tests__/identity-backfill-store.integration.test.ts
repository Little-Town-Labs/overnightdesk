import {
  MITCHEL_TREVOR_IDENTITY_TEMPLATE,
  WALTER_IDENTITY_TEMPLATE,
  planMitchelMembershipActivation,
  planMitchelTrevorFoundation,
  planWalterFoundation,
  planWalterMembershipActivation,
} from "@/lib/use-case-identity-backfill";

type IdentityStoreModule =
  typeof import("@/db/use-case-identity-backfill-store");

const databaseUrl = process.env.DATABASE_TEST_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";
const safeDisposableDatabase =
  Boolean(databaseUrl) &&
  process.env.DATABASE_URL === databaseUrl &&
  /^overnightdesk_identity_[a-z0-9_]+$/.test(databaseName);
const describeIntegration = safeDisposableDatabase ? describe : describe.skip;

describeIntegration("Mitchel/Trevor identity backfill store", () => {
  it("applies foundation before a user exists and attaches verified membership later", async () => {
    const [{ eq }, { db }, schema, storeModule, auditModule] = await Promise.all([
      import("drizzle-orm"),
      import("@/db"),
      import("@/db/schema"),
      import("@/db/use-case-identity-backfill-store"),
      import("@/lib/canonical-identity-audit"),
    ]);
    const { platformAuditLog, useCaseMembership, user } = schema;
    const {
      applyIdentityFoundationPlan,
      applyMembershipActivationPlan,
      compareMitchelTrevorLegacyAndCanonical,
      generateMitchelTrevorIdentityIds,
      inspectMitchelTrevorIdentityBackfill,
      inspectMitchelTrevorIdentityFoundation,
      verifyMitchelTrevorCanonicalSelectors,
    } = storeModule as IdentityStoreModule;
    const membershipUserId = `mitchel-${crypto.randomUUID()}`;
    const input = {
      actor: "operator:identity-qualification",
      membershipUserId,
    };

    const ids = generateMitchelTrevorIdentityIds();
    const before = await inspectMitchelTrevorIdentityFoundation(db);
    const ready = planMitchelTrevorFoundation(
      { actor: input.actor },
      before,
      ids,
    );
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") {
      throw new Error("expected a ready foundation");
    }

    await applyIdentityFoundationPlan(ready, db);

    const afterFoundation = await inspectMitchelTrevorIdentityFoundation(db);
    const retry = planMitchelTrevorFoundation(
      { actor: input.actor },
      afterFoundation,
      generateMitchelTrevorIdentityIds(),
    );
    expect(retry).toEqual({
      status: "verified_noop",
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
    });
    await expect(db.select().from(useCaseMembership)).resolves.toHaveLength(0);

    await expect(
      verifyMitchelTrevorCanonicalSelectors(
        ids.useCaseId,
        ids.runtimeIdentityId,
        db,
      ),
    ).resolves.toEqual({ checked: 4, matched: 4, mismatches: [] });

    const auditCanonicalComparison = auditModule.createPlatformIdentityAudit(db);
    await expect(
      compareMitchelTrevorLegacyAndCanonical({
        mode: "compare",
        expectedUseCaseId: ids.useCaseId,
        expectedRuntimeIdentityId: ids.runtimeIdentityId,
        audit: auditCanonicalComparison,
        database: db,
      }),
    ).resolves.toEqual({
      mode: "compare",
      authority: "legacy",
      legacyChecked: 1,
      legacyMatched: 1,
      canonicalChecked: 4,
      canonicalMatched: 4,
      canonicalMismatches: [],
      canonicalErrors: [],
    });

    const comparisonAuditRows = await db
      .select({ details: platformAuditLog.details })
      .from(platformAuditLog)
      .where(eq(platformAuditLog.action, "canonical_resolution_match"));
    expect(comparisonAuditRows).toHaveLength(4);
    expect(JSON.stringify(comparisonAuditRows)).not.toContain("hermes-mitchel");
    expect(JSON.stringify(comparisonAuditRows)).not.toContain("aero-fett");
    expect(JSON.stringify(comparisonAuditRows)).not.toContain("/agents/");

    await expect(
      compareMitchelTrevorLegacyAndCanonical({ mode: "legacy" }),
    ).resolves.toEqual({
      mode: "legacy",
      authority: "legacy",
      legacyChecked: 1,
      legacyMatched: 1,
      canonicalChecked: 0,
      canonicalMatched: 0,
      canonicalMismatches: [],
      canonicalErrors: [],
    });

    const afterRollback = await inspectMitchelTrevorIdentityFoundation(db);
    expect(afterRollback.existingCanonicalState).toMatchObject({
      useCase: { id: ids.useCaseId },
      runtimeIdentity: { id: ids.runtimeIdentityId },
    });
    await expect(
      verifyMitchelTrevorCanonicalSelectors(
        ids.useCaseId,
        ids.runtimeIdentityId,
        db,
      ),
    ).resolves.toEqual({ checked: 4, matched: 4, mismatches: [] });
    await expect(
      db
        .select({ details: platformAuditLog.details })
        .from(platformAuditLog)
        .where(eq(platformAuditLog.action, "canonical_resolution_match")),
    ).resolves.toHaveLength(4);

    await db.insert(user).values({
      id: membershipUserId,
      name: "Identity Qualification User",
      email: `${membershipUserId}@test-auth.example.com`,
      emailVerified: false,
    });
    const unverified = await inspectMitchelTrevorIdentityBackfill(input, db);
    expect(
      planMitchelMembershipActivation(input, unverified, ids.membershipId),
    ).toEqual({
      status: "blocked",
      reasons: ["membership_user_unverified"],
    });

    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, membershipUserId));
    const membershipSnapshot = await inspectMitchelTrevorIdentityBackfill(
      input,
      db,
    );
    const membershipPlan = planMitchelMembershipActivation(
      input,
      membershipSnapshot,
      ids.membershipId,
    );
    expect(membershipPlan.status).toBe("ready");
    if (membershipPlan.status !== "ready") {
      throw new Error("expected a ready membership plan");
    }
    await applyMembershipActivationPlan(membershipPlan, db);

    const afterMembership = await inspectMitchelTrevorIdentityBackfill(
      input,
      db,
    );
    expect(
      planMitchelMembershipActivation(
        input,
        afterMembership,
        crypto.randomUUID(),
      ),
    ).toEqual({ status: "verified_noop", membershipId: ids.membershipId });
    expect(afterMembership.existingCanonicalState).toMatchObject({
      useCase: { id: ids.useCaseId },
      runtimeIdentity: { id: ids.runtimeIdentityId },
    });

    const foundationAuditRows = await db
      .select({ details: platformAuditLog.details })
      .from(platformAuditLog)
      .where(
        eq(platformAuditLog.action, "use_case_identity_foundation_applied"),
      );
    expect(foundationAuditRows).toHaveLength(1);
    expect(foundationAuditRows[0].details).toEqual(ready.audit.details);
    const membershipAuditRows = await db
      .select({ details: platformAuditLog.details })
      .from(platformAuditLog)
      .where(eq(platformAuditLog.action, "use_case_membership_activated"));
    expect(membershipAuditRows).toHaveLength(1);
    expect(membershipAuditRows[0].details).toEqual(
      membershipPlan.audit.details,
    );
    expect(
      JSON.stringify([foundationAuditRows, membershipAuditRows]),
    ).not.toContain("aero-fett");
    expect(
      JSON.stringify([foundationAuditRows, membershipAuditRows]),
    ).not.toContain("hermes-mitchel-data");
    expect(
      JSON.stringify([foundationAuditRows, membershipAuditRows]),
    ).not.toContain("/agents/");
  });
});

describeIntegration("Walter identity backfill store", () => {
  it("applies Tenet 0 with zero memberships and attaches Gary separately", async () => {
    const [{ and, eq }, { db }, schema, storeModule] = await Promise.all([
      import("drizzle-orm"),
      import("@/db"),
      import("@/db/schema"),
      import("@/db/use-case-identity-backfill-store"),
    ]);
    const { platformAuditLog, useCaseMembership, user } = schema;
    const {
      applyIdentityFoundationPlan,
      applyMembershipActivationPlan,
      generateWalterIdentityIds,
      inspectWalterIdentityBackfill,
      inspectWalterIdentityFoundation,
      verifyWalterCanonicalSelectors,
    } = storeModule as IdentityStoreModule;
    const membershipUserId = `gary-${crypto.randomUUID()}`;
    const input = {
      actor: "operator:walter-identity-qualification",
      membershipUserId,
    };
    const ids = generateWalterIdentityIds();

    const before = await inspectWalterIdentityFoundation(db);
    const ready = planWalterFoundation({ actor: input.actor }, before, ids);
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") {
      throw new Error("expected a ready Walter foundation");
    }
    await applyIdentityFoundationPlan(ready, db);

    const afterFoundation = await inspectWalterIdentityFoundation(db);
    expect(
      planWalterFoundation(
        { actor: input.actor },
        afterFoundation,
        generateWalterIdentityIds(),
      ),
    ).toEqual({
      status: "verified_noop",
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
    });
    await expect(
      db
        .select()
        .from(useCaseMembership)
        .where(eq(useCaseMembership.useCaseId, ids.useCaseId)),
    ).resolves.toHaveLength(0);
    await expect(
      verifyWalterCanonicalSelectors(
        ids.useCaseId,
        ids.runtimeIdentityId,
        db,
      ),
    ).resolves.toEqual({
      checked: 1 + WALTER_IDENTITY_TEMPLATE.resourceBindings.length,
      matched: 1 + WALTER_IDENTITY_TEMPLATE.resourceBindings.length,
      mismatches: [],
    });

    await db.insert(user).values({
      id: membershipUserId,
      name: "Walter Identity Qualification User",
      email: `${membershipUserId}@test-auth.example.com`,
      emailVerified: true,
    });
    const membershipSnapshot = await inspectWalterIdentityBackfill(input, db);
    const membershipPlan = planWalterMembershipActivation(
      input,
      membershipSnapshot,
      ids.membershipId,
    );
    expect(membershipPlan.status).toBe("ready");
    if (membershipPlan.status !== "ready") {
      throw new Error("expected a ready Gary membership");
    }
    await applyMembershipActivationPlan(membershipPlan, db);

    const afterMembership = await inspectWalterIdentityBackfill(input, db);
    expect(
      planWalterMembershipActivation(
        input,
        afterMembership,
        crypto.randomUUID(),
      ),
    ).toEqual({
      status: "verified_noop",
      membershipId: ids.membershipId,
    });
    expect(afterMembership.existingCanonicalState).toMatchObject({
      useCase: { id: ids.useCaseId },
      runtimeIdentity: { id: ids.runtimeIdentityId },
      membership: { userId: membershipUserId },
    });

    const foundationAudits = await db
      .select({ details: platformAuditLog.details })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.action, "use_case_identity_foundation_applied"),
          eq(platformAuditLog.target, ids.useCaseId),
        ),
      );
    const membershipAudits = await db
      .select({ details: platformAuditLog.details })
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.action, "use_case_membership_activated"),
          eq(platformAuditLog.target, ids.useCaseId),
        ),
      );
    expect(foundationAudits).toHaveLength(1);
    expect(membershipAudits).toHaveLength(1);
    expect(JSON.stringify([foundationAudits, membershipAudits])).not.toContain(
      membershipUserId,
    );
    expect(JSON.stringify([foundationAudits, membershipAudits])).not.toContain(
      "aegis-prod",
    );
    expect(JSON.stringify([foundationAudits, membershipAudits])).not.toContain(
      "/agents/",
    );
  });
});
