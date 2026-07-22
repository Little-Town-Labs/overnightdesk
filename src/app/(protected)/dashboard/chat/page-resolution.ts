import type { AgentDirectory } from "@/lib/open-webui-workspace";
import {
  resolveSelectedAgentContext,
  type RuntimeLinkedInstance,
  type SelectedAgentResolution,
} from "@/lib/selected-agent-context";

export function resolveAgentWorkspacePageContext<
  T extends RuntimeLinkedInstance,
>(
  directory: AgentDirectory,
  requestedKey: string | undefined,
  instances: readonly T[],
): SelectedAgentResolution<T> {
  if (
    requestedKey !== undefined &&
    directory.status === "available" &&
    directory.agents.length === 0
  ) {
    return { status: "not_found" };
  }

  const defaultKey =
    requestedKey ??
    (directory.status === "available"
      ? directory.agents.find((agent) => agent.workspace !== null)?.key
      : undefined);

  return resolveSelectedAgentContext(directory, defaultKey, instances);
}
