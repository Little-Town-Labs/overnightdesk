import {
  selectAgentDirectoryEntry,
  type AgentDirectory,
  type AgentDirectoryEntry,
} from "@/lib/open-webui-workspace";
import { isHermesTenant } from "@/lib/hermes-tenant";

export interface RuntimeLinkedInstance {
  runtimeIdentityId: string | null;
}

export interface RuntimeStatusInstance extends RuntimeLinkedInstance {
  status: string;
}

export type SelectedAgentResolution<T extends RuntimeLinkedInstance> =
  | {
      status: "available";
      agents: AgentDirectoryEntry[];
      selected: {
        agent: AgentDirectoryEntry;
        instance: T | null;
      };
    }
  | { status: "empty"; agents: [] }
  | { status: "unavailable" }
  | { status: "not_found" };

export function resolveSelectedAgentContext<T extends RuntimeLinkedInstance>(
  directory: AgentDirectory,
  requestedKey: string | undefined,
  instances: readonly T[],
): SelectedAgentResolution<T> {
  if (directory.status === "unavailable") return { status: "unavailable" };
  if (directory.agents.length === 0) return { status: "empty", agents: [] };

  const agent = selectAgentDirectoryEntry(directory.agents, requestedKey);
  if (!agent) return { status: "not_found" };

  const exactInstances = instances.filter(
    (candidate) => candidate.runtimeIdentityId === agent.runtimeIdentityId,
  );
  if (exactInstances.length > 1) return { status: "unavailable" };

  return {
    status: "available",
    agents: directory.agents,
    selected: {
      agent,
      instance: exactInstances[0] ?? null,
    },
  };
}

export function resolveUnambiguousLegacyInstance<
  T extends RuntimeLinkedInstance & { containerId: string | null },
>(instances: readonly T[]): T | null {
  if (instances.length !== 1) return null;
  const [onlyInstance] = instances;
  if (
    onlyInstance.runtimeIdentityId !== null ||
    isHermesTenant(onlyInstance)
  ) {
    return null;
  }
  return onlyInstance;
}

export function getSelectedAgentStatusLabel(
  agent: AgentDirectoryEntry,
  instance: RuntimeStatusInstance | null,
): string {
  if (instance?.status === "running") return "Online";
  if (agent.workspace) return "Workspace ready";
  if (agent.runtime.status === "active") return "Active";
  return agent.runtime.status[0].toUpperCase() + agent.runtime.status.slice(1);
}
