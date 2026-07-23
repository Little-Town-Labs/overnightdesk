import {
  TITUS_IDENTITY_TEMPLATE,
  planTitusFoundation,
  planTitusMembershipActivation,
  summarizeIdentityFoundationPlan,
  summarizeMembershipActivationPlan,
  type CanonicalIdentityIds,
  type IdentityBackfillSnapshot,
  type IdentityFoundationSnapshot,
} from "@/lib/use-case-identity-backfill";

const titusIds: CanonicalIdentityIds = {
  useCaseId: "20202020-2020-4020-8020-202020202020",
  runtimeIdentityId: "21212121-2121-4121-8121-212121212121",
  personaAssignmentId: "22222222-2222-4222-8222-222222222222",
  membershipId: "23232323-2323-4323-8323-232323232323",
  resourceBindingIds: Array.from(
    { length: TITUS_IDENTITY_TEMPLATE.resourceBindings.length },
    (_, index) =>
      `24242424-2424-4424-8424-${String(index).padStart(12, "0")}`,
  ),
  secretBoundaryBindingIds: Array.from(
    { length: TITUS_IDENTITY_TEMPLATE.secretBoundaryBindings.length },
    (_, index) =>
      `25252525-2525-4525-8525-${String(index).padStart(12, "0")}`,
  ),
};

const titusInput = {
  actor: "operator:gary",
  membershipUserId: "better-auth-user-gary",
};

function emptyFoundationSnapshot(
  overrides: Partial<IdentityFoundationSnapshot> = {},
): IdentityFoundationSnapshot {
  return {
    schemaReady: true,
    canonicalConflict: false,
    existingCanonicalState: null,
    ...overrides,
  };
}

function emptyMembershipSnapshot(
  overrides: Partial<IdentityBackfillSnapshot> = {},
): IdentityBackfillSnapshot {
  return {
    schemaReady: true,
    membershipUser: {
      id: titusInput.membershipUserId,
      emailVerified: true,
    },
    canonicalConflict: false,
    existingCanonicalState: null,
    ...overrides,
  };
}

function foundationState() {
  const foundation = planTitusFoundation(
    { actor: titusInput.actor },
    emptyFoundationSnapshot(),
    titusIds,
  );
  if (foundation.status !== "ready") {
    throw new Error("expected a ready Titus foundation");
  }
  return {
    useCase: foundation.useCase,
    numberAllocation: foundation.numberAllocation,
    runtimeIdentity: foundation.runtimeIdentity,
    personaAssignment: foundation.personaAssignment,
    membership: null,
    resourceBindings: foundation.resourceBindings,
    secretBoundaryBindings: foundation.secretBoundaryBindings,
  };
}

describe("planTitusFoundation", () => {
  it("creates Tenet 2 with zero memberships and no Teams or Austin grant", () => {
    const plan = planTitusFoundation(
      { actor: titusInput.actor },
      emptyFoundationSnapshot(),
      titusIds,
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan).not.toHaveProperty("membership");
    expect(plan.numberAllocation.number).toBe(2);
    expect(plan.runtimeIdentity.slug).toBe("hermes-titus");
    expect(plan.personaAssignment).toMatchObject({
      personaKey: "titus",
      displayName: "Titus",
      isDefault: true,
    });
    expect(plan.audit.details).toEqual({
      useCaseNumber: 2,
      membershipCount: 0,
      resourceBindingCount: TITUS_IDENTITY_TEMPLATE.resourceBindings.length,
      secretBoundaryBindingCount:
        TITUS_IDENTITY_TEMPLATE.secretBoundaryBindings.length,
      platformInstanceLinked: false,
      orchestratorTenantBound: false,
    });
    expect(JSON.stringify(plan)).not.toContain("austin");
  });

  it("preserves the standalone Titus and channel compatibility names", () => {
    expect(TITUS_IDENTITY_TEMPLATE.resourceBindings).toEqual([
      {
        provider: "docker",
        kind: "container",
        value: "hermes-titus",
        state: "active",
      },
      {
        provider: "docker",
        kind: "volume",
        value: "hermes-titus-data",
        state: "active",
      },
      {
        provider: "overnightdesk",
        kind: "platform_instance",
        value: "titus-dashboard",
        state: "active",
      },
      {
        provider: "nginx",
        kind: "hostname",
        value: "titus-dashboard.overnightdesk.com",
        state: "active",
      },
      ...[
        "/agents/hermes-titus/runtime",
        "/agents/hermes-titus/overnightdesk",
        "/agents/hermes-titus/memory",
      ].map((value) => ({
        provider: "phase",
        kind: "phase_path" as const,
        value,
        state: "active" as const,
      })),
      {
        provider: "phase",
        kind: "phase_path",
        value: "/agents/hermes-titus/email",
        state: "rollback",
      },
      {
        provider: "phase",
        kind: "phase_path",
        value: "/agents/hermes-titus/matrix",
        state: "active",
      },
      {
        provider: "phase",
        kind: "phase_path",
        value: "/agents/hermes-titus/teams",
        state: "compatibility",
      },
      {
        provider: "phase",
        kind: "phase_path",
        value: "/agents/hermes-email-intake/titus",
        state: "active",
      },
      {
        provider: "securityteam",
        kind: "intake_route",
        value: "titus",
        state: "active",
      },
    ]);
    expect(TITUS_IDENTITY_TEMPLATE.secretBoundaryBindings).toEqual(
      [
        "/agents/hermes-titus/runtime",
        "/agents/hermes-titus/overnightdesk",
        "/agents/hermes-titus/memory",
        "/agents/hermes-titus/email",
        "/agents/hermes-titus/matrix",
        "/agents/hermes-titus/teams",
        "/agents/hermes-email-intake/titus",
      ].map((pathIdentifier) => ({
        phaseApp: "timeless-tech-solutions",
        environment: "production",
        pathIdentifier,
      })),
    );
  });

  it("declares the native dashboard as an additive canonical capability", () => {
    expect(TITUS_IDENTITY_TEMPLATE.resourceBindings).toEqual(
      expect.arrayContaining([
        {
          provider: "overnightdesk",
          kind: "platform_instance",
          value: "titus-dashboard",
          state: "active",
        },
        {
          provider: "nginx",
          kind: "hostname",
          value: "titus-dashboard.overnightdesk.com",
          state: "active",
        },
      ]),
    );
    expect(
      TITUS_IDENTITY_TEMPLATE.resourceBindings.filter(
        (binding) =>
          binding.provider === "docker" && binding.kind === "container",
      ),
    ).toEqual([
      {
        provider: "docker",
        kind: "container",
        value: "hermes-titus",
        state: "active",
      },
    ]);
    expect(
      TITUS_IDENTITY_TEMPLATE.resourceBindings.filter(
        (binding) =>
          binding.provider === "docker" && binding.kind === "volume",
      ),
    ).toEqual([
      {
        provider: "docker",
        kind: "volume",
        value: "hermes-titus-data",
        state: "active",
      },
    ]);
  });

  it("returns a verified no-op without changing canonical IDs", () => {
    const existingCanonicalState = foundationState();
    const plan = planTitusFoundation(
      { actor: titusInput.actor },
      emptyFoundationSnapshot({ existingCanonicalState }),
      { ...titusIds, useCaseId: "26262626-2626-4626-8626-262626262626" },
    );

    expect(plan).toEqual({
      status: "verified_noop",
      useCaseId: titusIds.useCaseId,
      runtimeIdentityId: titusIds.runtimeIdentityId,
    });
  });

  it("summarizes counts without printing resource or Phase path values", () => {
    const plan = planTitusFoundation(
      { actor: titusInput.actor },
      emptyFoundationSnapshot(),
      titusIds,
    );
    const serialized = JSON.stringify(summarizeIdentityFoundationPlan(plan));

    expect(serialized).not.toContain("hermes-titus");
    expect(serialized).not.toContain("/agents/");
    expect(serialized).not.toContain("timeless-tech-solutions");
  });
});

describe("planTitusMembershipActivation", () => {
  it("fails closed when Gary's Better Auth subject is absent", () => {
    expect(
      planTitusMembershipActivation(
        titusInput,
        emptyMembershipSnapshot({
          membershipUser: null,
          existingCanonicalState: foundationState(),
        }),
        titusIds.membershipId,
      ),
    ).toEqual({
      status: "blocked",
      reasons: ["membership_user_missing"],
    });
  });

  it("fails closed when Gary's Better Auth subject is unverified", () => {
    expect(
      planTitusMembershipActivation(
        titusInput,
        emptyMembershipSnapshot({
          membershipUser: {
            id: titusInput.membershipUserId,
            emailVerified: false,
          },
          existingCanonicalState: foundationState(),
        }),
        titusIds.membershipId,
      ),
    ).toEqual({
      status: "blocked",
      reasons: ["membership_user_unverified"],
    });
  });

  it("plans only Gary's owner membership after verification", () => {
    const plan = planTitusMembershipActivation(
      titusInput,
      emptyMembershipSnapshot({
        existingCanonicalState: foundationState(),
      }),
      titusIds.membershipId,
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan).not.toHaveProperty("useCase");
    expect(plan.membership).toEqual({
      id: titusIds.membershipId,
      useCaseId: titusIds.useCaseId,
      runtimeIdentityId: null,
      userId: titusInput.membershipUserId,
      role: "owner",
      status: "active",
      grantedBy: titusInput.actor,
    });
    const summary = JSON.stringify(summarizeMembershipActivationPlan(plan));
    expect(summary).not.toContain(titusInput.membershipUserId);
    expect(summary).not.toContain(titusIds.membershipId);
  });
});
