import { isHermesTenant } from "@/lib/hermes-tenant";

interface DashboardNavigationInstance {
  containerId: string | null;
  runtimeIdentityId: string | null;
  status: string;
}

type AgentDirectorySummary =
  | { status: "available"; agentCount: number }
  | { status: "unavailable" };

export function resolveDashboardNavigationState({
  directory,
  instances,
}: {
  directory: AgentDirectorySummary;
  instances: readonly DashboardNavigationInstance[];
}) {
  const usesCanonicalAgentContext =
    (directory.status === "available" && directory.agentCount > 0) ||
    instances.some(
      (candidate) =>
        candidate.runtimeIdentityId !== null || isHermesTenant(candidate),
    );

  return {
    instanceRunning: instances.some((candidate) => candidate.status === "running"),
    usesCanonicalAgentContext,
  };
}
