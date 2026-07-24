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
      { and, eq, inArray, or },
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
      instance,
      oauthClient,
      personaAssignment,
      platformAuditLog,
      resourceBinding,
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
    const dashboardTenantId = `membership-tenant-${ids.activeRuntime}`;
    const dashboardHostname =
      `membership-${ids.activeRuntime}.overnightdesk.com`;
    const dashboardOidcClientId = `membership-client-${ids.activeRuntime}`;
    const dashboardInstanceId = `membership-instance-${ids.activeRuntime}`;
    const dashboardBindingValues = [
      dashboardTenantId,
      dashboardHostname,
      dashboardOidcClientId,
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
      await db.insert(personaAssignment).values([
        {
          runtimeIdentityId: ids.activeRuntime,
          personaKey: "membership-active",
          displayName: "Active membership agent",
          isDefault: true,
          authorityProfile: "qualification",
          status: "active",
        },
        {
          runtimeIdentityId: ids.otherRuntime,
          personaKey: "membership-other",
          displayName: "Other membership agent",
          isDefault: true,
          authorityProfile: "qualification",
          status: "active",
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
      await db.insert(oauthClient).values({
        clientId: dashboardOidcClientId,
        redirectUris: [`https://${dashboardHostname}/auth/callback`],
      });
      await db.insert(instance).values({
        id: dashboardInstanceId,
        userId: ids.broadUser,
        tenantId: dashboardTenantId,
        useCaseId: ids.activeUseCase,
        runtimeIdentityId: ids.activeRuntime,
        status: "running",
        containerId: "hermes-membership-qualification",
        subdomain: dashboardHostname,
        hermesOidcClientId: dashboardOidcClientId,
        hermesDashboardAuthStatus: "active",
      });
      await db.insert(resourceBinding).values([
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          provider: "overnightdesk",
          kind: "platform_instance",
          value: dashboardTenantId,
          state: "active",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          provider: "nginx",
          kind: "hostname",
          value: dashboardHostname,
          state: "active",
        },
        {
          useCaseId: ids.activeUseCase,
          runtimeIdentityId: ids.activeRuntime,
          provider: "better-auth",
          kind: "oidc_client",
          value: dashboardOidcClientId,
          state: "active",
        },
      ]);

      const { readDashboardCanonicalContext } = await import(
        "@/db/dashboard-canonical-context-store"
      );
      const canonicalRequirement = {
        useCaseId: ids.activeUseCase,
        runtimeIdentityId: ids.activeRuntime,
        tenantId: dashboardTenantId,
        hostname: dashboardHostname,
        oidc: {
          clientId: dashboardOidcClientId,
          allowedStates: ["active"] as const,
        },
      };
      await expect(
        readDashboardCanonicalContext(canonicalRequirement, db),
      ).resolves.toBe(true);

      await db
        .update(resourceBinding)
        .set({ runtimeIdentityId: ids.otherRuntime })
        .where(eq(resourceBinding.value, dashboardHostname));
      await expect(
        readDashboardCanonicalContext(canonicalRequirement, db),
      ).resolves.toBe(false);
      await db
        .update(resourceBinding)
        .set({ runtimeIdentityId: ids.activeRuntime })
        .where(eq(resourceBinding.value, dashboardHostname));

      await db
        .update(useCase)
        .set({ status: "suspended" })
        .where(eq(useCase.id, ids.activeUseCase));
      await expect(
        readDashboardCanonicalContext(canonicalRequirement, db),
      ).resolves.toBe(false);
      await db
        .update(useCase)
        .set({ status: "active" })
        .where(eq(useCase.id, ids.activeUseCase));

      await db
        .update(resourceBinding)
        .set({ state: "rollback" })
        .where(eq(resourceBinding.value, dashboardOidcClientId));
      await expect(
        readDashboardCanonicalContext(canonicalRequirement, db),
      ).resolves.toBe(false);
      await expect(
        readDashboardCanonicalContext(
          {
            ...canonicalRequirement,
            oidc: {
              clientId: dashboardOidcClientId,
              allowedStates: ["active", "rollback"],
            },
          },
          db,
        ),
      ).resolves.toBe(true);
      await db
        .update(resourceBinding)
        .set({ state: "active" })
        .where(eq(resourceBinding.value, dashboardOidcClientId));

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

      const { createOpenWebuiWorkspaceDirectoryStore } =
        await import("@/db/open-webui-workspace-directory");
      const directory = createOpenWebuiWorkspaceDirectoryStore(db);
      await expect(
        directory.listAuthorizedAgents(ids.broadUser),
      ).resolves.toHaveLength(2);
      await expect(
        directory.listAuthorizedAgents(ids.scopedUser),
      ).resolves.toEqual([
        expect.objectContaining({ runtimeIdentityId: ids.activeRuntime }),
      ]);
      await expect(
        directory.listAuthorizedAgents(ids.suspendedTimestampUser),
      ).resolves.toEqual([]);
      await expect(
        directory.listAuthorizedAgents(ids.revokedTimestampUser),
      ).resolves.toEqual([]);
      await expect(
        directory.listAuthorizedAgents(ids.expiredUser),
      ).resolves.toEqual([]);

      const [{ resolveSelectedAgentPageContext }, { resolveAgentDirectory }] =
        await Promise.all([
          import("@/db/selected-agent-page-context"),
          import("@/lib/open-webui-workspace"),
        ]);
      const scopedDirectory = await resolveAgentDirectory(
        ids.scopedUser,
        directory,
      );
      await expect(
        resolveSelectedAgentPageContext(ids.scopedUser, scopedDirectory),
      ).resolves.toMatchObject({
        status: "available",
        instances: [
          {
            tenantId: dashboardTenantId,
            useCaseId: ids.activeUseCase,
            runtimeIdentityId: ids.activeRuntime,
            engineApiKey: null,
          },
        ],
      });

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

      const { createDrizzleDashboardAuthorizationStore } = await import(
        "@/db/dashboard-authorization-store"
      );
      const dashboardStore = createDrizzleDashboardAuthorizationStore(db);
      await expect(
        dashboardStore.authorize({
          requestedHost: dashboardHostname,
          userId: ids.broadUser,
        }),
      ).resolves.toMatchObject({
        authorized: true,
        authority: "canonical",
      });
      await db
        .update(resourceBinding)
        .set({ runtimeIdentityId: ids.otherRuntime })
        .where(eq(resourceBinding.value, dashboardHostname));
      await expect(
        dashboardStore.authorize({
          requestedHost: dashboardHostname,
          userId: ids.broadUser,
        }),
      ).resolves.toEqual({
        authorized: false,
        reason: "not_authorized",
      });
      await db
        .update(resourceBinding)
        .set({ runtimeIdentityId: ids.activeRuntime })
        .where(eq(resourceBinding.value, dashboardHostname));
    } finally {
      await db
        .delete(instance)
        .where(inArray(instance.runtimeIdentityId, runtimeIds));
      await db
        .delete(resourceBinding)
        .where(inArray(resourceBinding.value, dashboardBindingValues));
      await db
        .delete(oauthClient)
        .where(eq(oauthClient.clientId, dashboardOidcClientId));
      await db
        .delete(useCaseMembership)
        .where(inArray(useCaseMembership.userId, userIds));
      await db
        .delete(personaAssignment)
        .where(inArray(personaAssignment.runtimeIdentityId, runtimeIds));
      await db
        .delete(runtimeIdentity)
        .where(inArray(runtimeIdentity.id, runtimeIds));
      await db
        .delete(platformAuditLog)
        .where(
          or(
            eq(platformAuditLog.target, `use_case:${ids.activeUseCase}`),
            eq(
              platformAuditLog.target,
              `instance:${dashboardInstanceId}`,
            ),
          ),
        );
      await db.delete(useCase).where(inArray(useCase.id, useCaseIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });
});
