import type {
  MembershipAuthorizationRecord,
  MembershipAuthorizationStore,
} from "@/lib/use-case-membership-authorization";

export const MEMBERSHIP_FIXTURE_IDS = {
  mitchelUseCase: "11111111-1111-4111-8111-111111111111",
  mitchelRuntime: "22222222-2222-4222-8222-222222222222",
  otherUseCase: "33333333-3333-4333-8333-333333333333",
  otherRuntime: "44444444-4444-4444-8444-444444444444",
  activeMember: "fixture-user-active",
  nonMember: "fixture-user-none",
  wrongUseCaseMember: "fixture-user-wrong-use-case",
  suspendedMember: "fixture-user-suspended",
  expiringMember: "fixture-user-expiring",
  cacheMember: "fixture-user-cache",
} as const;

export const MEMBERSHIP_FIXTURE_NOW = new Date("2026-07-19T12:00:00.000Z");

function membership(
  overrides: Partial<MembershipAuthorizationRecord> &
    Pick<MembershipAuthorizationRecord, "id" | "userId">
): MembershipAuthorizationRecord {
  return {
    useCaseId: MEMBERSHIP_FIXTURE_IDS.mitchelUseCase,
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
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      userId: MEMBERSHIP_FIXTURE_IDS.activeMember,
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      userId: MEMBERSHIP_FIXTURE_IDS.wrongUseCaseMember,
      useCaseId: MEMBERSHIP_FIXTURE_IDS.otherUseCase,
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      userId: MEMBERSHIP_FIXTURE_IDS.suspendedMember,
      status: "suspended",
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      userId: MEMBERSHIP_FIXTURE_IDS.expiringMember,
      expiresAt: new Date("2026-07-19T12:00:05.000Z"),
    }),
    membership({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      userId: MEMBERSHIP_FIXTURE_IDS.cacheMember,
    }),
  ];
}

export class FixtureMembershipStore implements MembershipAuthorizationStore {
  private records: MembershipAuthorizationRecord[];

  constructor(records = controlledMembershipFixtures()) {
    this.records = records.map((record) => ({ ...record }));
  }

  async listForUser(userId: string): Promise<MembershipAuthorizationRecord[]> {
    return this.records
      .filter((record) => record.userId === userId)
      .map((record) => ({ ...record }));
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
