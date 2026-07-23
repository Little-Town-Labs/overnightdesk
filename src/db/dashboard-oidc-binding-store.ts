import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { instance, resourceBinding } from "@/db/schema";

type Database = typeof db;

export type DashboardOidcBindingState = "active" | "rollback";

interface DashboardOidcBindingInstance {
  id: string;
  linkedClientId: string | null;
  useCaseId: string | null;
  runtimeIdentityId: string | null;
}

interface DashboardOidcBindingRecord {
  id: string;
  useCaseId: string;
  runtimeIdentityId: string | null;
  value: string;
  state: "active" | "compatibility" | "rollback" | "retired";
}

export interface DashboardOidcBindingSnapshot {
  instances: DashboardOidcBindingInstance[];
  bindings: DashboardOidcBindingRecord[];
}

export type DashboardOidcBindingPlan =
  | { status: "blocked" }
  | { status: "legacy_noop" }
  | {
      status: "insert";
      useCaseId: string;
      runtimeIdentityId: string;
      state: DashboardOidcBindingState;
    }
  | {
      status: "update";
      bindingId: string;
      state: DashboardOidcBindingState;
    }
  | { status: "verified" };

export function planDashboardOidcBinding(
  snapshot: DashboardOidcBindingSnapshot,
  clientId: string,
  desiredState: DashboardOidcBindingState,
): DashboardOidcBindingPlan {
  if (snapshot.instances.length !== 1 || !clientId) return { status: "blocked" };
  const target = snapshot.instances[0];
  if (target.linkedClientId !== clientId) return { status: "blocked" };

  const hasUseCase = target.useCaseId !== null;
  const hasRuntime = target.runtimeIdentityId !== null;
  if (hasUseCase !== hasRuntime) return { status: "blocked" };
  if (target.useCaseId === null || target.runtimeIdentityId === null) {
    return snapshot.bindings.length === 0
      ? { status: "legacy_noop" }
      : { status: "blocked" };
  }

  if (snapshot.bindings.length === 0) {
    return {
      status: "insert",
      useCaseId: target.useCaseId,
      runtimeIdentityId: target.runtimeIdentityId,
      state: desiredState,
    };
  }
  if (snapshot.bindings.length !== 1) return { status: "blocked" };

  const binding = snapshot.bindings[0];
  if (
    binding.value !== clientId ||
    binding.useCaseId !== target.useCaseId ||
    binding.runtimeIdentityId !== target.runtimeIdentityId
  ) {
    return { status: "blocked" };
  }
  if (binding.state === desiredState) return { status: "verified" };
  return { status: "update", bindingId: binding.id, state: desiredState };
}

async function inspectDashboardOidcBinding(
  instanceId: string,
  clientId: string,
  database: Database,
): Promise<DashboardOidcBindingSnapshot> {
  const [instances, bindings] = await Promise.all([
    database
      .select({
        id: instance.id,
        linkedClientId: instance.hermesOidcClientId,
        useCaseId: instance.useCaseId,
        runtimeIdentityId: instance.runtimeIdentityId,
      })
      .from(instance)
      .where(eq(instance.id, instanceId))
      .limit(2),
    database
      .select({
        id: resourceBinding.id,
        useCaseId: resourceBinding.useCaseId,
        runtimeIdentityId: resourceBinding.runtimeIdentityId,
        value: resourceBinding.value,
        state: resourceBinding.state,
      })
      .from(resourceBinding)
      .where(
        and(
          eq(resourceBinding.provider, "better-auth"),
          eq(resourceBinding.kind, "oidc_client"),
          eq(resourceBinding.value, clientId),
          ne(resourceBinding.state, "retired"),
        ),
      ),
  ]);
  return { instances, bindings };
}

export async function setDashboardOidcBindingState(
  instanceId: string,
  clientId: string,
  desiredState: DashboardOidcBindingState,
  database: Database = db,
): Promise<boolean> {
  try {
    const before = planDashboardOidcBinding(
      await inspectDashboardOidcBinding(instanceId, clientId, database),
      clientId,
      desiredState,
    );
    if (before.status === "blocked") return false;
    if (before.status === "legacy_noop" || before.status === "verified") {
      return true;
    }

    if (before.status === "insert") {
      try {
        await database.insert(resourceBinding).values({
          id: randomUUID(),
          useCaseId: before.useCaseId,
          runtimeIdentityId: before.runtimeIdentityId,
          provider: "better-auth",
          kind: "oidc_client",
          value: clientId,
          state: before.state,
        });
      } catch {
        // A concurrent exact writer may have won the unique live identifier.
      }
    } else {
      await database
        .update(resourceBinding)
        .set({ state: before.state, updatedAt: new Date() })
        .where(eq(resourceBinding.id, before.bindingId));
    }

    const after = planDashboardOidcBinding(
      await inspectDashboardOidcBinding(instanceId, clientId, database),
      clientId,
      desiredState,
    );
    return after.status === "verified" || after.status === "legacy_noop";
  } catch {
    return false;
  }
}
