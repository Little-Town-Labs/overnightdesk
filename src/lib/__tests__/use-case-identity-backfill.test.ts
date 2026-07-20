import {
  MITCHEL_TREVOR_IDENTITY_TEMPLATE,
  WALTER_IDENTITY_TEMPLATE,
  planMitchelMembershipActivation,
  planMitchelTrevorBackfill,
  planMitchelTrevorFoundation,
  planWalterFoundation,
  planWalterMembershipActivation,
  summarizeIdentityBackfillPlan,
  summarizeIdentityFoundationPlan,
  summarizeMembershipActivationPlan,
  type CanonicalIdentityIds,
  type IdentityFoundationSnapshot,
  type IdentityBackfillSnapshot,
} from "@/lib/use-case-identity-backfill";

const ids: CanonicalIdentityIds = {
  useCaseId: "11111111-1111-4111-8111-111111111111",
  runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
  personaAssignmentId: "33333333-3333-4333-8333-333333333333",
  membershipId: "44444444-4444-4444-8444-444444444444",
  resourceBindingIds: [
    "55555555-5555-4555-8555-555555555551",
    "55555555-5555-4555-8555-555555555552",
    "55555555-5555-4555-8555-555555555553",
    "55555555-5555-4555-8555-555555555554",
  ],
  secretBoundaryBindingIds: ["66666666-6666-4666-8666-666666666666"],
};

const input = {
  actor: "operator:gary",
  membershipUserId: "better-auth-user-mitchel",
};

const walterIds: CanonicalIdentityIds = {
  useCaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  runtimeIdentityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  personaAssignmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  resourceBindingIds: Array.from(
    { length: WALTER_IDENTITY_TEMPLATE.resourceBindings.length },
    (_, index) =>
      `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, "0")}`,
  ),
  secretBoundaryBindingIds: Array.from(
    { length: WALTER_IDENTITY_TEMPLATE.secretBoundaryBindings.length },
    (_, index) =>
      `ffffffff-ffff-4fff-8fff-${String(index).padStart(12, "0")}`,
  ),
};

const walterInput = {
  actor: "operator:gary",
  membershipUserId: "better-auth-user-gary",
};

function emptySnapshot(
  overrides: Partial<IdentityBackfillSnapshot> = {},
): IdentityBackfillSnapshot {
  return {
    schemaReady: true,
    membershipUser: { id: input.membershipUserId, emailVerified: true },
    canonicalConflict: false,
    existingCanonicalState: null,
    ...overrides,
  };
}

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

describe("planWalterFoundation", () => {
  it("creates the guarded Tenet 0 foundation without granting Gary access", () => {
    const plan = planWalterFoundation(
      { actor: walterInput.actor },
      emptyFoundationSnapshot(),
      walterIds,
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan).not.toHaveProperty("membership");
    expect(plan.numberAllocation.number).toBe(0);
    expect(plan.runtimeIdentity.slug).toBe("hermes-walter");
    expect(plan.personaAssignment).toMatchObject({
      personaKey: "walter",
      displayName: "Walter",
      isDefault: true,
    });
    expect(plan.audit.details).toEqual({
      useCaseNumber: 0,
      membershipCount: 0,
      resourceBindingCount: WALTER_IDENTITY_TEMPLATE.resourceBindings.length,
      secretBoundaryBindingCount:
        WALTER_IDENTITY_TEMPLATE.secretBoundaryBindings.length,
      platformInstanceLinked: false,
      orchestratorTenantBound: false,
    });
  });

  it("preserves every active and rollback Walter compatibility name", () => {
    const resourceManifest = WALTER_IDENTITY_TEMPLATE.resourceBindings.map(
      ({ provider, kind, value, state }) => ({ provider, kind, value, state }),
    );

    expect(resourceManifest).toEqual(
      expect.arrayContaining([
        {
          provider: "docker",
          kind: "container",
          value: "hermes-walter",
          state: "active",
        },
        {
          provider: "docker",
          kind: "container",
          value: "hermes-agent",
          state: "rollback",
        },
        {
          provider: "docker",
          kind: "volume",
          value: "hermes-agent-data",
          state: "compatibility",
        },
        {
          provider: "nginx",
          kind: "hostname",
          value: "aegis-prod.overnightdesk.com",
          state: "active",
        },
        {
          provider: "overnightdesk",
          kind: "platform_instance",
          value: "tenant-0",
          state: "compatibility",
        },
        {
          provider: "phase",
          kind: "phase_path",
          value: "/agents/hermes-email-intake/walter",
          state: "active",
        },
        {
          provider: "phase",
          kind: "phase_path",
          value: "/agents/hermes-email-intake/agent",
          state: "rollback",
        },
        {
          provider: "securityteam",
          kind: "intake_route",
          value: "walter",
          state: "active",
        },
        {
          provider: "securityteam",
          kind: "intake_route",
          value: "agent",
          state: "rollback",
        },
      ]),
    );
    expect(WALTER_IDENTITY_TEMPLATE.secretBoundaryBindings).toEqual([
      {
        phaseApp: "overnightdesk",
        environment: "production",
        pathIdentifier: "/agents/hermes-email-intake/walter",
      },
    ]);
  });

  it("returns a verified no-op without changing the canonical IDs", () => {
    const ready = planWalterFoundation(
      { actor: walterInput.actor },
      emptyFoundationSnapshot(),
      walterIds,
    );
    if (ready.status !== "ready") throw new Error("expected a ready plan");

    const plan = planWalterFoundation(
      { actor: walterInput.actor },
      emptyFoundationSnapshot({
        existingCanonicalState: {
          useCase: ready.useCase,
          numberAllocation: ready.numberAllocation,
          runtimeIdentity: ready.runtimeIdentity,
          personaAssignment: ready.personaAssignment,
          membership: null,
          resourceBindings: ready.resourceBindings,
          secretBoundaryBindings: ready.secretBoundaryBindings,
        },
      }),
      { ...walterIds, useCaseId: ids.useCaseId },
    );

    expect(plan).toEqual({
      status: "verified_noop",
      useCaseId: walterIds.useCaseId,
      runtimeIdentityId: walterIds.runtimeIdentityId,
    });
  });
});

describe("planWalterMembershipActivation", () => {
  function foundationState() {
    const foundation = planWalterFoundation(
      { actor: walterInput.actor },
      emptyFoundationSnapshot(),
      walterIds,
    );
    if (foundation.status !== "ready") {
      throw new Error("expected a ready foundation");
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

  it("fails closed when Gary's opaque Better Auth subject is absent", () => {
    const plan = planWalterMembershipActivation(
      walterInput,
      emptySnapshot({
        membershipUser: null,
        existingCanonicalState: foundationState(),
      }),
      walterIds.membershipId,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["membership_user_missing"],
    });
  });

  it("fails closed when Gary's Better Auth subject is not verified", () => {
    const plan = planWalterMembershipActivation(
      walterInput,
      emptySnapshot({
        membershipUser: {
          id: walterInput.membershipUserId,
          emailVerified: false,
        },
        existingCanonicalState: foundationState(),
      }),
      walterIds.membershipId,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["membership_user_unverified"],
    });
  });

  it("plans only Gary's owner membership after verification", () => {
    const plan = planWalterMembershipActivation(
      walterInput,
      emptySnapshot({
        membershipUser: {
          id: walterInput.membershipUserId,
          emailVerified: true,
        },
        existingCanonicalState: foundationState(),
      }),
      walterIds.membershipId,
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan).not.toHaveProperty("useCase");
    expect(plan.membership).toEqual({
      id: walterIds.membershipId,
      useCaseId: walterIds.useCaseId,
      runtimeIdentityId: null,
      userId: walterInput.membershipUserId,
      role: "owner",
      status: "active",
      grantedBy: walterInput.actor,
    });
    expect(JSON.stringify(summarizeMembershipActivationPlan(plan))).not.toContain(
      walterInput.membershipUserId,
    );
  });
});

describe("planMitchelTrevorFoundation", () => {
  it("creates the canonical foundation with zero memberships and no Better Auth user", () => {
    const plan = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan).not.toHaveProperty("membership");
    expect(plan.audit.details.membershipCount).toBe(0);
    expect(plan.numberAllocation.number).toBe(1);
    expect(plan.runtimeIdentity.slug).toBe("hermes-mitchel");
    expect(plan.personaAssignment.personaKey).toBe("trevor");
  });

  it("summarizes foundation plans without resource values", () => {
    const plan = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );

    expect(summarizeIdentityFoundationPlan(plan)).toEqual({
      status: "ready",
      useCaseNumber: 1,
      membershipCount: 0,
      resourceBindingCount: 4,
      secretBoundaryBindingCount: 1,
      platformInstanceLinked: false,
      orchestratorTenantBound: false,
    });
    expect(JSON.stringify(summarizeIdentityFoundationPlan(plan))).not.toContain(
      "aero-fett",
    );
  });

  it("returns a verified no-op when the foundation exists without membership", () => {
    const ready = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );
    if (ready.status !== "ready") throw new Error("expected a ready plan");

    const plan = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot({
        existingCanonicalState: {
          useCase: ready.useCase,
          numberAllocation: ready.numberAllocation,
          runtimeIdentity: ready.runtimeIdentity,
          personaAssignment: ready.personaAssignment,
          membership: null,
          resourceBindings: ready.resourceBindings,
          secretBoundaryBindings: ready.secretBoundaryBindings,
        },
      }),
      ids,
    );

    expect(plan).toEqual({
      status: "verified_noop",
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
    });
  });
});

describe("planMitchelMembershipActivation", () => {
  it("adds only membership after an email-verified Better Auth user exists", () => {
    const foundation = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );
    if (foundation.status !== "ready") {
      throw new Error("expected a ready foundation");
    }

    const plan = planMitchelMembershipActivation(
      input,
      emptySnapshot({
        existingCanonicalState: {
          useCase: foundation.useCase,
          numberAllocation: foundation.numberAllocation,
          runtimeIdentity: foundation.runtimeIdentity,
          personaAssignment: foundation.personaAssignment,
          membership: null,
          resourceBindings: foundation.resourceBindings,
          secretBoundaryBindings: foundation.secretBoundaryBindings,
        },
      }),
      ids.membershipId,
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan).not.toHaveProperty("useCase");
    expect(plan.membership).toMatchObject({
      useCaseId: ids.useCaseId,
      userId: input.membershipUserId,
      role: "owner",
      status: "active",
    });
    expect(plan.audit.details).toEqual({ membershipCount: 1 });
  });

  it("summarizes membership activation without the Better Auth user ID", () => {
    const foundation = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );
    if (foundation.status !== "ready") {
      throw new Error("expected a ready foundation");
    }
    const plan = planMitchelMembershipActivation(
      input,
      emptySnapshot({
        existingCanonicalState: {
          useCase: foundation.useCase,
          numberAllocation: foundation.numberAllocation,
          runtimeIdentity: foundation.runtimeIdentity,
          personaAssignment: foundation.personaAssignment,
          membership: null,
          resourceBindings: foundation.resourceBindings,
          secretBoundaryBindings: foundation.secretBoundaryBindings,
        },
      }),
      ids.membershipId,
    );

    expect(summarizeMembershipActivationPlan(plan)).toEqual({
      status: "ready",
      membershipCount: 1,
    });
    expect(JSON.stringify(summarizeMembershipActivationPlan(plan))).not.toContain(
      input.membershipUserId,
    );
  });

  it("suppresses membership IDs from verified no-op output", () => {
    expect(
      summarizeMembershipActivationPlan({
        status: "verified_noop",
        membershipId: ids.membershipId,
      }),
    ).toEqual({ status: "verified_noop" });
  });

  it("blocks membership while leaving a valid foundation usable for resolution", () => {
    const foundation = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );
    if (foundation.status !== "ready") {
      throw new Error("expected a ready foundation");
    }

    const plan = planMitchelMembershipActivation(
      input,
      emptySnapshot({
        membershipUser: null,
        existingCanonicalState: {
          useCase: foundation.useCase,
          numberAllocation: foundation.numberAllocation,
          runtimeIdentity: foundation.runtimeIdentity,
          personaAssignment: foundation.personaAssignment,
          membership: null,
          resourceBindings: foundation.resourceBindings,
          secretBoundaryBindings: foundation.secretBoundaryBindings,
        },
      }),
      ids.membershipId,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["membership_user_missing"],
    });
  });

  it("accepts additive foundation bindings when attaching membership", () => {
    const foundation = planMitchelTrevorFoundation(
      { actor: input.actor },
      emptyFoundationSnapshot(),
      ids,
    );
    if (foundation.status !== "ready") {
      throw new Error("expected a ready foundation");
    }

    const plan = planMitchelMembershipActivation(
      input,
      emptySnapshot({
        existingCanonicalState: {
          useCase: foundation.useCase,
          numberAllocation: foundation.numberAllocation,
          runtimeIdentity: foundation.runtimeIdentity,
          personaAssignment: foundation.personaAssignment,
          membership: null,
          resourceBindings: [
            ...foundation.resourceBindings,
            {
              id: "77777777-7777-4777-8777-777777777777",
              useCaseId: foundation.useCase.id,
              runtimeIdentityId: foundation.runtimeIdentity.id,
              provider: "orchestrator",
              kind: "orchestrator_tenant",
              value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              state: "active",
            },
          ],
          secretBoundaryBindings: [
            ...foundation.secretBoundaryBindings,
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              useCaseId: foundation.useCase.id,
              runtimeIdentityId: foundation.runtimeIdentity.id,
              phaseApp: "overnightdesk",
              environment: "development",
              pathIdentifier: "/agents/hermes-email-intake/mitchel",
            },
          ],
        },
      }),
      ids.membershipId,
    );

    expect(plan.status).toBe("ready");
  });
});

describe("planMitchelTrevorBackfill", () => {
  it("blocks without writing when the canonical schema is not deployed", () => {
    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({ schemaReady: false }),
      ids,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["identity_schema_missing"],
    });
  });

  it("blocks without writing when Mitchel has no Better Auth subject", () => {
    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({ membershipUser: null }),
      ids,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["membership_user_missing"],
    });
  });

  it("blocks without writing when Mitchel has not verified his email", () => {
    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({
        membershipUser: {
          id: input.membershipUserId,
          emailVerified: false,
        },
      }),
      ids,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["membership_user_unverified"],
    });
  });

  it("creates an additive Tenet 1 plan without inventing absent registry rows", () => {
    const plan = planMitchelTrevorBackfill(input, emptySnapshot(), ids);

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");

    expect(plan.useCase).toEqual({
      id: ids.useCaseId,
      slug: "mitchel-business",
      displayName: "Mitchel business workflows",
      status: "active",
    });
    expect(plan.numberAllocation.number).toBe(1);
    expect(plan.membership).toMatchObject({
      userId: input.membershipUserId,
      role: "owner",
      status: "active",
    });
    expect(plan.personaAssignment).toMatchObject({
      personaKey: "trevor",
      displayName: "Trevor",
      isDefault: true,
    });
    expect(plan.resourceBindings).toHaveLength(4);
    expect(
      plan.resourceBindings.some(
        (binding) => binding.kind === "orchestrator_tenant",
      ),
    ).toBe(false);
    expect(plan.audit.details).toEqual({
      useCaseNumber: 1,
      membershipCount: 1,
      resourceBindingCount: 4,
      secretBoundaryBindingCount: 1,
      platformInstanceLinked: false,
      orchestratorTenantBound: false,
    });
    expect(JSON.stringify(plan.audit)).not.toContain("aero-fett");
    expect(JSON.stringify(plan.audit)).not.toContain("hermes-mitchel-data");
    expect(JSON.stringify(plan.audit)).not.toContain("/agents/");
  });

  it("refuses partial or conflicting canonical state", () => {
    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({
        existingCanonicalState: {
          useCase: {
            id: ids.useCaseId,
            slug: "wrong-slug",
            displayName: "Mitchel business workflows",
            status: "active",
          },
          numberAllocation: null,
          runtimeIdentity: null,
          personaAssignment: null,
          membership: null,
          resourceBindings: [],
          secretBoundaryBindings: [],
        },
      }),
      ids,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["canonical_state_drift"],
    });
  });

  it("refuses a number, slug, or runtime collision before generating writes", () => {
    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({ canonicalConflict: true }),
      ids,
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["canonical_identity_conflict"],
    });
  });

  it("returns a verified no-op when the required allocation is present", () => {
    const ready = planMitchelTrevorBackfill(input, emptySnapshot(), ids);
    if (ready.status !== "ready") throw new Error("expected a ready plan");

    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({
        existingCanonicalState: {
          useCase: ready.useCase,
          numberAllocation: ready.numberAllocation,
          runtimeIdentity: ready.runtimeIdentity,
          personaAssignment: ready.personaAssignment,
          membership: ready.membership,
          resourceBindings: [
            ...ready.resourceBindings,
            {
              id: "77777777-7777-4777-8777-777777777777",
              useCaseId: ready.useCase.id,
              runtimeIdentityId: ready.runtimeIdentity.id,
              provider: "orchestrator",
              kind: "orchestrator_tenant",
              value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              state: "active",
            },
          ],
          secretBoundaryBindings: [
            ...ready.secretBoundaryBindings,
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              useCaseId: ready.useCase.id,
              runtimeIdentityId: ready.runtimeIdentity.id,
              phaseApp: "overnightdesk",
              environment: "development",
              pathIdentifier: "/agents/hermes-email-intake/mitchel",
            },
          ],
        },
      }),
      {
        ...ids,
        useCaseId: "88888888-8888-4888-8888-888888888888",
        runtimeIdentityId: "99999999-9999-4999-8999-999999999999",
      },
    );

    expect(plan).toEqual({
      status: "verified_noop",
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
    });
  });

  it("keeps the approved manifest bounded to the Mitchel/Trevor use case", () => {
    expect(MITCHEL_TREVOR_IDENTITY_TEMPLATE.number).toBe(1);
    expect(MITCHEL_TREVOR_IDENTITY_TEMPLATE.runtime.slug).toBe(
      "hermes-mitchel",
    );
    expect(MITCHEL_TREVOR_IDENTITY_TEMPLATE.persona.personaKey).toBe("trevor");
  });

  it("formats operator output without user IDs or resource values", () => {
    const ready = planMitchelTrevorBackfill(input, emptySnapshot(), ids);
    const summary = summarizeIdentityBackfillPlan(ready);

    expect(summary).toEqual({
      status: "ready",
      useCaseNumber: 1,
      membershipCount: 1,
      resourceBindingCount: 4,
      secretBoundaryBindingCount: 1,
      platformInstanceLinked: false,
      orchestratorTenantBound: false,
    });
    expect(JSON.stringify(summary)).not.toContain(input.membershipUserId);
    expect(JSON.stringify(summary)).not.toContain("aero-fett");
    expect(JSON.stringify(summary)).not.toContain("/agents/");
  });
});
