import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { instance } from "@/db/schema";
import type { AgentDirectory } from "@/lib/open-webui-workspace";

type InstanceRow = typeof instance.$inferSelect;

export type SelectedAgentInstance = Pick<
  InstanceRow,
  | "id"
  | "tenantId"
  | "useCaseId"
  | "runtimeIdentityId"
  | "status"
  | "containerId"
  | "subdomain"
  | "wizardState"
  | "claudeAuthStatus"
  | "hermesDashboardAuthStatus"
  | "hermesOidcClientId"
  | "engineApiKey"
>;

export interface SelectedAgentInstanceStore {
  listCanonicalInstances(
    runtimeIdentityIds: string[],
  ): Promise<SelectedAgentInstance[]>;
  listLegacyOwnerInstances(userId: string): Promise<SelectedAgentInstance[]>;
}

const safeInstanceColumns = {
  id: instance.id,
  tenantId: instance.tenantId,
  useCaseId: instance.useCaseId,
  runtimeIdentityId: instance.runtimeIdentityId,
  status: instance.status,
  containerId: instance.containerId,
  subdomain: instance.subdomain,
  wizardState: instance.wizardState,
  claudeAuthStatus: instance.claudeAuthStatus,
  hermesDashboardAuthStatus: instance.hermesDashboardAuthStatus,
  hermesOidcClientId: instance.hermesOidcClientId,
};

const databaseStore: SelectedAgentInstanceStore = {
  async listCanonicalInstances(runtimeIdentityIds) {
    if (runtimeIdentityIds.length === 0) return [];
    const rows = await db
      .select(safeInstanceColumns)
      .from(instance)
      .where(inArray(instance.runtimeIdentityId, runtimeIdentityIds));
    return rows.map((row) => ({ ...row, engineApiKey: null }));
  },
  listLegacyOwnerInstances(userId) {
    return db
      .select({ ...safeInstanceColumns, engineApiKey: instance.engineApiKey })
      .from(instance)
      .where(
        and(
          eq(instance.userId, userId),
          isNull(instance.useCaseId),
          isNull(instance.runtimeIdentityId),
        ),
      );
  },
};

export type SelectedAgentPageContext =
  | {
      status: "available";
      directory: AgentDirectory;
      instances: SelectedAgentInstance[];
    }
  | { status: "unavailable" };

export async function resolveSelectedAgentPageContext(
  userId: string,
  directory: AgentDirectory,
  store: SelectedAgentInstanceStore = databaseStore,
): Promise<SelectedAgentPageContext> {
  if (directory.status === "unavailable") return { status: "unavailable" };
  const authorized = new Map(
    directory.agents.map((agent) => [agent.runtimeIdentityId, agent.useCaseId]),
  );

  try {
    const [canonical, legacy] = await Promise.all([
      authorized.size > 0
        ? store.listCanonicalInstances([...authorized.keys()])
        : Promise.resolve([]),
      store.listLegacyOwnerInstances(userId),
    ]);
    const seen = new Set<string>();
    for (const candidate of canonical) {
      if (
        candidate.runtimeIdentityId === null ||
        candidate.useCaseId === null ||
        authorized.get(candidate.runtimeIdentityId) !== candidate.useCaseId ||
        seen.has(candidate.runtimeIdentityId)
      ) {
        return { status: "unavailable" };
      }
      seen.add(candidate.runtimeIdentityId);
    }
    if (
      legacy.some(
        (candidate) =>
          candidate.runtimeIdentityId !== null || candidate.useCaseId !== null,
      )
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "available",
      directory,
      instances: [...canonical, ...legacy],
    };
  } catch {
    return { status: "unavailable" };
  }
}
