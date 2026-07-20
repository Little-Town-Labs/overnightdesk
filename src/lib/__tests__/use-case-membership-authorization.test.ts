import { createUseCaseMembershipAuthorizer } from "@/lib/use-case-membership-authorization";
import {
  FixtureMembershipStore,
  MEMBERSHIP_FIXTURE_IDS,
  MEMBERSHIP_FIXTURE_NOW,
} from "@/lib/__tests__/fixtures/use-case-membership";

describe("canonical use-case membership authorization", () => {
  function request(userId: string) {
    return {
      userId,
      useCaseId: MEMBERSHIP_FIXTURE_IDS.mitchelUseCase,
      runtimeIdentityId: MEMBERSHIP_FIXTURE_IDS.mitchelRuntime,
    };
  }

  it("authorizes an active use-case member for its runtime", async () => {
    const authorizer = createUseCaseMembershipAuthorizer({
      store: new FixtureMembershipStore(),
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      authorizer.authorize(request(MEMBERSHIP_FIXTURE_IDS.activeMember))
    ).resolves.toMatchObject({ authorized: true, scope: "use_case" });
  });

  it("denies an authenticated user with no membership", async () => {
    const authorizer = createUseCaseMembershipAuthorizer({
      store: new FixtureMembershipStore(),
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      authorizer.authorize(request(MEMBERSHIP_FIXTURE_IDS.nonMember))
    ).resolves.toEqual({ authorized: false, reason: "not_authorized" });
  });

  it("denies a member whose active membership belongs to another use case", async () => {
    const authorizer = createUseCaseMembershipAuthorizer({
      store: new FixtureMembershipStore(),
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      authorizer.authorize(request(MEMBERSHIP_FIXTURE_IDS.wrongUseCaseMember))
    ).resolves.toEqual({ authorized: false, reason: "not_authorized" });
  });

  it("denies a suspended member", async () => {
    const authorizer = createUseCaseMembershipAuthorizer({
      store: new FixtureMembershipStore(),
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      authorizer.authorize(request(MEMBERSHIP_FIXTURE_IDS.suspendedMember))
    ).resolves.toEqual({ authorized: false, reason: "not_authorized" });
  });

  it("does not cache grants unless a caller explicitly configures a TTL", async () => {
    const store = new FixtureMembershipStore();
    const authorizer = createUseCaseMembershipAuthorizer({
      store,
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });
    const authorizationRequest = request(MEMBERSHIP_FIXTURE_IDS.activeMember);

    await expect(authorizer.authorize(authorizationRequest)).resolves.toMatchObject({
      authorized: true,
    });
    store.update("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", {
      status: "suspended",
    });

    await expect(authorizer.authorize(authorizationRequest)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("does not let a cached grant outlive membership expiry", async () => {
    let now = new Date(MEMBERSHIP_FIXTURE_NOW);
    const authorizer = createUseCaseMembershipAuthorizer({
      store: new FixtureMembershipStore(),
      now: () => now,
      cacheTtlMs: 60_000,
    });
    const authorizationRequest = request(MEMBERSHIP_FIXTURE_IDS.expiringMember);

    await expect(authorizer.authorize(authorizationRequest)).resolves.toMatchObject({
      authorized: true,
    });
    now = new Date("2026-07-19T12:00:05.000Z");

    await expect(authorizer.authorize(authorizationRequest)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("rechecks membership after a cached authorization expires", async () => {
    let now = new Date(MEMBERSHIP_FIXTURE_NOW);
    const store = new FixtureMembershipStore();
    const authorizer = createUseCaseMembershipAuthorizer({
      store,
      now: () => now,
      cacheTtlMs: 5_000,
    });
    const authorizationRequest = request(MEMBERSHIP_FIXTURE_IDS.cacheMember);

    await expect(authorizer.authorize(authorizationRequest)).resolves.toMatchObject({
      authorized: true,
    });
    store.update("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", {
      status: "suspended",
    });
    now = new Date("2026-07-19T12:00:05.000Z");

    await expect(authorizer.authorize(authorizationRequest)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("denies a cached grant immediately after explicit user invalidation", async () => {
    const store = new FixtureMembershipStore();
    const authorizer = createUseCaseMembershipAuthorizer({
      store,
      now: () => MEMBERSHIP_FIXTURE_NOW,
      cacheTtlMs: 60_000,
    });
    const authorizationRequest = request(MEMBERSHIP_FIXTURE_IDS.cacheMember);

    await expect(authorizer.authorize(authorizationRequest)).resolves.toMatchObject({
      authorized: true,
    });
    store.update("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", {
      status: "suspended",
    });
    await expect(authorizer.authorize(authorizationRequest)).resolves.toMatchObject({
      authorized: true,
    });

    authorizer.invalidateUser(MEMBERSHIP_FIXTURE_IDS.cacheMember);

    await expect(authorizer.authorize(authorizationRequest)).resolves.toEqual({
      authorized: false,
      reason: "not_authorized",
    });
  });

  it("fails closed when membership storage is unavailable", async () => {
    const authorizer = createUseCaseMembershipAuthorizer({
      store: {
        listForUser: async () => {
          throw new Error("fixture database unavailable");
        },
      },
      now: () => MEMBERSHIP_FIXTURE_NOW,
    });

    await expect(
      authorizer.authorize(request(MEMBERSHIP_FIXTURE_IDS.activeMember))
    ).resolves.toEqual({
      authorized: false,
      reason: "authorization_unavailable",
    });
  });
});
