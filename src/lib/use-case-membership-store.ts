import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { runtimeIdentity, useCase, useCaseMembership } from "@/db/schema";
import type {
  MembershipAuthorizationRecord,
  MembershipAuthorizationStore,
  MembershipLookup,
} from "@/lib/use-case-membership-authorization";

type Database = typeof db;

const membershipColumns = {
  id: useCaseMembership.id,
  useCaseId: useCaseMembership.useCaseId,
  runtimeIdentityId: useCaseMembership.runtimeIdentityId,
  userId: useCaseMembership.userId,
  role: useCaseMembership.role,
  status: useCaseMembership.status,
  expiresAt: useCaseMembership.expiresAt,
};

async function assignmentIsActive(
  lookup: MembershipLookup,
  database: Database
): Promise<boolean> {
  if (lookup.runtimeIdentityId === null) {
    const rows = await database
      .select({ id: useCase.id })
      .from(useCase)
      .where(
        and(eq(useCase.id, lookup.useCaseId), eq(useCase.status, "active"))
      )
      .limit(1);
    return rows.length === 1;
  }

  const rows = await database
    .select({ id: runtimeIdentity.id })
    .from(runtimeIdentity)
    .innerJoin(useCase, eq(runtimeIdentity.useCaseId, useCase.id))
    .where(
      and(
        eq(runtimeIdentity.id, lookup.runtimeIdentityId),
        eq(runtimeIdentity.useCaseId, lookup.useCaseId),
        eq(runtimeIdentity.status, "active"),
        eq(useCase.status, "active")
      )
    )
    .limit(1);
  return rows.length === 1;
}

async function findActiveMembership(
  lookup: MembershipLookup,
  database: Database
): Promise<MembershipAuthorizationRecord | null> {
  if (!(await assignmentIsActive(lookup, database))) return null;

  const scope =
    lookup.runtimeIdentityId === null
      ? isNull(useCaseMembership.runtimeIdentityId)
      : or(
          isNull(useCaseMembership.runtimeIdentityId),
          eq(useCaseMembership.runtimeIdentityId, lookup.runtimeIdentityId)
        );
  const rows = await database
    .select(membershipColumns)
    .from(useCaseMembership)
    .where(
      and(
        eq(useCaseMembership.userId, lookup.userId),
        eq(useCaseMembership.useCaseId, lookup.useCaseId),
        eq(useCaseMembership.status, "active"),
        or(
          isNull(useCaseMembership.expiresAt),
          gt(useCaseMembership.expiresAt, lookup.now)
        ),
        scope
      )
    );

  return (
    rows.find(
      (row) => row.runtimeIdentityId === lookup.runtimeIdentityId
    ) ??
    rows.find((row) => row.runtimeIdentityId === null) ??
    null
  );
}

/** Creates the canonical membership lookup without selecting any aliases. */
export function createDrizzleUseCaseMembershipStore(
  database: Database = db
): MembershipAuthorizationStore {
  return {
    findActiveMembership: (lookup) => findActiveMembership(lookup, database),
  };
}

export const useCaseMembershipStore = createDrizzleUseCaseMembershipStore();
