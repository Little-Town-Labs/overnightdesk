export {};

const databaseUrl = process.env.DATABASE_TEST_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";
const safeDisposableDatabase =
  Boolean(databaseUrl) &&
  process.env.DATABASE_URL === databaseUrl &&
  /^overnightdesk_identity_[a-z0-9_]+$/.test(databaseName);
const describeIntegration = safeDisposableDatabase ? describe : describe.skip;

describeIntegration("Drizzle use-case membership store", () => {
  it("resolves only active, unexpired, unsuspended, unrevoked membership within an active canonical assignment", async () => {
    const [
      { and, eq, inArray },
      { db },
      schema,
      storeModule,
      authorizationModule,
    ] = await Promise.all([
      import("drizzle-orm"),
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/use-case-membership-store"),
      import("@/lib/use-case-membership-authorization"),
    ]);
    const {
      platformAuditLog,
      runtimeIdentity,
      useCase,
      useCaseMembership,
      user,
    } = schema;
    const now = new Date("2026-07-20T12:00:00.000Z");
    const ids = {
      activeUseCase: crypto.randomUUID(),
      inactiveUseCase: crypto.randomUUID(),
      activeRuntime: crypto.randomUUID(),
      otherRuntime: crypto.randomUUID(),
      inactiveRuntime: crypto.randomUUID(),
      broadUser: `membership-broad-${crypto.randomUUID()}`,
      scopedUser: `membership-scoped-${crypto.randomUUID()}`,
      suspendedUser: `membership-suspended-${crypto.randomUUID()}`,
      suspendedTimestampUser: `membership-suspended-at-${crypto.randomUUID()}`,
      revokedTimestampUser: `membership-revoked-at-${crypto.randomUUID()}`,
      expiredUser: `membership-expired-${crypto.randomUUID()}`,
      inactiveUseCaseUser: `membership-inactive-uc-${crypto.randomUUID()}`,
    };
    const userIds = [
      ids.broadUser,
      ids.scopedUser,
      ids.suspendedUser,
      ids.suspendedTimestampUser,
      ids.revokedTimestampUser,
      ids.expiredUser,
      ids.inactiveUseCaseUser,
    ];
    const useCaseIds = [ids.activeUseCase, ids.inactiveUseCase];
    const runtimeIds = [
      ids.activeRuntime,
      ids.otherRuntime,
      ids.inactiveRuntime,
    ];

    try {
      await db.insert(user).values(
        userIds.map((id) => ({
          id,
          name: "Membership Store Qualification",
          email: `${id}@test-auth.example.com`,
          emailVerified: true,
        })),
      );
      await db.insert(useCase).values([
        {
          id: ids.activeUseCase,
          slug: `membership-active-${ids.activeUseCase}`,
          displayName: "Active membership fixture",
          status: "active",
        },
        {
          id: ids.inactiveUseCase,
          slug: `membership-inactive-${ids.inactiveUseCase}`,
          displayName: "Inactive membership fixture",
          status: "suspended",
        },
      ]);
      await db.insert(runtimeIdentity).values([
        {
          id: ids.activeRuntime,
          useCaseId: ids.activeUseCase,
          slug: `membership-runtime-${ids.activeRuntime}`,
          memoryBoundaryKind: "qualification",
          status: "active",
        },
        {
          id: ids.otherRuntime,
          useCaseId: ids.activeUseCase,
          slug: `membership-runtime-${ids.otherRuntime}`,
          memoryBoundaryKind: "qualification",
          status: "active",
        },
        {
          id: ids.inactiveRuntime,
          useCaseId: ids.activeUseCase,
          slug: `membership-runtime-${ids.inactiveRuntime}`,
          memoryBoundaryKind: "qualification",
          status: "suspended",
        },
      ]);
      await db.insert(useCaseMembership).values([
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: null,
          userId: ids.broadUser,
          role: "member",
          status: "active",
          grantedBy: "test:membership-store",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          userId: ids.scopedUser,
          role: "operator",
          status: "active",
          grantedBy: "test:membership-store",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: null,
          userId: ids.suspendedUser,
          role: "member",
          status: "suspended",
          grantedBy: "test:membership-store",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: null,
          userId: ids.suspendedTimestampUser,
          role: "member",
          status: "active",
          suspendedAt: new Date("2026-07-20T11:59:59.000Z"),
          grantedBy: "test:membership-store",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: null,
          userId: ids.revokedTimestampUser,
          role: "member",
          status: "active",
          revokedAt: new Date("2026-07-20T11:59:59.000Z"),
          grantedBy: "test:membership-store",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: null,
          userId: ids.expiredUser,
          role: "member",
          status: "active",
          expiresAt: new Date("2026-07-20T11:59:59.000Z"),
          grantedBy: "test:membership-store",
        },
        {
          useCaseId: ids.inactiveUseCase,
          runtimeIdentityId: null,
          userId: ids.inactiveUseCaseUser,
          role: "member",
          status: "active",
          grantedBy: "test:membership-store",
        },
      ]);

      const store = storeModule.createDrizzleUseCaseMembershipStore(db);
      await expect(
        store.findActiveMembership({
          userId: ids.broadUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          now,
        }),
      ).resolves.toMatchObject({
        userId: ids.broadUser,
        runtimeIdentityId: null,
      });
      await expect(
        store.findActiveMembership({
          userId: ids.scopedUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          now,
        }),
      ).resolves.toMatchObject({
        userId: ids.scopedUser,
        runtimeIdentityId: ids.activeRuntime,
      });
      await expect(
        store.findActiveMembership({
          userId: ids.scopedUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.otherRuntime,
          now,
        }),
      ).resolves.toBeNull();
      await expect(
        store.findActiveMembership({
          userId: ids.suspendedUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          now,
        }),
      ).resolves.toBeNull();
      await expect(
        store.findActiveMembership({
          userId: ids.suspendedTimestampUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          now,
        }),
      ).resolves.toBeNull();
      await expect(
        store.findActiveMembership({
          userId: ids.revokedTimestampUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          now,
        }),
      ).resolves.toBeNull();
      await expect(
        store.findActiveMembership({
          userId: ids.expiredUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          now,
        }),
      ).resolves.toBeNull();
      await expect(
        store.findActiveMembership({
          userId: ids.inactiveUseCaseUser,
          useCaseId: ids.inactiveUseCase,
          runtimeIdentityId: null,
          now,
        }),
      ).resolves.toBeNull();
      await expect(
        store.findActiveMembership({
          userId: ids.broadUser,
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.inactiveRuntime,
          now,
        }),
      ).resolves.toBeNull();

      const authorizer = authorizationModule.createUseCaseMembershipAuthorizer({
        store,
        assignment: {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
        },
        audit: authorizationModule.recordMembershipAuthorizationAuditEvent,
        now: () => now,
      });
      await expect(
        authorizer.authorize({ userId: ids.broadUser }),
      ).resolves.toMatchObject({ authorized: true });
      const auditRows = await db
        .select({ details: platformAuditLog.details })
        .from(platformAuditLog)
        .where(
          and(
            eq(
              platformAuditLog.action,
              "use_case_membership_authorization.granted",
            ),
            eq(platformAuditLog.target, `use_case:${ids.activeUseCase}`),
          ),
        );
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].details).toMatchObject({
        useCaseId: ids.activeUseCase,
        runtimeIdentityId: ids.activeRuntime,
        subjectFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
      });
      expect(JSON.stringify(auditRows)).not.toContain(ids.broadUser);
    } finally {
      await db
        .delete(useCaseMembership)
        .where(inArray(useCaseMembership.userId, userIds));
      await db
        .delete(runtimeIdentity)
        .where(inArray(runtimeIdentity.id, runtimeIds));
      await db
        .delete(platformAuditLog)
        .where(
          and(
            eq(
              platformAuditLog.action,
              "use_case_membership_authorization.granted",
            ),
            eq(platformAuditLog.target, `use_case:${ids.activeUseCase}`),
          ),
        );
      await db.delete(useCase).where(inArray(useCase.id, useCaseIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });
});
