import {
  buildMembershipAuthorizationAuditRecord,
  createUseCaseMembershipAuthorizer,
  type MembershipAuthorizationAuditEvent,
} from "@/lib/use-case-membership-authorization";
import {
  FixtureMembershipStore,
  MEMBERSHIP_FIXTURE_IDS,
  MEMBERSHIP_FIXTURE_NOW,
  MEMBERSHIP_RUNTIME_FIXTURES,
} from "@/lib/__tests__/fixtures/use-case-membership";

describe("canonical use-case membership authorization", () => {
  function auditRecorder() {
    const events: MembershipAuthorizationAuditEvent[] = [];
    return {
      events,
      audit: async (event: MembershipAuthorizationAuditEvent) => {
        events.push(event);
      },
    };
  }

  function authorizer(
    store = new FixtureMembershipStore(),
    options: { cacheTtlMs?: number; now?: () => Date } = {}
  ) {
    const recorder = auditRecorder();
    return {
      recorder,
      store,
      authorizer: createUseCaseMembershipAuthorizer({
        store,
        assignment: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment,
        audit: recorder.audit,
        now: options.now ?? (() => MEMBERSHIP_FIXTURE_NOW),
        cacheTtlMs: options.cacheTtlMs,
      }),
    };
  }

  it.each(Object.entries(MEMBERSHIP_RUNTIME_FIXTURES))(
    "authorizes the same integration contract for %s",
    async (_name, fixture) => {
      const recorder = auditRecorder();
      const boundary = createUseCaseMembershipAuthorizer({
        store: new FixtureMembershipStore(),
        assignment: fixture.assignment,
        audit: recorder.audit,
        now: () => MEMBERSHIP_FIXTURE_NOW,
      });

      await expect(boundary.authorize({ userId: fixture.userId })).resolves.toEqual(
        expect.objectContaining({
          authorized: true,
          useCaseId: fixture.assignment.useCaseId,
          runtimeIdentityId: fixture.assignment.runtimeIdentityId,
        })
      );
    }
  );

  it("prefers a runtime-scoped membership over a use-case membership", async () => {
    const { authorizer: boundary } = authorizer();

    await expect(
      boundary.authorize({ userId: MEMBERSHIP_FIXTURE_IDS.runtimeMember })
    ).resolves.toMatchObject({
      authorized: true,
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      role: "operator",
      scope: "runtime",
    });
  });

  it.each([
    ["non-member", MEMBERSHIP_FIXTURE_IDS.nonMember],
    ["wrong-use-case member", MEMBERSHIP_FIXTURE_IDS.wrongUseCaseMember],
    ["suspended member", MEMBERSHIP_FIXTURE_IDS.suspendedMember],
  ])("denies an authenticated %s", async (_label, userId) => {
    const { authorizer: boundary } = authorizer();

    await expect(boundary.authorize({ userId })).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("binds assignment server-side and rejects aliases or Tenet numbers", () => {
    const recorder = auditRecorder();

    expect(() =>
      createUseCaseMembershipAuthorizer({
        store: new FixtureMembershipStore(),
        assignment: {
          ...MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment,
          tenetNumber: 1,
        } as never,
        audit: recorder.audit,
      })
    ).toThrow("Invalid canonical runtime assignment");
  });

  it("emits metadata-only denial audit without subject or resource aliases", async () => {
    const { authorizer: boundary, recorder } = authorizer();

    await boundary.authorize({ userId: MEMBERSHIP_FIXTURE_IDS.nonMember });

    expect(recorder.events).toEqual([
      {
        eventType: "membership_authorization_denied",
        reason: "not_authorized",
        useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.useCaseId,
        runtimeIdentityId:
          MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.runtimeIdentityId,
        cache: "miss",
        subjectFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
      },
    ]);
    const serialized = JSON.stringify(recorder.events);
    expect(serialized).not.toContain(MEMBERSHIP_FIXTURE_IDS.nonMember);
    expect(serialized).not.toContain("hermes-mitchel");
    expect(serialized).not.toContain("Trevor");
    expect(serialized).not.toContain("tenetNumber");
  });

  it("builds a persistable metadata-only platform audit record", () => {
    expect(
      buildMembershipAuthorizationAuditRecord({
        eventType: "membership_authorization_denied",
        reason: "not_authorized",
        useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.useCaseId,
        runtimeIdentityId:
          MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.runtimeIdentityId,
        cache: "miss",
        subjectFingerprint: "0123456789abcdef",
      })
    ).toEqual({
      actor: "membership-authorizer",
      action: "use_case_membership_authorization.denied",
      target: `use_case:${MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.useCaseId}`,
      details: {
        reason: "not_authorized",
        useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.useCaseId,
        runtimeIdentityId:
          MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.runtimeIdentityId,
        cache: "miss",
        subjectFingerprint: "0123456789abcdef",
      },
    });
  });

  it("does not cache grants unless a caller explicitly configures a TTL", async () => {
    const store = new FixtureMembershipStore();
    const { authorizer: boundary } = authorizer(store);
    const request = { userId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.userId };

    await expect(boundary.authorize(request)).resolves.toMatchObject({
      authorized: true,
    });
    store.update("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", {
      status: "suspended",
    });

    await expect(boundary.authorize(request)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("does not let an explicitly cached grant outlive membership expiry", async () => {
    let now = new Date(MEMBERSHIP_FIXTURE_NOW);
    const { authorizer: boundary } = authorizer(new FixtureMembershipStore(), {
      now: () => now,
      cacheTtlMs: 60_000,
    });
    const request = { userId: MEMBERSHIP_FIXTURE_IDS.expiringMember };

    await expect(boundary.authorize(request)).resolves.toMatchObject({
      authorized: true,
    });
    now = new Date("2026-07-19T12:00:05.000Z");

    await expect(boundary.authorize(request)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("rechecks membership after an explicit cache TTL expires", async () => {
    let now = new Date(MEMBERSHIP_FIXTURE_NOW);
    const store = new FixtureMembershipStore();
    const { authorizer: boundary } = authorizer(store, {
      now: () => now,
      cacheTtlMs: 5_000,
    });
    const request = { userId: MEMBERSHIP_FIXTURE_IDS.cacheMember };

    await expect(boundary.authorize(request)).resolves.toMatchObject({
      authorized: true,
    });
    store.update("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", {
      status: "suspended",
    });
    now = new Date("2026-07-19T12:00:05.000Z");

    await expect(boundary.authorize(request)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("denies a cached grant immediately after explicit user invalidation", async () => {
    const store = new FixtureMembershipStore();
    const { authorizer: boundary } = authorizer(store, { cacheTtlMs: 60_000 });
    const request = { userId: MEMBERSHIP_FIXTURE_IDS.cacheMember };

    await expect(boundary.authorize(request)).resolves.toMatchObject({
      authorized: true,
    });
    store.update("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", {
      status: "suspended",
    });
    await expect(boundary.authorize(request)).resolves.toMatchObject({
      authorized: true,
    });

    boundary.invalidateUser(MEMBERSHIP_FIXTURE_IDS.cacheMember);

    await expect(boundary.authorize(request)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("fails closed and audits when membership storage is unavailable", async () => {
    const recorder = auditRecorder();
    const boundary = createUseCaseMembershipAuthorizer({
      store: {
        findActiveMembership: async () => {
          throw new Error("fixture database unavailable");
        },
      },
      assignment: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment,
      audit: recorder.audit,
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      boundary.authorize({ userId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.userId })
    ).resolves.toEqual({
      authorized: false,
      reason: "authorization_unavailable",
    });
    expect(recorder.events[0]).toMatchObject({
      eventType: "membership_authorization_denied",
      reason: "authorization_unavailable",
    });
  });

  it("fails closed when a grant cannot be audited", async () => {
    const boundary = createUseCaseMembershipAuthorizer({
      store: new FixtureMembershipStore(),
      assignment: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment,
      audit: async () => {
        throw new Error("audit unavailable");
      },
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      boundary.authorize({ userId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.userId })
    ).resolves.toEqual({
      authorized: false,
      reason: "authorization_unavailable",
    });
  });
});
