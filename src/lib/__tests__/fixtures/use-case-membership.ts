import type {
  CanonicalRuntimeAssignment,
  MembershipAuthorizationRecord,
  MembershipAuthorizationStore,
  MembershipLookup,
} from "@/lib/use-case-membership-authorization";

export const MEMBERSHIP_FIXTURE_NOW = new Date("2026-07-19T12:00:00.000Z");

export const MEMBERSHIP_RUNTIME_FIXTURES = {
  walter: {
    assignment: {
      useCaseId: "00000000-0000-4000-8000-000000000000",
      runtimeIdentityId: "00000000-0000-4000-8000-000000000001",
    },
    userId: "fixture-user-walter",
  },
  trevor: {
    assignment: {
      useCaseId: "11111111-1111-4111-8111-111111111111",
      runtimeIdentityId: "22222222-2222-4222-8222-222222222222",
    },
    userId: "fixture-user-trevor",
  },
  titus: {
    assignment: {
      useCaseId: "33333333-3333-4333-8333-333333333333",
      runtimeIdentityId: "44444444-4444-4444-8444-444444444444",
    },
    userId: "fixture-user-titus",
  },
} as const satisfies Record<
  string,
  { assignment: CanonicalRuntimeAssignment; userId: string }
>;

export const MEMBERSHIP_FIXTURE_IDS = {
  nonMember: "fixture-user-none",
  wrongUseCaseMember: "fixture-user-wrong-use-case",
  suspendedMember: "fixture-user-suspended",
  expiringMember: "fixture-user-expiring",
  cacheMember: "fixture-user-cache",
  runtimeMember: "fixture-user-runtime",
} as const;

function membership(
  overrides: Partial<MembershipAuthorizationRecord> &
    Pick<MembershipAuthorizationRecord, "id" | "userId">
): MembershipAuthorizationRecord {
  return {
    useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.useCaseId,
    runtimeIdentityId: null,
    role: "member",
    status: "active",
    expiresAt: null,
    ...overrides,
  };
}

export function controlledMembershipFixtures(): MembershipAuthorizationRecord[] {
  return [
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0",
      userId: MEMBERSHIP_RUNTIME_FIXTURES.walter.userId,
      useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.walter.assignment.useCaseId,
      role: "owner",
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      userId: MEMBERSHIP_RUNTIME_FIXTURES.trevor.userId,
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      userId: MEMBERSHIP_RUNTIME_FIXTURES.titus.userId,
      useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.titus.assignment.useCaseId,
      role: "owner",
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      userId: MEMBERSHIP_FIXTURE_IDS.wrongUseCaseMember,
      useCaseId: MEMBERSHIP_RUNTIME_FIXTURES.walter.assignment.useCaseId,
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      userId: MEMBERSHIP_FIXTURE_IDS.suspendedMember,
      status: "suspended",
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      userId: MEMBERSHIP_FIXTURE_IDS.expiringMember,
      expiresAt: new Date("2026-07-19T12:00:05.000Z"),
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
      userId: MEMBERSHIP_FIXTURE_IDS.cacheMember,
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      userId: MEMBERSHIP_FIXTURE_IDS.runtimeMember,
      role: "viewer",
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8",
      userId: MEMBERSHIP_FIXTURE_IDS.runtimeMember,
      runtimeIdentityId:
        MEMBERSHIP_RUNTIME_FIXTURES.trevor.assignment.runtimeIdentityId,
      role: "operator",
    }),
  ];
}

export class FixtureMembershipStore implements MembershipAuthorizationStore {
  private records: MembershipAuthorizationRecord[];

  constructor(records = controlledMembershipFixtures()) {
    this.records = records.map((record) => ({ ...record }));
  }

  async findActiveMembership(
    lookup: MembershipLookup
  ): Promise<MembershipAuthorizationRecord | null> {
    const matches = this.records.filter(
      (record) =>
        record.userId === lookup.userId &&
        record.useCaseId === lookup.useCaseId &&
        record.status === "active" &&
        (record.expiresAt === null || record.expiresAt > lookup.now) &&
        (lookup.runtimeIdentityId === null
          ? record.runtimeIdentityId === null
          : record.runtimeIdentityId === null ||
            record.runtimeIdentityId === lookup.runtimeIdentityId)
    );

    return (
      matches.find(
        (record) => record.runtimeIdentityId === lookup.runtimeIdentityId
      ) ??
      matches.find((record) => record.runtimeIdentityId === null) ??
      null
    );
  }

  update(
    membershipId: string,
    changes: Partial<MembershipAuthorizationRecord>
  ): void {
    this.records = this.records.map((record) =>
      record.id === membershipId ? { ...record, ...changes } : record
    );
  }
}
