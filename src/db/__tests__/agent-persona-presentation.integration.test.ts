export {};

const databaseUrl = process.env.DATABASE_TEST_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : "";
const safeDisposableDatabase =
  Boolean(databaseUrl) &&
  process.env.DATABASE_URL === databaseUrl &&
  /^overnightdesk_identity_[a-z0-9_]+$/.test(databaseName);
const describeIntegration = safeDisposableDatabase ? describe : describe.skip;

describeIntegration("agent persona presentation store", () => {
  it("enforces exact active owner scope and serves only validated stored bytes", async () => {
    const [{ and, eq, inArray }, { db }, schema, storeModule, logoModule] =
      await Promise.all([
        import("drizzle-orm"),
        import("@/db"),
        import("@/db/schema"),
        import("@/db/agent-persona-presentation"),
        import("@/lib/agent-persona-logo"),
      ]);
    const {
      personaAssignment,
      platformAuditLog,
      runtimeIdentity,
      useCase,
      useCaseMembership,
      user,
    } = schema;
    const ids = {
      useCase: crypto.randomUUID(),
      runtime: crypto.randomUUID(),
      persona: crypto.randomUUID(),
      owner: `persona-owner-${crypto.randomUUID()}`,
      viewer: `persona-viewer-${crypto.randomUUID()}`,
      suspended: `persona-suspended-${crypto.randomUUID()}`,
      expired: `persona-expired-${crypto.randomUUID()}`,
    };
    const userIds = [ids.owner, ids.viewer, ids.suspended, ids.expired];
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const validated = logoModule.validateAgentPersonaLogo({
      contentType: "image/png",
      bytes: png,
    });
    if (!validated.ok) throw new Error("invalid test logo");

    try {
      await db.insert(user).values(
        userIds.map((id) => ({
          id,
          name: "Persona Presentation Qualification",
          email: `${id}@test-auth.example.com`,
          emailVerified: true,
        })),
      );
      await db.insert(useCase).values({
        id: ids.useCase,
        slug: `persona-${ids.useCase}`,
        displayName: "Persona presentation fixture",
        status: "active",
      });
      await db.insert(runtimeIdentity).values({
        id: ids.runtime,
        useCaseId: ids.useCase,
        slug: `persona-runtime-${ids.runtime}`,
        memoryBoundaryKind: "qualification",
        status: "active",
      });
      await db.insert(personaAssignment).values({
        id: ids.persona,
        runtimeIdentityId: ids.runtime,
        personaKey: "titus",
        displayName: "Titus",
        isDefault: true,
        authorityProfile: "qualification",
        status: "active",
      });
      await db.insert(useCaseMembership).values([
        {
          useCaseId: ids.useCase,
          userId: ids.owner,
          role: "owner",
          status: "active",
          grantedBy: "test:persona-presentation",
        },
        {
          useCaseId: ids.useCase,
          userId: ids.viewer,
          role: "viewer",
          status: "active",
          grantedBy: "test:persona-presentation",
        },
        {
          useCaseId: ids.useCase,
          userId: ids.suspended,
          role: "owner",
          status: "suspended",
          grantedBy: "test:persona-presentation",
        },
        {
          useCaseId: ids.useCase,
          userId: ids.expired,
          role: "owner",
          status: "active",
          expiresAt: new Date(Date.now() - 60_000),
          grantedBy: "test:persona-presentation",
        },
      ]);

      const store = storeModule.createAgentPersonaPresentationStore(db);
      for (const actorUserId of [ids.viewer, ids.suspended, ids.expired]) {
        await expect(
          store.replaceLogo({
            actorUserId,
            runtimeIdentityId: ids.runtime,
            logo: validated.value,
          }),
        ).resolves.toBe("forbidden");
      }
      await expect(
        store.replaceLogo({
          actorUserId: ids.owner,
          runtimeIdentityId: ids.runtime,
          logo: validated.value,
        }),
      ).resolves.toBe("updated");
      await expect(
        store.readLogo({
          runtimeIdentityId: ids.runtime,
          sha256: validated.value.sha256,
        }),
      ).resolves.toEqual({ contentType: "image/png", bytes: png });
      await expect(store.resolveLogoPointer("titus")).resolves.toEqual({
        runtimeIdentityId: ids.runtime,
        sha256: validated.value.sha256,
      });

      const audits = await db
        .select({ details: platformAuditLog.details })
        .from(platformAuditLog)
        .where(
          and(
            inArray(platformAuditLog.actor, userIds),
            eq(platformAuditLog.target, `runtime:${ids.runtime}`),
          ),
        );
      expect(audits).toHaveLength(4);
      expect(JSON.stringify(audits)).not.toContain(validated.value.dataBase64);
      expect(JSON.stringify(audits)).not.toContain("untrusted-name");

      await expect(
        store.removeLogo({
          actorUserId: ids.owner,
          runtimeIdentityId: ids.runtime,
        }),
      ).resolves.toBe("updated");
      await expect(
        store.readLogo({
          runtimeIdentityId: ids.runtime,
          sha256: validated.value.sha256,
        }),
      ).resolves.toBeNull();
    } finally {
      await db
        .delete(platformAuditLog)
        .where(eq(platformAuditLog.target, `runtime:${ids.runtime}`));
      await db
        .delete(useCaseMembership)
        .where(eq(useCaseMembership.useCaseId, ids.useCase));
      await db
        .delete(personaAssignment)
        .where(eq(personaAssignment.runtimeIdentityId, ids.runtime));
      await db
        .delete(runtimeIdentity)
        .where(eq(runtimeIdentity.id, ids.runtime));
      await db.delete(useCase).where(eq(useCase.id, ids.useCase));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });
});
