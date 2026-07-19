import {
  MITCHEL_TREVOR_IDENTITY_TEMPLATE,
  planMitchelTrevorBackfill,
  type CanonicalIdentityIds,
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
  secretBoundaryBindingIds: [
    "66666666-6666-4666-8666-666666666666",
  ],
};

const input = {
  actor: "operator:gary",
  membershipUserId: "better-auth-user-mitchel",
  platformInstanceId: null,
  orchestratorTenantId: null,
};

function emptySnapshot(
  overrides: Partial<IdentityBackfillSnapshot> = {}
): IdentityBackfillSnapshot {
  return {
    schemaReady: true,
    membershipUser: { id: input.membershipUserId },
    platformInstance: null,
    existingCanonicalState: null,
    ...overrides,
  };
}

describe("planMitchelTrevorBackfill", () => {
  it("blocks without writing when the canonical schema is not deployed", () => {
    const plan = planMitchelTrevorBackfill(
      input,
      emptySnapshot({ schemaReady: false }),
      ids
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
      ids
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["membership_user_missing"],
    });
  });

  it("rejects a platform instance owned by another Better Auth subject", () => {
    const plan = planMitchelTrevorBackfill(
      { ...input, platformInstanceId: "platform-instance-1" },
      emptySnapshot({
        platformInstance: {
          id: "platform-instance-1",
          userId: "different-user",
          useCaseId: null,
          runtimeIdentityId: null,
        },
      }),
      ids
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["platform_instance_owner_mismatch"],
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
    expect(plan.platformInstanceUpdate).toBeNull();
    expect(plan.resourceBindings).toHaveLength(4);
    expect(
      plan.resourceBindings.some(
        (binding) => binding.kind === "orchestrator_tenant"
      )
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

  it("adds explicit platform and orchestrator bindings only when supplied", () => {
    const plan = planMitchelTrevorBackfill(
      {
        ...input,
        platformInstanceId: "platform-instance-1",
        orchestratorTenantId: "77777777-7777-4777-8777-777777777777",
      },
      emptySnapshot({
        platformInstance: {
          id: "platform-instance-1",
          userId: input.membershipUserId,
          useCaseId: null,
          runtimeIdentityId: null,
        },
      }),
      {
        ...ids,
        resourceBindingIds: [
          ...ids.resourceBindingIds,
          "55555555-5555-4555-8555-555555555555",
          "55555555-5555-4555-8555-555555555556",
        ],
      }
    );

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("expected a ready plan");
    expect(plan.platformInstanceUpdate).toEqual({
      id: "platform-instance-1",
      useCaseId: ids.useCaseId,
      runtimeIdentityId: ids.runtimeIdentityId,
    });
    expect(plan.resourceBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "better_auth",
          kind: "platform_instance",
          value: "platform-instance-1",
        }),
        expect.objectContaining({
          provider: "orchestrator",
          kind: "orchestrator_tenant",
          value: "77777777-7777-4777-8777-777777777777",
        }),
      ])
    );
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
      ids
    );

    expect(plan).toEqual({
      status: "blocked",
      reasons: ["canonical_state_drift"],
    });
  });

  it("returns a verified no-op for an exact prior allocation", () => {
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
          resourceBindings: ready.resourceBindings,
          secretBoundaryBindings: ready.secretBoundaryBindings,
        },
      }),
      {
        ...ids,
        useCaseId: "88888888-8888-4888-8888-888888888888",
        runtimeIdentityId: "99999999-9999-4999-8999-999999999999",
      }
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
      "hermes-mitchel"
    );
    expect(MITCHEL_TREVOR_IDENTITY_TEMPLATE.persona.personaKey).toBe("trevor");
  });
});
