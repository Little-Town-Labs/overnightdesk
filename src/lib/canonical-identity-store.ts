import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  instance,
  resourceBinding,
  runtimeIdentity,
  useCase,
  useCaseNumberAllocation,
} from "@/db/schema";
import type {
  CanonicalIdentity,
  CanonicalIdentitySelector,
  CanonicalIdentityStore,
} from "@/lib/canonical-identity";

type Database = typeof db;

const useCaseColumns = {
  useCaseId: useCase.id,
  useCaseNumber: useCaseNumberAllocation.number,
  useCaseSlug: useCase.slug,
};

const runtimeColumns = {
  runtimeId: runtimeIdentity.id,
  runtimeSlug: runtimeIdentity.slug,
};

function withoutRuntime(row: {
  useCaseId: string;
  useCaseNumber: number | null;
  useCaseSlug: string;
}): CanonicalIdentity {
  return { ...row, runtimeId: null, runtimeSlug: null };
}

async function resolveUseCase(
  database: Database,
  column: typeof useCase.id,
  value: string
): Promise<CanonicalIdentity | null> {
  const rows = await database
    .select(useCaseColumns)
    .from(useCase)
    .leftJoin(
      useCaseNumberAllocation,
      eq(useCaseNumberAllocation.useCaseId, useCase.id)
    )
    .where(eq(column, value))
    .limit(1);
  return rows[0] ? withoutRuntime(rows[0]) : null;
}

async function resolveUseCaseNumber(
  database: Database,
  number: number
): Promise<CanonicalIdentity | null> {
  const rows = await database
    .select(useCaseColumns)
    .from(useCaseNumberAllocation)
    .innerJoin(useCase, eq(useCaseNumberAllocation.useCaseId, useCase.id))
    .where(eq(useCaseNumberAllocation.number, number))
    .limit(1);
  return rows[0] ? withoutRuntime(rows[0]) : null;
}

async function resolveRuntime(
  database: Database,
  runtimeId: string
): Promise<CanonicalIdentity | null> {
  const rows = await database
    .select({ ...useCaseColumns, ...runtimeColumns })
    .from(runtimeIdentity)
    .innerJoin(useCase, eq(runtimeIdentity.useCaseId, useCase.id))
    .leftJoin(
      useCaseNumberAllocation,
      eq(useCaseNumberAllocation.useCaseId, useCase.id)
    )
    .where(eq(runtimeIdentity.id, runtimeId))
    .limit(1);
  return rows[0] ?? null;
}

async function resolveInstance(
  database: Database,
  column: typeof instance.id | typeof instance.tenantId,
  value: string
): Promise<CanonicalIdentity | null> {
  const rows = await database
    .select({ ...useCaseColumns, ...runtimeColumns })
    .from(instance)
    .innerJoin(useCase, eq(instance.useCaseId, useCase.id))
    .leftJoin(runtimeIdentity, eq(instance.runtimeIdentityId, runtimeIdentity.id))
    .leftJoin(
      useCaseNumberAllocation,
      eq(useCaseNumberAllocation.useCaseId, useCase.id)
    )
    .where(eq(column, value))
    .limit(1);
  return rows[0] ?? null;
}

async function resolveResource(
  database: Database,
  selector: Extract<CanonicalIdentitySelector, { type: "resource_binding" }>
): Promise<CanonicalIdentity | null> {
  const rows = await database
    .select({ ...useCaseColumns, ...runtimeColumns })
    .from(resourceBinding)
    .innerJoin(useCase, eq(resourceBinding.useCaseId, useCase.id))
    .leftJoin(
      runtimeIdentity,
      eq(resourceBinding.runtimeIdentityId, runtimeIdentity.id)
    )
    .leftJoin(
      useCaseNumberAllocation,
      eq(useCaseNumberAllocation.useCaseId, useCase.id)
    )
    .where(
      and(
        eq(resourceBinding.provider, selector.provider),
        eq(resourceBinding.kind, selector.kind),
        eq(resourceBinding.value, selector.value),
        ne(resourceBinding.state, "retired")
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export function createDrizzleCanonicalIdentityStore(
  database: Database = db
): CanonicalIdentityStore {
  return {
    async resolve(selector) {
      switch (selector.type) {
        case "use_case_id":
          return resolveUseCase(database, useCase.id, selector.value);
        case "runtime_id":
          return resolveRuntime(database, selector.value);
        case "use_case_number":
          return resolveUseCaseNumber(database, selector.value);
        case "instance_id":
          return resolveInstance(database, instance.id, selector.value);
        case "legacy_tenant_id":
          return resolveInstance(database, instance.tenantId, selector.value);
        case "resource_binding":
          return resolveResource(database, selector);
      }
    },
  };
}

export const canonicalIdentityStore = createDrizzleCanonicalIdentityStore();
