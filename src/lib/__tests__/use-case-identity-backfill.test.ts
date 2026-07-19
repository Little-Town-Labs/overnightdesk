import {
  MITCHEL_TREVOR_IDENTITY_TEMPLATE,
  planMitchelTrevorBackfill,
  summarizeIdentityBackfillPlan,
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
  secretBoundaryBindingIds: ["66666666-6666-4666-8666-666666666666"],
};

const input = {
  actor: "operator:gary",
  membershipUserId: "better-auth-user-mitchel",
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
